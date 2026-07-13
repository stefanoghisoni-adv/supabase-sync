import type { LinksFunction } from '@remix-run/node';
import { json } from '@remix-run/node';
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
} from '@remix-run/react';
import { AppProvider } from '@shopify/shopify-app-remix/react';
import polarisStyles from '@shopify/polaris/build/esm/styles.css?url';

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
          <Outlet />
        </AppProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
