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
  useRouteError,
  isRouteErrorResponse,
} from '@remix-run/react';
import { AppProvider } from '@shopify/shopify-app-remix/react';
import { NavMenu } from '@shopify/app-bridge-react';
import polarisStyles from '@shopify/polaris/build/esm/styles.css?url';
import {
  AppProvider as PolarisAppProvider,
  Page,
  Banner,
  Text,
  BlockStack,
} from '@shopify/polaris';
import enTranslations from '@shopify/polaris/locales/en.json';

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
        <Meta />
        <Links />
      </head>
      <body>
        <AppProvider isEmbeddedApp apiKey={apiKey}>
          <NavMenu>
            <Link to="/" rel="home">
              Dashboard
            </Link>
            <Link to="/settings/supabase">Impostazioni Supabase</Link>
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
        <Meta />
        <Links />
      </head>
      <body>
        <PolarisAppProvider i18n={enTranslations}>
          <Page title="Supabase Tracking Sync">
            <BlockStack gap="400">
              <Banner tone="critical" title={title}>
                <Text as="p">{detail}</Text>
              </Banner>
            </BlockStack>
          </Page>
        </PolarisAppProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
