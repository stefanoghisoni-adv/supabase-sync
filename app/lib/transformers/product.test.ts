import { describe, it, expect } from 'vitest';
import { transformProduct } from './product.server';
import type { ShopifyProduct } from '~/types/shopify';

describe('Product transformer', () => {
  it('should transform product with variants into multiple rows', () => {
    const shopifyProduct: ShopifyProduct = {
      id: 123,
      title: 'Test Product',
      body_html: '<p>Description</p>',
      vendor: 'Test Vendor',
      product_type: 'Test Type',
      handle: 'test-product',
      status: 'active',
      tags: 'tag1, tag2',
      published_at: '2026-07-11T10:00:00Z',
      variants: [
        {
          id: 456,
          product_id: 123,
          title: 'Red / M',
          sku: 'TEST-RED-M',
          barcode: '123456789',
          price: '29.99',
          compare_at_price: '39.99',
          cost: '15.00',
          position: 1,
          inventory_quantity: 10,
          weight: 0.5,
          weight_unit: 'kg',
          requires_shipping: true,
          taxable: true,
          image_id: null,
          option1: 'Red',
          option2: 'M',
          option3: null,
        },
        {
          id: 789,
          product_id: 123,
          title: 'Blue / L',
          sku: 'TEST-BLUE-L',
          barcode: null,
          price: '29.99',
          compare_at_price: null,
          cost: '15.00',
          position: 2,
          inventory_quantity: 5,
          weight: 0.5,
          weight_unit: 'kg',
          requires_shipping: true,
          taxable: true,
          image_id: null,
          option1: 'Blue',
          option2: 'L',
          option3: null,
        },
      ],
    };

    const rows = transformProduct(shopifyProduct);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      shopify_product_id: 123,
      shopify_variant_id: 456,
      is_variant: true,
      product_title: 'Test Product',
      variant_title: 'Red / M',
      sku: 'TEST-RED-M',
      price: 29.99,
      cost_per_item: 15.00,
    });
    expect(rows[0].tags).toEqual(['tag1', 'tag2']);
    expect(rows[1].shopify_variant_id).toBe(789);
  });

  it('should transform product without variants into single row', () => {
    const shopifyProduct: ShopifyProduct = {
      id: 999,
      title: 'Simple Product',
      body_html: '',
      vendor: 'Vendor',
      product_type: '',
      handle: 'simple',
      status: 'active',
      tags: '',
      published_at: null,
      variants: [
        {
          id: 111,
          product_id: 999,
          title: 'Default Title',
          sku: 'SIMPLE',
          barcode: null,
          price: '10.00',
          compare_at_price: null,
          cost: null,
          position: 1,
          inventory_quantity: 100,
          weight: 0,
          weight_unit: 'kg',
          requires_shipping: false,
          taxable: false,
          image_id: null,
          option1: 'Default Title',
          option2: null,
          option3: null,
        },
      ],
    };

    const rows = transformProduct(shopifyProduct);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      shopify_product_id: 999,
      // Anche i prodotti a variante singola usano l'id reale della loro unica
      // variante ("Default Title") come chiave univoca.
      shopify_variant_id: 111,
      is_variant: false,
      product_title: 'Simple Product',
      variant_title: null,
      price: 10.00,
      cost_per_item: null,
    });
  });

  it('distingue scorte monitorate da non monitorate', () => {
    const base = {
      id: 1,
      title: 'P',
      body_html: '',
      vendor: '',
      product_type: '',
      handle: 'p',
      status: 'active',
      tags: '',
      published_at: null,
    };
    const variantBase = {
      product_id: 1,
      title: 'Default Title',
      sku: 'S',
      barcode: null,
      price: '5.00',
      compare_at_price: null,
      cost: null,
      position: 1,
      inventory_quantity: 7,
      weight: 0,
      weight_unit: 'kg',
      requires_shipping: true,
      taxable: true,
      image_id: null,
      option1: 'Default Title',
      option2: null,
      option3: null,
    };

    // Monitorata (inventory_management valorizzato) → quantità reale + tracked=true
    const tracked = transformProduct({
      ...base,
      variants: [{ ...variantBase, id: 10, inventory_management: 'shopify', inventory_policy: 'deny' }],
    } as ShopifyProduct)[0];
    expect(tracked.inventory_tracked).toBe(true);
    expect(tracked.inventory_quantity).toBe(7);
    expect(tracked.inventory_policy).toBe('deny');

    // Non monitorata (inventory_management null) → quantità NULL + tracked=false
    const untracked = transformProduct({
      ...base,
      variants: [{ ...variantBase, id: 11, inventory_management: null }],
    } as ShopifyProduct)[0];
    expect(untracked.inventory_tracked).toBe(false);
    expect(untracked.inventory_quantity).toBeNull();
  });

  describe('net_value calculation', () => {
    it('calcola net_value arrotondato a 2 decimali quando costo e prezzo sono presenti', () => {
      const product: ShopifyProduct = {
        id: 1,
        title: 'Prodotto Test',
        body_html: '',
        vendor: '',
        product_type: '',
        handle: 'test',
        status: 'active',
        tags: '',
        published_at: null,
        variants: [{
          id: 100,
          product_id: 1,
          title: 'Variante',
          sku: 'SKU-1',
          barcode: null,
          price: '19.90',
          compare_at_price: null,
          cost: '4.35',
          position: 1,
          inventory_quantity: 10,
          weight: 0,
          weight_unit: 'kg',
          requires_shipping: true,
          taxable: true,
          image_id: null,
          option1: 'Variante',
          option2: null,
          option3: null,
        }],
      };

      const rows = transformProduct(product);

      // Deve essere 15.55, non 15.549999999999999 (arrotondato)
      expect(rows[0].net_value).toBe(15.55);
    });

    it('restituisce net_value null quando il costo e\' null', () => {
      const product: ShopifyProduct = {
        id: 2,
        title: 'Prodotto Senza Costo',
        body_html: '',
        vendor: '',
        product_type: '',
        handle: 'no-cost',
        status: 'active',
        tags: '',
        published_at: null,
        variants: [{
          id: 200,
          product_id: 2,
          title: 'Default Title',
          sku: 'SKU-2',
          barcode: null,
          price: '29.99',
          compare_at_price: null,
          cost: null,
          position: 1,
          inventory_quantity: 5,
          weight: 0,
          weight_unit: 'kg',
          requires_shipping: true,
          taxable: true,
          image_id: null,
          option1: 'Default Title',
          option2: null,
          option3: null,
        }],
      };

      const rows = transformProduct(product);

      expect(rows[0].net_value).toBeNull();
    });

    it('calcola net_value uguale al prezzo quando il costo e\' zero', () => {
      const product: ShopifyProduct = {
        id: 3,
        title: 'Prodotto Costo Zero',
        body_html: '',
        vendor: '',
        product_type: '',
        handle: 'zero-cost',
        status: 'active',
        tags: '',
        published_at: null,
        variants: [{
          id: 300,
          product_id: 3,
          title: 'Default Title',
          sku: 'SKU-3',
          barcode: null,
          price: '15.00',
          compare_at_price: null,
          cost: '0.00',
          position: 1,
          inventory_quantity: 20,
          weight: 0,
          weight_unit: 'kg',
          requires_shipping: true,
          taxable: true,
          image_id: null,
          option1: 'Default Title',
          option2: null,
          option3: null,
        }],
      };

      const rows = transformProduct(product);

      // Costo zero e' valido: net_value = price - 0 = price
      expect(rows[0].net_value).toBe(15.00);
    });

    it('calcola net_value anche per prodotto senza varianti reali (ramo Default Title)', () => {
      const product: ShopifyProduct = {
        id: 4,
        title: 'Prodotto Semplice',
        body_html: '',
        vendor: '',
        product_type: '',
        handle: 'simple',
        status: 'active',
        tags: '',
        published_at: null,
        variants: [{
          id: 400,
          product_id: 4,
          title: 'Default Title',
          sku: 'SIMPLE-1',
          barcode: null,
          price: '50.00',
          compare_at_price: null,
          cost: '20.00',
          position: 1,
          inventory_quantity: 100,
          weight: 0,
          weight_unit: 'kg',
          requires_shipping: false,
          taxable: false,
          image_id: null,
          option1: 'Default Title',
          option2: null,
          option3: null,
        }],
      };

      const rows = transformProduct(product);

      // Anche il ramo senza varianti reali deve calcolare net_value
      expect(rows[0].is_variant).toBe(false);
      expect(rows[0].net_value).toBe(30.00);
    });
  });
});
