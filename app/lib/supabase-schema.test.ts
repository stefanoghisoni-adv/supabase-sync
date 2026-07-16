import { describe, it, expect } from 'vitest';
import {
  PRODUCTS_TABLE_SQL,
  CUSTOMERS_TABLE_SQL,
  MERCHANT_TABLES_SQL,
} from './supabase-schema';

describe('supabase-schema', () => {
  it('MERCHANT_TABLES_SQL è la concatenazione di PRODUCTS + CUSTOMERS', () => {
    expect(MERCHANT_TABLES_SQL).toBe(PRODUCTS_TABLE_SQL + CUSTOMERS_TABLE_SQL);
  });

  it('il DDL products crea la tabella products con cost_per_item', () => {
    expect(PRODUCTS_TABLE_SQL).toContain('CREATE TABLE IF NOT EXISTS products');
    expect(PRODUCTS_TABLE_SQL).toContain('cost_per_item');
  });

  it('il DDL customers crea la tabella customers con shopify_customer_id', () => {
    expect(CUSTOMERS_TABLE_SQL).toContain('CREATE TABLE IF NOT EXISTS customers');
    expect(CUSTOMERS_TABLE_SQL).toContain('shopify_customer_id');
  });
});
