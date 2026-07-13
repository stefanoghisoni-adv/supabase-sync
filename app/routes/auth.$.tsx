import type { LoaderFunctionArgs } from '@remix-run/node';
import { authenticate } from '~/shopify.server';

// OAuth catch-all: handles /auth and /auth/callback. authenticate.admin drives
// the install/login flow and persists the session via PrismaSessionStorage.
export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request);
  return null;
}
