import type { ActionFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { authenticate } from '~/shopify.server';
import { prisma } from '~/db.server';
import { encrypt } from '~/utils/crypto.server';
import { getValidAccessToken } from '~/lib/supabase-oauth.server';
import {
  getProjectApiKeys,
  runQuery,
  projectUrl,
} from '~/lib/supabase-management.server';
import { buildMerchantSchemaSQL } from '~/lib/supabase-schema';
import { isAuthorized } from '~/utils/authorization.server';
import { issueReadProxyToken } from '~/lib/read-proxy/token.server';

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
  });
  if (!shop) {
    return json({ ok: false, error: 'Shop non trovato' }, { status: 404 });
  }

  // Tabelle da garantire in base al piano: products sempre, customers solo se
  // la sincronizzazione clienti è inclusa.
  const plan = await prisma.plan.findUnique({
    where: { planName: shop.currentPlan },
  });
  const includeCustomers = plan?.customersSyncEnabled ?? false;
  if (!isAuthorized(shop.authorization)) {
    return json(
      { ok: false, error: "L'utilizzo dell'app è sospeso per questo negozio.", code: 'not_authorized' },
      { status: 403 },
    );
  }

  const body = (await request.json()) as { ref?: unknown };
  if (!body.ref || typeof body.ref !== 'string') {
    return json({ ok: false, error: 'ref del progetto mancante' }, { status: 400 });
  }
  const ref = body.ref;

  try {
    const token = await getValidAccessToken(shop.id);
    const keys = await getProjectApiKeys(token, ref);
    const url = projectUrl(ref);

    await prisma.supabaseConfig.upsert({
      where: { shopId: shop.id },
      create: {
        shopId: shop.id,
        supabaseUrl: url,
        supabasePublicKey: encrypt(keys.anon),
        supabaseServiceRoleKey: encrypt(keys.serviceRole),
        // Il ref è la sola fonte dell'host di inoltro del proxy di lettura:
        // senza, ogni lettura di tracciamento risponderebbe "non collegato".
        supabaseProjectRef: ref,
      },
      update: {
        supabaseUrl: url,
        supabasePublicKey: encrypt(keys.anon),
        supabaseServiceRoleKey: encrypt(keys.serviceRole),
        supabaseProjectRef: ref,
      },
    });

    // DDL idempotente e non distruttivo: crea le tabelle mancanti e allinea le
    // colonne di quelle già esistenti (progetto pre-esistente) senza cancellare
    // i dati. Applica solo le tabelle abilitate dal piano.
    await runQuery(token, ref, buildMerchantSchemaSQL(includeCustomers));

    // Abilita la sincronizzazione al collegamento: senza syncEnabled i
    // processor rifiutano il job. Le successive sync automatiche seguono
    // l'intervallo impostato in Impostazioni.
    await prisma.supabaseConfig.update({
      where: { shopId: shop.id },
      data: { connectionVerifiedAt: new Date(), syncEnabled: true },
    });

    // Emette il token-proxy per le letture di tracciamento se lo shop non ne ha
    // già uno: una riconnessione mantiene il token esistente, così il merchant
    // non deve riconfigurare Stape/GTM.
    //
    // Best effort, come il salvataggio di ref/password in create-project: a
    // questo punto il collegamento è già completo e funzionante, e un errore
    // qui (timeout del pooler, colonne di migrazione mancanti) NON deve farlo
    // finire nel catch, che azzererebbe connectionVerifiedAt e costringerebbe a
    // rieseguire la DDL. Se il token non viene emesso, il merchant lo genera
    // dalle Impostazioni.
    try {
      const existing = await prisma.shop.findUnique({
        where: { id: shop.id },
        select: { readProxyTokenHash: true },
      });
      if (!existing?.readProxyTokenHash) {
        await issueReadProxyToken(shop.id);
      }
    } catch (tokenErr) {
      console.warn(
        '[api.supabase.select-project] collegamento riuscito ma emissione del token-proxy fallita:',
        tokenErr instanceof Error ? tokenErr.message : 'errore sconosciuto',
      );
    }

    return json({ ok: true });
  } catch (e) {
    console.error('[api.supabase.select-project]', e instanceof Error ? e.message : 'errore sconosciuto');
    await prisma.supabaseConfig
      .update({ where: { shopId: shop.id }, data: { connectionVerifiedAt: null } })
      .catch(() => {});
    return json(
      { ok: false, error: 'Impossibile completare il collegamento. Riprova.' },
      { status: 500 },
    );
  }
}
