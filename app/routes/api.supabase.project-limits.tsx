// Verifica se il piano Supabase del merchant consente ancora di creare progetti.
// Alimenta il loader del pulsante "Crea nuovo progetto" e, a limite raggiunto,
// il banner di avviso con il pulsante verso il billing.
import type { LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { authenticate } from '~/shopify.server';
import { prisma } from '~/db.server';
import { getValidAccessToken } from '~/lib/supabase-oauth.server';
import {
  listProjects,
  listOrganizations,
  getOrganizationPlan,
  countsTowardsPlanLimit,
  organizationBillingUrl,
  SUPABASE_PLAN_LABELS,
  SUPABASE_PLAN_PROJECT_LIMITS,
} from '~/lib/supabase-management.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) throw new Response('Shop non trovato', { status: 404 });

  try {
    const token = await getValidAccessToken(shop.id);
    const projects = await listProjects(token);

    // Stessa strategia della creazione progetto: lo slug dell'organizzazione lo
    // ricaviamo dai progetti esistenti (scope Projects:Read, gia' concesso) e
    // ricadiamo su listOrganizations solo per account a zero progetti.
    let orgSlug: string | null = projects[0]?.organization_slug ?? null;
    if (!orgSlug) {
      try {
        const orgs = await listOrganizations(token);
        orgSlug = orgs[0]?.id ?? null;
      } catch {
        orgSlug = null;
      }
    }

    const activeProjects = projects.filter(
      (p) => p.organization_slug === orgSlug && countsTowardsPlanLimit(p.status),
    ).length;

    const plan = orgSlug ? await getOrganizationPlan(token, orgSlug) : null;
    const maxProjects = plan ? SUPABASE_PLAN_PROJECT_LIMITS[plan] : null;

    // limitReached solo quando sappiamo DAVVERO il piano e il suo limite: senza
    // lo scope Organizations non conosciamo il piano, e bloccare la creazione
    // sulla base di un limite ipotizzato sarebbe peggio che lasciar provare
    // (Supabase rifiuterebbe comunque, con il suo messaggio).
    const limitReached = maxProjects !== null && activeProjects >= maxProjects;

    return json({
      ok: true as const,
      plan,
      planLabel: plan ? SUPABASE_PLAN_LABELS[plan] : null,
      activeProjects,
      maxProjects,
      limitReached,
      billingUrl: orgSlug ? organizationBillingUrl(orgSlug) : null,
    });
  } catch (e) {
    console.error(
      '[api.supabase.project-limits]',
      e instanceof Error ? e.message : 'errore sconosciuto',
    );
    // Non blocchiamo il flusso: se il controllo non riesce, la creazione resta
    // possibile e l'eventuale rifiuto arrivera' da Supabase.
    return json({
      ok: false as const,
      plan: null,
      planLabel: null,
      activeProjects: 0,
      maxProjects: null,
      limitReached: false,
      billingUrl: null,
    });
  }
}
