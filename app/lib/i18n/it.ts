/**
 * I testi dell'app in italiano.
 *
 * L'italiano e' l'originale: e' qui che una frase nasce, e `en.ts` la segue.
 * Il tipo di `en` e' `typeof it`, quindi una voce aggiunta qui e non la' non
 * compila — le due lingue non possono divergere in silenzio.
 *
 * Le frasi con un valore dentro sono funzioni: il valore arriva tipizzato, e
 * l'ordine delle parole resta libero in ogni lingua invece di essere imposto da
 * una concatenazione.
 */
export const it = {
  common: {
    confirm: 'Conferma',
    cancel: 'Annulla',
    dashboard: 'Dashboard',
    settings: 'Impostazioni',
    plan: 'Piano',
    logs: 'Logs',
    productIssues: 'Prodotti non idonei',
    never: 'Mai',
    notSet: '—',
    active: 'Attiva',
    inactive: 'Non attiva',
    connected: 'Collegato',
    notConnected: 'Non collegato',
  },

  language: {
    label: 'Lingua',
    /** Testo del campo di ricerca, quando le lingue sono molte. */
    searchPlaceholder: 'Cerca una lingua…',
    saving: 'Salvataggio…',
  },

  settings: {
    title: 'Impostazioni',
    noProject: {
      before: 'Nessun progetto Supabase collegato. Vai alla',
      link: 'Dashboard',
      after: 'per collegare il tuo database.',
    },
    missingReadKey:
      'Chiave di lettura non disponibile: il tracciamento non riesce a leggere i dati. Scrivici e la rimettiamo a posto.',
    missingProxyUrl:
      'Indirizzo di lettura non disponibile: manca la configurazione del dominio dell’app. Contatta il supporto prima di impostare il tracciamento.',
  },

  account: {
    title: 'Account',
    plan: 'Piano',
    productsSync: 'Sincronizzazione prodotti',
    customersSync: 'Sincronizzazione clienti',
    upgradeTo: (planName: string) => `Aggiorna a ${planName}`,
  },

  database: {
    title: 'Database',
    status: 'Stato',
    appUrl: 'App URL',
    readKey: 'Publishable API Key',
    notConfigured: 'Non configurato',
    ownerUrl: 'URL Database proprietario',
    open: 'Vai al database',
    copy: 'Clicca per copiare',
    copied: 'Copiato!',
  },

  plan: {
    features: {
      products: (amount: string) => `Fino a ${amount} prodotti`,
      productsUnlimited: 'Prodotti illimitati',
      /** Riceve gia' la cadenza scritta: "ogni 7 giorni". */
      sync: (frequency: string) => `Sync ${frequency}`,
      email: 'Supporto via email',
      customers: (amount: string) => `Fino a ${amount} clienti`,
      customersUnlimited: 'Clienti illimitati',
      customersSync: 'Sync clienti',
      push: 'Push manuale',
      chat: 'Chat dedicata',
    },
  },

  sync: {
    title: 'Sincronizzazione',
    frequency: 'Frequenza',
    last: 'Ultima',
    next: 'Prossima',
    inLabel: (countdown: string) => `Tra ${countdown}`,
    fromPlan:
      'La frequenza è quella prevista dal tuo piano: con un piano superiore i dati si aggiornano più spesso.',
    every: {
      minutes: (n: number) => `Ogni ${n} minuti`,
      hour: 'Ogni ora',
      hours: (n: number) => `Ogni ${n} ore`,
      day: 'Ogni giorno',
      days: (n: number) => `Ogni ${n} giorni`,
    },
    countdown: {
      oneMinute: 'un minuto',
      minutes: (n: number) => `${n} minuti`,
      oneHour: "un'ora",
      hours: (n: number) => `${n} ore`,
      oneDay: 'un giorno',
      days: (n: number) => `${n} giorni`,
    },
  },
  // Nessun `as const`: con i tipi letterali l'inglese non potrebbe scrivere
  // niente di diverso dall'italiano, che e' esattamente il suo mestiere.
};
