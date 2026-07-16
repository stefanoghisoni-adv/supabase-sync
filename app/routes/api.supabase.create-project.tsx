// app/routes/api.supabase.create-project.tsx
import type { ActionFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { authenticate } from '~/shopify.server';
import { prisma } from '~/db.server';
import { encrypt } from '~/utils/crypto.server';
import { getValidAccessToken } from '~/lib/supabase-oauth.server';
import { listOrganizations, createProject } from '~/lib/supabase-management.server';
import { generateDbPassword } from '~/lib/password.server';

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) return json({ ok: false, error: 'Shop non trovato' }, { status: 404 });

  const body = (await request.json()) as { name?: unknown; region?: unknown };
  if (!body.name || typeof body.name !== 'string' || !body.region || typeof body.region !== 'string') {
    return json({ ok: false, error: 'Nome e region sono obbligatori' }, { status: 400 });
  }

  try {
    const token = await getValidAccessToken(shop.id);
    const orgs = await listOrganizations(token);
    if (orgs.length === 0) {
      return json({ ok: false, error: 'Nessuna organizzazione Supabase trovata' }, { status: 400 });
    }
    const dbPass = generateDbPassword();
    const { ref } = await createProject(token, {
      name: body.name,
      organizationId: orgs[0].id,
      region: body.region,
      dbPass,
    });

    await prisma.supabaseConfig.upsert({
      where: { shopId: shop.id },
      create: {
        shopId: shop.id,
        supabaseUrl: `https://${ref}.supabase.co`,
        supabasePublicKey: '',
        supabaseServiceRoleKey: '',
        supabaseProjectRef: ref,
        supabaseDbPassword: encrypt(dbPass),
      },
      update: {
        supabaseProjectRef: ref,
        supabaseDbPassword: encrypt(dbPass),
      },
    });

    return json({ ok: true, ref, password: dbPass });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'errore sconosciuto';
    console.error('[api.supabase.create-project]', msg);
    // 403 = scope Projects:Write mancante nella OAuth App.
    if (msg.includes('403')) {
      return json(
        { ok: false, error: 'Permesso insufficiente per creare progetti. Ricollega Supabase.', code: 'scope' },
        { status: 403 },
      );
    }
    return json({ ok: false, error: 'Creazione del progetto non riuscita. Riprova.' }, { status: 502 });
  }
}
