import { describe, it, expect, vi } from 'vitest';
import { enrichVariantCosts } from './inventory-cost.server';
import type { ShopifyProduct } from '~/types/shopify';

function product(
  id: number,
  variants: { id: number; inventory_item_id?: number; cost?: string | null }[],
): ShopifyProduct {
  return {
    id, title: `p${id}`, body_html: '', vendor: '', product_type: '', handle: 'h',
    status: 'active', tags: '', published_at: null,
    variants: variants.map((v) => ({
      id: v.id, product_id: id, title: 'v', sku: '', barcode: null,
      price: '10.00', compare_at_price: null, cost: v.cost ?? null,
      inventory_item_id: v.inventory_item_id,
      position: 1, inventory_quantity: 0, weight: 0, weight_unit: 'kg',
      requires_shipping: true, taxable: true, image_id: null,
      option1: null, option2: null, option3: null,
    })),
  };
}

describe('enrichVariantCosts', () => {
  it('populates variant.cost from the inventory items (real cost_per_item source)', async () => {
    const products = [
      product(1, [{ id: 11, inventory_item_id: 111 }]),
      product(2, [{ id: 21, inventory_item_id: 222 }]),
    ];
    const client = {
      getInventoryItems: vi.fn().mockResolvedValue([
        { id: 111, cost: '3.50' },
        { id: 222, cost: null },
      ]),
    };

    const result = await enrichVariantCosts(client, products);

    expect(client.getInventoryItems).toHaveBeenCalledWith([111, 222]);
    expect(result[0].variants[0].cost).toBe('3.50');
    expect(result[1].variants[0].cost).toBeNull();
  });

  it('batches inventory item ids in chunks of 100', async () => {
    const variants = Array.from({ length: 150 }, (_, i) => ({
      id: i + 1,
      inventory_item_id: 1000 + i,
    }));
    const products = [product(1, variants)];
    const client = {
      getInventoryItems: vi.fn().mockResolvedValue([]),
    };

    await enrichVariantCosts(client, products);

    expect(client.getInventoryItems).toHaveBeenCalledTimes(2);
    expect(client.getInventoryItems.mock.calls[0][0]).toHaveLength(100);
    expect(client.getInventoryItems.mock.calls[1][0]).toHaveLength(50);
  });

  it('does not call the API when there are no inventory item ids', async () => {
    const products = [product(1, [{ id: 11 }])];
    const client = { getInventoryItems: vi.fn() };

    await enrichVariantCosts(client, products);

    expect(client.getInventoryItems).not.toHaveBeenCalled();
  });
});
