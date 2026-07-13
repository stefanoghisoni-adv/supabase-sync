import type { LoaderFunctionArgs } from '@remix-run/node';
import { authenticate, login } from '~/shopify.server';

// OAuth catch-all: handles /auth, /auth/login, and /auth/callback.
// /auth/login must use shopify.login(), other paths use authenticate.admin.
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);

  if (url.pathname === '/auth/login') {
    return await login(request);
  }

  await authenticate.admin(request);
  return null;
}
