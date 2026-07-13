import type { ActionFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { createClient } from '@supabase/supabase-js';
import { authenticate } from '~/shopify.server';
import { validateSupabaseUrl } from '~/utils/supabase-url.server';

export async function action({ request }: ActionFunctionArgs) {
  // Only authenticated merchants may probe a Supabase connection.
  await authenticate.admin(request);

  const body = await request.json();
  const { url, serviceRoleKey } = body;

  if (!url || !serviceRoleKey) {
    return json(
      { ok: false, message: 'Missing url or serviceRoleKey' },
      { status: 400 }
    );
  }

  const urlCheck = validateSupabaseUrl(url);
  if (!urlCheck.ok) {
    return json({ ok: false, message: urlCheck.error }, { status: 400 });
  }

  try {
    const supabase = createClient(urlCheck.url!, serviceRoleKey);

    // Test connection by probing an internal Supabase table
    const { error } = await supabase
      .from('_prisma_migrations')
      .select('*', { count: 'exact', head: true });

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = table not found (still means the connection works)
      throw error;
    }

    return json({ ok: true, message: 'Connection successful' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Connection failed';
    return json({ ok: false, message }, { status: 400 });
  }
}
