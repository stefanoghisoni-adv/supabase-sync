// Un solo negozio vede i dettagli diagnostici in chiaro nell'interfaccia: gli
// altri merchant non devono mai ricevere informazioni interne (info-disclosure).
// Condiviso tra le rotte che espongono diagnostica mirata.
export const DEBUG_SHOP_DOMAIN = 'test-negozio-11.myshopify.com';

export function isDebugShop(shopDomain: string | undefined | null): boolean {
  return shopDomain === DEBUG_SHOP_DOMAIN;
}
