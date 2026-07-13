import type { ShopifyCustomer, SupabaseCustomerRow } from '~/types/shopify';

/**
 * Transforms a Shopify customer payload into a single Supabase row matching the
 * `customers` table created by api.supabase.create-tables.
 *
 * Marketing consent: Shopify deprecated the flat `accepts_marketing` /
 * `marketing_opt_in_level` fields in favor of the nested
 * `email_marketing_consent` object. We read the nested form when present and
 * fall back to the legacy fields for older API payloads.
 */
export function transformCustomer(customer: ShopifyCustomer): SupabaseCustomerRow {
  const consent = customer.email_marketing_consent;

  const acceptsMarketing =
    consent?.state != null
      ? consent.state === 'subscribed'
      : customer.accepts_marketing ?? null;

  const marketingOptInLevel =
    consent?.opt_in_level ?? customer.marketing_opt_in_level ?? null;

  const tags = customer.tags
    ? customer.tags.split(',').map((tag) => tag.trim()).filter(Boolean)
    : [];

  return {
    shopify_customer_id: customer.id,
    email: customer.email || null,
    phone: customer.phone || null,
    first_name: customer.first_name || null,
    last_name: customer.last_name || null,
    accepts_marketing: acceptsMarketing,
    marketing_opt_in_level: marketingOptInLevel,
    total_spent: customer.total_spent != null ? parseFloat(customer.total_spent) : null,
    orders_count: customer.orders_count ?? null,
    customer_state: customer.state ?? null,
    tags,
    note: customer.note ?? null,
    verified_email: customer.verified_email ?? null,
    tax_exempt: customer.tax_exempt ?? null,
    created_at: customer.created_at ?? null,
    updated_at: customer.updated_at ?? null,
    synced_at: new Date().toISOString(),
  };
}
