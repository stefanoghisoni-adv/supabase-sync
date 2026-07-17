// app/routes/api.supabase.create-project.tsx
import type { ActionFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { authenticate } from '~/shopify.server';
import { prisma } from '~/db.server';
import { encrypt } from '~/utils/crypto.server';
import { getValidAccessToken } from '~/lib/supabase-oauth.server';
import { listProjects, listOrganizations, createProject } from '~/lib/supabase-management.server';
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

    // Ricava l'organization_id senza dipendere dallo scope "Organizations"
    // (non concesso): i progetti esistenti — leggibili con Projects:Read, già
    // concesso — portano già l'organization_id. Solo per account a zero progetti
    // si ricade su listOrganizations, che richiede lo scope dedicato.
    let organizationId: string | undefined;
    const projects = await listProjects(token);
    if (projects.length > 0) {
      organizationId = projects[0].organization_id;
    } else {
      try {
        const orgs = await listOrganizations(token);
        organizationId = orgs[0]?.id;
      } catch {
        return json(
          {
            ok: false,
            error:
              "Non riesco a determinare l'organizzazione: crea il primo progetto dalla dashboard Supabase, poi ricollega.",
            code: 'no_org',
          },
          { status: 400 },
        );
      }
    }
    if (!organizationId) {
      return json({ ok: false, error: 'Nessuna organizzazione Supabase trovata.' }, { status: 400 });
    }

    const dbPass = generateDbPassword();
    const { ref } = await createProject(token, {
      name: body.name,
      organizationId,
      region: body.region,
      dbPass,
    });

    // Il progetto è ormai creato su Supabase. Il salvataggio di ref/password è
    // "best effort": se fallisce (es. colonne di migrazione mancanti nel DB
    // metadata) NON buttiamo via il lavoro — il polling prosegue e select-project
    // completerà comunque il collegamento (non usa queste colonne).
    try {
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
    } catch (saveErr) {
      console.warn(
        '[api.supabase.create-project] progetto creato ma salvataggio ref/password fallito (migrazione supabase_configs mancante?):',
        saveErr instanceof Error ? saveErr.message : 'errore sconosciuto',
      );
    }

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
