import { describe, it, expect } from 'vitest';
import {
  PRODUCTS_TABLE_SQL,
  CUSTOMERS_TABLE_SQL,
  MERCHANT_TABLES_SQL,
  buildMerchantSchemaSQL,
  buildOrdersSchemaSQL,
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

  it('allinea gli schemi datati con ADD COLUMN IF NOT EXISTS senza DROP', () => {
    // Aggiorna colonne nuove su tabelle pre-esistenti senza toccare i dati.
    expect(PRODUCTS_TABLE_SQL).toContain(
      'ADD COLUMN IF NOT EXISTS cost_per_item',
    );
    expect(PRODUCTS_TABLE_SQL).toContain(
      'ADD COLUMN IF NOT EXISTS inventory_tracked',
    );
    // La PK non viene mai ri-aggiunta e non ci sono operazioni distruttive.
    expect(PRODUCTS_TABLE_SQL).not.toContain('ADD COLUMN IF NOT EXISTS id ');
    expect(PRODUCTS_TABLE_SQL).not.toMatch(/DROP\s+(TABLE|COLUMN)/i);
  });

  it('buildMerchantSchemaSQL include customers solo se il piano lo abilita', () => {
    const withCustomers = buildMerchantSchemaSQL(true);
    const withoutCustomers = buildMerchantSchemaSQL(false);
    expect(withCustomers).toContain('CREATE TABLE IF NOT EXISTS customers');
    expect(withoutCustomers).toContain('CREATE TABLE IF NOT EXISTS products');
    expect(withoutCustomers).not.toContain('CREATE TABLE IF NOT EXISTS customers');
  });
});

describe('tabelle degli ordini', () => {
  const sql = buildOrdersSchemaSQL();

  it('crea ordini e righe senza toccare quel che c e', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS orders');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS order_lines');
    expect(sql).not.toContain('DROP');
  });

  it('il costo non sta nelle righe: si legge dai prodotti quando serve', () => {
    // E' la ragione per cui compilare un costo oggi aggiorna il profitto di
    // ieri. Salvarlo qui congelerebbe la storia.
    expect(sql).not.toContain('cost_per_item');
    expect(sql).toContain('shopify_variant_id');
  });

  it('degli ordini non si prende un dato personale in piu del necessario', () => {
    // Nome e cognome servono a dire di chi si parla; indirizzi, telefoni ed
    // email no.
    expect(sql).toContain('customer_first_name');
    expect(sql).not.toContain('address');
    expect(sql).not.toContain('phone');
    expect(sql).not.toMatch(/\bemail\b/);
  });

  it('RLS accesa su entrambe, come per le altre tabelle', () => {
    expect(sql.match(/ENABLE ROW LEVEL SECURITY/g)).toHaveLength(2);
  });
});

describe('buildMerchantSchemaSQL', () => {
  it('gli ordini si creano solo quando li si potra riempire', () => {
    expect(buildMerchantSchemaSQL(true)).not.toContain('CREATE TABLE IF NOT EXISTS orders');
    expect(buildMerchantSchemaSQL(true, true)).toContain('CREATE TABLE IF NOT EXISTS orders');
  });
});
