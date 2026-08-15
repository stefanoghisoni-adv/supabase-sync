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

  logs: {
    title: 'Logs',
    nextSync: (countdown: string) => `Next sync in ${countdown}`,
    status: { completed: 'Completed', failed: 'Failed', running: 'Running' },
    tableCreated: {
      products: 'Products table created',
      customers: 'Customers table created',
      both: 'Products and customers tables created',
    },
    unknownError: 'Unknown error',
    missingCustomersTable: 'No customers table was found',
    missingProductsTable: 'No products table was found',
    columns: { state: 'Status', description: 'Description', date: 'Date', details: '' },
    seeDetails: 'See details',
    empty: 'No sync recorded yet.',
      logTitle: 'Sync log',
      noActivity: 'No activity recorded',
      dateTime: 'Date and time',
      detailsColumn: 'Details',
      summaryAdded: (n: number) => `${n} added`,
      summaryRemoved: (n: number) => `${n} removed`,
      summaryUpdated: (n: number) => `${n} updated`,
      summarySuspended: (n: number) => `${n} suspended`,
      partialList: 'Partial list: showing the first 500 entries.',
    details: {
      title: 'Sync detail',
      close: 'Close',
      products: 'Products',
      customers: 'Customers',
      loadFailed: 'The details of this sync could not be loaded.',
      none: 'No detail recorded for this sync.',
      noCustomers: 'No customer changed in this sync.',
      customersElsewhere:
        'The list of individual customers stays in your database: here you get the totals.',
      action: 'Action',
      name: 'Name',
      shopifyId: 'Shopify ID',
      added: 'Added',
      removed: 'Removed',
      updated: 'Updated',
      suspended: 'Suspended',
      truncated: (shown: number, total: number) => `Showing ${shown} of ${total} rows.`,
    },
  },

  steps: {
    badge: { complete: 'Done', active: 'In progress', locked: 'Locked' },
    connectAccount: {
      title: 'Connect Supabase',
      complete: 'Connected',
      notConnected: 'Not connected',
      failed: 'Failed',
      inProgress: 'In progress',
    },
    connectDatabase: {
      title: 'Create or connect a database',
      complete: 'Connected',
      locked: 'Sign in to Supabase to pick the database to connect.',
    },
    trackingCheck: {
      title: 'Tracking check',
      complete: 'Checked',
      locked: 'Connect a database to check what already sends data.',
    },
    serverSide: {
      title: 'Do you already have full server-side tracking?',
      complete: 'Answered',
      beta: 'Beta',
      locked: 'Finish the tracking check to answer this question.',
    },
    plan: {
      choose: 'Choose your plan',
      confirm: 'Confirm your plan',
      locked: 'Answer the question above to choose your plan.',
    },
  },

  connect: {
    account: {
      intro:
        'Sign in to Supabase or create a new account. Right after signing in you will be asked to accept the integration and, from there, you can select or create a database to connect.',
      connect: 'Connect Supabase',
      retry: 'I created the database',
      failed: 'Could not connect to Supabase. Try again.',
      popupsBlocked: 'Allow pop-ups to connect Supabase.',
      connectedWith: (email: string) => `Account connected with ${email}.`,
      connectedNoEmail: 'Account connected.',
      loadingEmail: 'Loading the email connected to the account',
      windowTitle: 'Finish signing in from the Supabase window',
      windowBody:
        'If Supabase asks you to create the account or the organisation first, complete that step: the authorisation request stays behind and needs reopening. This page updates itself as soon as you are signed in.',
      reopen: 'Reopen the authorisation page',
      almostTitle: 'One step left',
      almostBody:
        'If you have just created the account or the database on Supabase, the connection still needs accepting: it is one click, in the Supabase window.',
    },
    database: {
      label: 'Database',
      placeholder: 'Select a database…',
      loading: 'Loading the databases in your account…',
      none: 'No database found in your Supabase account. You can create one below.',
      create: 'Create new database',
      newName: 'Name of the new database',
      region: 'Region',
      regionPlaceholder: 'Select a region…',
      regionsLoading: 'Loading regions…',
      creating: 'Creating the database… (this can take 1-2 minutes)',
      disconnectTitle: 'Disconnect Supabase?',
      deleteData: 'Delete tables and data',
      keepData: 'Keep the data',
      disconnectBody: {
        before: 'You can ',
        delete: 'delete',
        middle: ' the tables and the synced data from your Supabase project, or ',
        keep: 'keep them',
        after: ' (only the sync stops). Either way the connection is removed.',
      },
      typeName: 'Type the project name below',
      projectName: 'Project name',
      syncDisabled: 'Sync disabled.',
      syncSuspended: 'Sync suspended.',
      limitKnown: (plan: string, max: number, active: number) =>
        `Your ${plan} plan allows up to ${max} active projects and you already have ${active}.`,
      limitUnknown: 'Your Supabase plan does not allow creating more projects.',
      limitBefore: 'To create another one',
      limitUpgradeLink: 'upgrade your Supabase plan now',
      limitUpgradePlain: 'upgrade your Supabase plan',
      limitAfter:
        ', or pause an existing project from the Supabase dashboard: paused projects take up no slot.',
      connectedTo: 'Database connected:',
      change: 'Change database',
      disconnect: 'Disconnect',
    },
  },

  tracking: {
    checking:
      'Checking whether any sales channel or code snippet in your theme sends data to the platforms',
    checkingLabel: 'Checking',
    nothingFound:
      'I found no sales channel and no theme code sending events to the platforms.',
    partialNote:
      'Custom pixels added under Settings → Customer events stay outside this check: those are worth a look by hand.',
    conflicts: {
      title: 'Other event sources on this store',
      intro:
        'Every conversion should be sent once. If one of these sends the same events you send, purchases and value get counted twice and your campaigns get optimised on inflated numbers.',
      channelHarmless: 'Only handles shop and catalogues',
      codeHarmless: 'Ignore this',
      uninstall: 'Uninstall',
      removeSnippet: 'Remove snippet',
      declaredChannel: 'This app does not do any tracking',
      declaredCode: 'This code does not do any tracking',
      incomplete:
        'This list may not be complete: custom pixels added under Settings → Customer events are not visible from here. They are worth checking alongside these.',
    },
    serverSide: {
      intro:
        'Server-side tracking sends conversions from the server rather than the browser: they arrive even when the browser blocks them, and with the catalogue and customer data this app keeps in sync they become attributable and measurable. Tell us which platforms you collect data for.',
      needs: 'I need a server-side infrastructure',
      has: 'I already have a server-side setup',
      receivedTitle: 'Request received',
      receivedBody: 'We will get back to you with a proposal for the platforms you picked.',
      hasBody:
        'You told us you already have a server-side setup. If anything changes, write to us any time.',
      failed: 'Could not record your answer. Try again.',
      categories: {
        social: 'Social & Browser',
        email: 'Email',
        crm: 'CRM',
        analytics: 'Analytics',
      },
    },
  },

  planStep: {
    introChoose: 'Your plan sets how many products come in and how often they refresh.',
    introConfirm:
      'Confirm your active plan, or pick another one: the sync starts right after.',
    monthly: 'Monthly',
    yearly: 'Yearly',
    yearlyHint: (amount: string) => `Going yearly saves you up to €${amount} a year`,
    saving: (amount: string) => `You save € ${amount}`,
    current: 'Current',
    recommended: 'Recommended',
    free: 'Free',
    perMonth: (price: string) => `€ ${price}/month`,
    perYear: (price: string) => `€ ${price}/year`,
    yourPlan: 'Your plan:',
    confirmAndSync: 'Confirm and sync',
    syncing: 'Sync running: it continues in the background, you can close this page.',
  },

  dashboard: {
    title: 'Dashboard',
    products: {
      title: 'Products',
      total: 'Total products',
      notEligible: 'Not eligible',
      seeProducts: 'See products',
      eligible: 'Eligible products',
    },
    customers: {
      title: 'Customers',
      total: 'Total customers',
      optIn: 'Opted-in customers',
      optOut: 'Opted-out customers',
      optInInfo: 'These are the customers who consented to marketing',
      optOutInfo: 'These are the customers who did not consent to marketing',
      upsell:
        'Get more out of your user data by tracking Lifetime Value (LTV) and Lifetime Profit (LTP) too.',
      upgrade: 'Upgrade plan',
    },
    connection: { title: 'Connection' },
    recentRuns: {
      title: 'Recent syncs',
      seeAll: 'See all',
      empty: 'No sync yet.',
      run: {
        initial: 'Full sync',
        periodic: 'Scheduled refresh',
        webhook: 'Update from Shopify',
        generic: 'Sync',
      },
    },
    chart: {
      title: 'Syncable products',
      eligible: 'Eligible',
      limit: 'Plan limit',
    },
    willSync: 'What will be synced',
    customersLocked: 'Upgrade now to include customer sync',
    disconnect: {
      deletedTitle: 'Tables and data deleted',
      keptTitle: 'Connection removed',
      deletedBody:
        'The connection has been removed and the tables the app created, with the synced data, have been deleted from the project.',
      keptBody:
        'The connection has been removed. The tables and the synced data stay in the project: reconnect it and the sync picks up from there.',
    },
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
