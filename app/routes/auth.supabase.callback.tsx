import type { LoaderFunctionArgs } from '@remix-run/node';
import { verifyState, saveTokens } from '~/lib/supabase-oauth.server';
import { exchangeCode } from '~/lib/supabase-management.server';

function closePage(message: Record<string, unknown>, appOrigin: string): Response {
  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<script>
(function () {
  try {
    if (window.opener) {
      window.opener.postMessage(${JSON.stringify(message)}, ${JSON.stringify(appOrigin)});
    }
  } catch (e) {}
  window.close();
})();
</script>
<p>Puoi chiudere questa finestra.</p>
</body></html>`;
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const appOrigin = new URL(process.env.SHOPIFY_APP_URL || url.origin).origin;

  const error = url.searchParams.get('error');
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (error) {
    return closePage({ type: 'supabase-oauth', ok: false, error }, appOrigin);
  }
  if (!code || !state) {
    return closePage(
      { type: 'supabase-oauth', ok: false, error: 'missing_code_or_state' },
      appOrigin,
    );
  }

  const verified = verifyState(state);
  if (!verified) {
    return closePage({ type: 'supabase-oauth', ok: false, error: 'invalid_state' }, appOrigin);
  }

  try {
    const tokens = await exchangeCode({
      code,
      clientId: process.env.SUPABASE_OAUTH_CLIENT_ID || '',
      clientSecret: process.env.SUPABASE_OAUTH_CLIENT_SECRET || '',
      redirectUri: `${appOrigin}/auth/supabase/callback`,
    });
    await saveTokens(verified.shopId, tokens);
    return closePage({ type: 'supabase-oauth', ok: true }, appOrigin);
  } catch (e) {
    console.error('[supabase callback] exchange fallito:', e);
    return closePage({ type: 'supabase-oauth', ok: false, error: 'exchange_failed' }, appOrigin);
  }
}
