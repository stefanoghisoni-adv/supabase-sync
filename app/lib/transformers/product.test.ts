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
      shopify_variant_id: null,
      is_variant: false,
      product_title: 'Simple Product',
      variant_title: null,
      price: 10.00,
      cost_per_item: null,
    });
  });
});
