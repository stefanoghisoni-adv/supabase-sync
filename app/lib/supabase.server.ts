import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { SupabaseConfig } from '@prisma/client';
import { decrypt } from '../utils/crypto.server';

export function createSupabaseClient(config: SupabaseConfig): SupabaseClient {
  const publicKey = decrypt(config.supabasePublicKey);
  const serviceRoleKey = decrypt(config.supabaseServiceRoleKey);

  return createClient(config.supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
