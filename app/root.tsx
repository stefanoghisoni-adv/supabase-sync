import type { LinksFunction } from '@remix-run/node';
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
import { Page, Banner, Text, BlockStack } from '@shopify/polaris';

export const links: LinksFunction = () => [
  { rel: 'stylesheet', href: polarisStyles },
];

export async function loader() {
  // apiKey is the public Client ID; safe to expose to the embedded frontend.
  return json({ apiKey: process.env.SHOPIFY_API_KEY || '' });
}

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <html lang="en">
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
        <AppProvider isEmbeddedApp apiKey={apiKey}>
          <NavMenu>
            <Link to="/" rel="home">
              Dashboard
            </Link>
            <Link to="/products/issues">Prodotti con problemi</Link>
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

  let title = 'Si è verificato un errore';
  let detail = 'Errore sconosciuto';

  if (isRouteErrorResponse(error)) {
    title = `Errore ${error.status} ${error.statusText}`;
    detail =
      typeof error.data === 'string'
        ? error.data
        : JSON.stringify(error.data);
  } else if (error instanceof Error) {
    detail = error.message;
  }

  return (
    <html lang="it">
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
        <AppProvider isEmbeddedApp apiKey={apiKey}>
          <NavMenu>
            <Link to="/" rel="home">
              Dashboard
            </Link>
            <Link to="/products/issues">Prodotti con problemi</Link>
            <Link to="/settings/supabase">Impostazioni</Link>
          </NavMenu>
          <Page title="Supabase Tracking Sync">
            <BlockStack gap="400">
              <Banner tone="critical" title={title}>
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
