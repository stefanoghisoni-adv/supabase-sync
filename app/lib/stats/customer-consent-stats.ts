import type { ShopifyCustomer } from '~/types/shopify';

export interface MarketingConsentCounts {
  optIn: number;
  optOut: number;
}

// Stesso criterio di transformCustomer: vince il consenso nidificato quando c'e',
// altrimenti si ricade sul campo legacy per i payload piu' vecchi.
export function isCustomerOptedIn(customer: ShopifyCustomer): boolean {
  const state = customer.email_marketing_consent?.state;
  if (state != null) return state === 'subscribed';
  return customer.accepts_marketing === true;
}

export function countMarketingConsent(customers: ShopifyCustomer[]): MarketingConsentCounts {
  let optIn = 0;
  for (const customer of customers) {
    if (isCustomerOptedIn(customer)) optIn++;
  }
  return { optIn, optOut: customers.length - optIn };
}
