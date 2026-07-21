import type { LoaderFunctionArgs } from '@remix-run/node';
import { extractReadProxyToken } from '~/lib/read-proxy/token.server';
import { resolveShopReadContext } from '~/lib/read-proxy/context.server';
import {
  allowedReadTables,
  forwardRead,
  selectEmbedsForbiddenTable,
} from '~/lib/read-proxy/forward.server';

// Risposta di blocco: JSON minimale. Stape tratta ogni status non 2xx come
// "nessun dato", quindi il tracciamento prosegue senza errori all'utente finale.
function deny(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Proxy di lettura Supabase-compatibile. Definendo SOLO il loader, ogni metodo
// diverso da GET/HEAD riceve 405 da Remix.
export async function loader({ request, params }: LoaderFunctionArgs) {
  const token = extractReadProxyToken(request);
  if (!token) return deny(401, 'Token di lettura mancante.');

  const result = await resolveShopReadContext(token);
  if (result.kind === 'unknown') return deny(401, 'Token di lettura non valido.');
  if (result.kind === 'not_configured') return deny(409, 'Supabase non collegato.');

  const { ctx } = result;
  // Gate fail-closed: solo un ENABLED esatto passa (vedi grantsDataAccess).
  if (!ctx.canReadData) {
    return deny(403, 'Accesso ai dati sospeso per questo negozio.');
  }

  const table = params.table ?? '';
  const allowed = allowedReadTables(ctx.customersEnabled);
  if (!allowed.includes(table)) {
    return deny(403, 'Tabella non disponibile.');
  }

  const search = new URL(request.url).search;
  // L'allowlist sul path non copre l'embedding PostgREST dentro `select`.
  if (selectEmbedsForbiddenTable(search, allowed)) {
    return deny(403, 'Tabella non disponibile.');
  }

  const { status, body, contentType } = await forwardRead(ctx, table, search);
  return new Response(body, { status, headers: { 'Content-Type': contentType } });
}
