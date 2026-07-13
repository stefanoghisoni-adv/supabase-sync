// Shopify app initialization: OAuth, session management, and authenticated
// request helpers. Provides `authenticate` used by every embedded route loader.
import '@shopify/shopify-app-remix/adapters/node';
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from '@shopify/shopify-app-remix/server';
import { PrismaSessionStorage } from '@shopify/shopify-app-session-storage-prisma';
import { prisma } from '~/db.server';
import { encrypt } from '~/utils/crypto.server';

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || '',
  apiVersion: ApiVersion.January25,
  scopes: process.env.SHOPIFY_SCOPES?.split(','),
  appUrl: process.env.SHOPIFY_APP_URL || '',
  authPathPrefix: '/auth',
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  future: {
    unstable_newEmbeddedAuthStrategy: true,
  },
  hooks: {
    // Runs after a successful install/auth. Upserts the merchant record so the
    // rest of the app (dashboard, sync, billing) can resolve the shop by domain.
    // Product/customer/GDPR webhooks are app-managed (declared in
    // shopify.app.toml), so no runtime webhook registration is needed here.
    afterAuth: async ({ session }) => {
      await prisma.shop.upsert({
        where: { shopDomain: session.shop },
        create: {
          shopDomain: session.shop,
          accessToken: encrypt(session.accessToken ?? ''),
          scopes: session.scope ?? '',
          currentPlan: 'free',
          isInTrial: true,
          trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          installedAt: new Date(),
        },
        update: {
          accessToken: encrypt(session.accessToken ?? ''),
          scopes: session.scope ?? '',
          uninstalledAt: null,
        },
      });
    },
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.January25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
