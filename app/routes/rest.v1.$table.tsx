import type { LoaderFunctionArgs } from '@remix-run/node';
import { extractReadProxyToken } from '~/lib/read-proxy/token.server';
import { resolveShopReadContext } from '~/lib/read-proxy/context.server';
import {
  allowedReadTables,
  forwardRead,
  selectEmbedsForbiddenTable,
  selectEmbedsCustomers,
} from '~/lib/read-proxy/forward.server';
import {
  isCustomerIdentifierLookup,
  consentCheckSearch,
  forceConsentedOnlySearch,
  rowsHaveNonConsented,
} from '~/lib/read-proxy/customer-consent.server';

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

  // Il consenso clienti vale solo al top-level: un customers embeddato aggirerebbe
  // il gate, quindi lo vietiamo sempre (difesa in profondità: oggi lo schema non
  // ha FK, ma un progetto merchant preesistente potrebbe averne).
  if (selectEmbedsCustomers(search)) {
    return deny(403, 'Tabella non disponibile.');
  }

  // Enforcement consenso marketing: solo la tabella customers.
  let forwardSearch = search;
  if (table === 'customers') {
    if (isCustomerIdentifierLookup(search)) {
      // Lookup mirato: verifica il consenso del cliente puntato con la
      // service_role. Il corpo del controllo NON viene restituito al chiamante.
      const check = await forwardRead(ctx, 'customers', consentCheckSearch(search));
      if (check.status !== 200) {
        return deny(403, "L'utente non ha acconsentito al marketing su Shopify");
      }
      let rows: Array<{ accepts_marketing?: unknown }>;
      try {
        rows = JSON.parse(check.body);
        if (!Array.isArray(rows)) throw new Error('non-array');
      } catch {
        // Fail-closed: risposta di controllo non interpretabile → nega.
        return deny(403, "L'utente non ha acconsentito al marketing su Shopify");
      }
      if (rowsHaveNonConsented(rows)) {
        return deny(403, "L'utente non ha acconsentito al marketing su Shopify");
      }
      // Consenzienti (o nessuna corrispondenza) → inoltra la query originale.
    } else {
      // Lettura non mirata: restituisci solo i consenzienti.
      forwardSearch = forceConsentedOnlySearch(search);
    }
  }

  const { status, body, contentType } = await forwardRead(ctx, table, forwardSearch);
  return new Response(body, { status, headers: { 'Content-Type': contentType } });
}
