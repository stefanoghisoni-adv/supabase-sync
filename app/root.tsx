import type { LinksFunction, LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import {
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
  useRouteLoaderData,
  useRouteError,
  isRouteErrorResponse,
} from '@remix-run/react';
import { AppProvider } from '@shopify/shopify-app-remix/react';
import { NavMenu } from '@shopify/app-bridge-react';
import polarisStyles from '@shopify/polaris/build/esm/styles.css?url';
import vizStyles from '@shopify/polaris-viz/build/esm/styles.css?url';
// Caricato DOPO Polaris: neutralizza il tema scuro (vedi force-light.css).
import forceLightStyles from './force-light.css?url';
// Impaginazioni che Polaris non esprime con una prop (vedi dashboard.css).
import dashboardStyles from './dashboard.css?url';
import { Page, Banner, Text, BlockStack } from '@shopify/polaris';
import { authenticate } from './shopify.server';
import { prisma } from './db.server';
import { canAccessPlanTab } from './components/Billing/plan-access';

export const links: LinksFunction = () => [
  { rel: 'stylesheet', href: polarisStyles },
  { rel: 'stylesheet', href: vizStyles },
  { rel: 'stylesheet', href: forceLightStyles },
  { rel: 'stylesheet', href: dashboardStyles },
];

export async function loader({ request }: LoaderFunctionArgs) {
  // apiKey is the public Client ID; safe to expose to the embedded frontend.
  const apiKey = process.env.SHOPIFY_API_KEY || '';

  // La NavMenu vive qui, quindi il piano corrente serve gia' in root per decidere
  // se mostrare la voce "Piano". Ogni rotta UI autentica comunque, quindi non
  // stiamo introducendo un controllo nuovo: qui aggiungiamo solo la lettura.
  try {
    const { session } = await authenticate.admin(request);
    const shop = await prisma.shop.findUnique({
      where: { shopDomain: session.shop },
      select: { currentPlan: true },
    });
    return json({ apiKey, canSeePlanTab: canAccessPlanTab(shop?.currentPlan) });
  } catch (error) {
    // I redirect di OAuth/App Bridge sono Response lanciate: devono passare
    // intatte. Un guasto diverso (es. DB irraggiungibile) non deve far fallire
    // l'intera app per una voce di menu: la rotta /plan si difende comunque da se'.
    if (error instanceof Response) throw error;
    return json({ apiKey, canSeePlanTab: true });
  }
}

export default function App() {
  const { apiKey, canSeePlanTab } = useLoaderData<typeof loader>();

  return (
    // className p-theme-light nel JSX, non solo via App Bridge a runtime: così
    // React tiene ferma la classe del tema chiaro anche durante un render
    // d'errore, senza dipendere dal momento in cui App Bridge la applica.
    <html lang="it" className="p-theme-light">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* Forza sempre il tema chiaro: Polaris è light-only e non vogliamo che
            il canvas del browser in dark mode traspaia dietro le superfici. */}
        <meta name="color-scheme" content="light" />
        <style
          dangerouslySetInnerHTML={{
            __html:
              ':root,html,body{color-scheme:light !important}html,body{background:#f1f1f1 !important}',
          }}
        />
        <Meta />
        <Links />
      </head>
      <body>
        <AppProvider isEmbeddedApp apiKey={apiKey} theme="light">
          <NavMenu>
            <Link to="/" rel="home">
              Dashboard
            </Link>
            <Link to="/products/issues">Prodotti non idonei</Link>
            <Link to="/logs">Logs</Link>
            {/* Nascosta sui piani senza nulla da acquistare (lifetime). */}
            {canSeePlanTab && <Link to="/plan">Piano</Link>}
            <Link to="/settings/supabase">Impostazioni</Link>
          </NavMenu>
          <Outlet />
        </AppProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  // Il loader di root normalmente riesce anche quando una rotta figlia lancia:
  // recuperiamo apiKey per mantenere il frame embedded (App Bridge + NavMenu).
  const rootData = useRouteLoaderData<typeof loader>('root');
  const apiKey = rootData?.apiKey || '';
  // Se anche il loader di root e' saltato non sappiamo il piano: meglio mostrare
  // la voce (chi non deve entrarci trova comunque la rotta bloccata) che toglierla
  // a chi invece vuole fare upgrade.
  const canSeePlanTab = rootData?.canSeePlanTab ?? true;

  let title = 'Si è verificato un errore';
  let detail = 'Errore sconosciuto';
  // Un errore di rete lato client ("Failed to fetch") non è un guasto dell'app:
  // è la connessione dell'utente caduta durante una richiesta. Va trattato come
  // transitorio e recuperabile, non con un allarme rosso da errore fatale.
  let transient = false;

  if (isRouteErrorResponse(error)) {
    title = `Errore ${error.status} ${error.statusText}`;
    detail =
      typeof error.data === 'string'
        ? error.data
        : JSON.stringify(error.data);
  } else if (error instanceof Error) {
    detail = error.message;
    if (/failed to fetch|networkerror|load failed/i.test(error.message)) {
      transient = true;
      title = 'Connessione assente';
      detail =
        'Non è stato possibile raggiungere il server: controlla la connessione e riprova.';
    }
  }

  return (
    <html lang="it" className="p-theme-light">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light" />
        <style
          dangerouslySetInnerHTML={{
            __html:
              ':root,html,body{color-scheme:light !important}html,body{background:#f1f1f1 !important}',
          }}
        />
        <Meta />
        <Links />
      </head>
      <body>
        <AppProvider isEmbeddedApp apiKey={apiKey} theme="light">
          <NavMenu>
            <Link to="/" rel="home">
              Dashboard
            </Link>
            <Link to="/products/issues">Prodotti non idonei</Link>
            <Link to="/logs">Logs</Link>
            {canSeePlanTab && <Link to="/plan">Piano</Link>}
            <Link to="/settings/supabase">Impostazioni</Link>
          </NavMenu>
          <Page title="Supabase Tracking Sync">
            <BlockStack gap="400">
              {/* Warning (non critical) per i blip di rete: il pulsante ricarica
                  l'app senza costringere l'utente a uscire e rientrare. */}
              <Banner
                tone={transient ? 'warning' : 'critical'}
                title={title}
                action={
                  transient
                    ? { content: 'Riprova', onAction: () => window.location.reload() }
                    : undefined
                }
              >
                <Text as="p">{detail}</Text>
              </Banner>
            </BlockStack>
          </Page>
        </AppProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
