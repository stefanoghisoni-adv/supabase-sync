import type { it } from './it';

/**
 * I testi dell'app in inglese.
 *
 * Il tipo e' quello dell'italiano: una voce aggiunta di la' e non qui non
 * compila. Non e' pedanteria — una chiave che manca si vedrebbe a schermo come
 * uno spazio vuoto, e solo nella lingua che nessuno di noi due usa ogni giorno.
 */
export const en: typeof it = {
  common: {
    confirm: 'Confirm',
    cancel: 'Cancel',
    dashboard: 'Dashboard',
    settings: 'Settings',
    plan: 'Plan',
    logs: 'Logs',
    productIssues: 'Products not eligible',
    never: 'Never',
    notSet: '—',
    active: 'Active',
    inactive: 'Not active',
    connected: 'Connected',
    notConnected: 'Not connected',
  },

  language: {
    label: 'Language',
    searchPlaceholder: 'Search for a language…',
    saving: 'Saving…',
  },

  settings: {
    title: 'Settings',
    noProject: {
      before: 'No Supabase project connected. Go to the',
      link: 'Dashboard',
      after: 'to connect your database.',
    },
    missingReadKey:
      'Read key unavailable: tracking cannot read your data. Write to us and we will put it back in place.',
    missingProxyUrl:
      'Read address unavailable: the app domain is not configured. Contact support before setting up tracking.',
  },

  account: {
    title: 'Account',
    plan: 'Plan',
    productsSync: 'Product sync',
    customersSync: 'Customer sync',
    upgradeTo: (planName: string) => `Upgrade to ${planName}`,
  },

  database: {
    title: 'Database',
    status: 'Status',
    appUrl: 'App URL',
    readKey: 'Publishable API key',
    notConfigured: 'Not configured',
    ownerUrl: 'Your database URL',
    open: 'Open database',
    copy: 'Click to copy',
    copied: 'Copied!',
  },

  plan: {
    features: {
      products: (amount: string) => `Up to ${amount} products`,
      productsUnlimited: 'Unlimited products',
      sync: (frequency: string) => `Sync ${frequency}`,
      email: 'Email support',
      customers: (amount: string) => `Up to ${amount} customers`,
      customersUnlimited: 'Unlimited customers',
      customersSync: 'Customer sync',
      push: 'Manual push',
      chat: 'Dedicated chat',
    },
  },

  sync: {
    title: 'Sync',
    frequency: 'Frequency',
    last: 'Last',
    next: 'Next',
    inLabel: (countdown: string) => `In ${countdown}`,
    fromPlan:
      'The frequency comes with your plan: on a higher plan your data refreshes more often.',
    every: {
      minutes: (n: number) => `Every ${n} minutes`,
      hour: 'Every hour',
      hours: (n: number) => `Every ${n} hours`,
      day: 'Every day',
      days: (n: number) => `Every ${n} days`,
    },
    countdown: {
      oneMinute: 'one minute',
      minutes: (n: number) => `${n} minutes`,
      oneHour: 'one hour',
      hours: (n: number) => `${n} hours`,
      oneDay: 'one day',
      days: (n: number) => `${n} days`,
    },
  },
};
