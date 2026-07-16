import { describe, it, expect, vi } from 'vitest';
import { createSupabaseClient } from './supabase.server';
import type { SupabaseConfig } from '@prisma/client';

vi.mock('../utils/crypto.server', () => ({
  decrypt: (ciphertext: string) => {
    if (ciphertext === 'encrypted_public') return 'public_key_decrypted';
    if (ciphertext === 'encrypted_service') return 'service_key_decrypted';
    return ciphertext;
  },
}));

describe('Supabase client factory', () => {
  it('should create Supabase client with decrypted keys', () => {
    const config: SupabaseConfig = {
      id: 'test-id',
      shopId: 'shop-id',
      supabaseUrl: 'https://test.supabase.co',
      supabasePublicKey: 'encrypted_public',
      supabaseServiceRoleKey: 'encrypted_service',
      supabaseDbPassword: null,
      supabaseProjectRef: null,
      tableNameProducts: 'products',
      tableNameCustomers: 'customers',
      syncEnabled: true,
      syncIntervalHours: 24,
      connectionVerifiedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const client = createSupabaseClient(config);

    expect(client).toBeDefined();
    expect(client.from).toBeDefined(); // Supabase client has .from method
  });
});
