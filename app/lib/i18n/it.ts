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

  nav: {
    /** L'unica voce di menu finche' la configurazione e' aperta. */
    configuration: 'Configurazione',
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

  logs: {
    title: 'Logs',
    nextSync: (countdown: string) => `Prossima sincronizzazione tra ${countdown}`,
    status: { completed: 'Completata', failed: 'Fallita', running: 'In corso' },
    tableCreated: {
      products: 'Creazione tabella prodotti riuscita',
      customers: 'Creazione tabella clienti riuscita',
      both: 'Creazione tabelle prodotti e clienti riuscita',
    },
    unknownError: 'Errore sconosciuto',
    missingCustomersTable: 'Non è stata trovata nessuna tabella per i clienti',
    missingProductsTable: 'Non è stata trovata nessuna tabella per i prodotti',
    columns: { state: 'Stato', description: 'Descrizione', date: 'Data', details: '' },
    seeDetails: 'Vedi dettagli',
    empty: 'Nessuna sincronizzazione registrata.',
      logTitle: 'Log di sincronizzazione',
      noActivity: 'Nessuna attività registrata',
      dateTime: 'Data e ora',
      detailsColumn: 'Dettagli',
      summaryAdded: (n: number) => `${n} ${n === 1 ? 'aggiunto' : 'aggiunti'}`,
      summaryRemoved: (n: number) => `${n} ${n === 1 ? 'rimosso' : 'rimossi'}`,
      summaryUpdated: (n: number) => `${n} ${n === 1 ? 'aggiornato' : 'aggiornati'}`,
      summarySuspended: (n: number) => `${n} ${n === 1 ? 'sospeso' : 'sospesi'}`,
      partialList: 'Elenco parziale: mostrate le prime 500 voci.',
    details: {
      title: 'Dettaglio sincronizzazione',
      close: 'Chiudi',
      products: 'Prodotti',
      customers: 'Clienti',
      loadFailed: 'Non è stato possibile caricare i dettagli di questa sincronizzazione.',
      none: 'Nessun dettaglio registrato per questa sincronizzazione.',
      noCustomers: 'Nessun cliente modificato in questa sincronizzazione.',
      customersElsewhere:
        'L’elenco dei singoli clienti resta nel tuo database: qui trovi i totali.',
      action: 'Azione',
      name: 'Nome',
      shopifyId: 'ID Shopify',
      added: 'Aggiunto',
      removed: 'Rimosso',
      updated: 'Aggiornato',
      suspended: 'Sospeso',
      truncated: (shown: number, total: number) =>
        `Mostrate ${shown} righe di ${total}.`,
    },
  },

  steps: {
    badge: { complete: 'Completato', active: 'In corso', locked: 'Bloccato' },
    connectAccount: {
      title: 'Collega Supabase',
      complete: 'Collegato',
      notConnected: 'Non collegato',
      failed: 'Fallito',
      inProgress: 'In corso',
    },
    connectDatabase: {
      title: 'Crea o collega un database',
      complete: 'Collegato',
      locked: 'Accedi a Supabase per scegliere il database da collegare.',
    },
    trackingCheck: {
      title: 'Controllo tracciamenti',
      complete: 'Controllato',
      locked: 'Collega un database per controllare cosa trasmette già dati.',
    },
    serverSide: {
      title: 'Hai già un tracciamento full server side?',
      complete: 'Risposto',
      beta: 'Beta',
      locked: 'Finisci il controllo dei tracciamenti per rispondere a questa domanda.',
    },
    plan: {
      choose: 'Scegli il piano',
      confirm: 'Conferma il piano',
      locked: 'Rispondi alla domanda qui sopra per scegliere il piano.',
    },
  },

  connect: {
    account: {
      intro:
        'Accedi a Supabase o crea un nuovo account. Subito dopo l’accesso ti verrà chiesto di accettare l’integrazione e, proseguendo, potrai selezionare o creare un nuovo database da collegare.',
      connect: 'Collega Supabase',
      retry: 'Ho creato il database',
      failed: 'Collegamento a Supabase non riuscito. Riprova.',
      popupsBlocked: 'Consenti i popup per collegare Supabase.',
      connectedWith: (email: string) => `Account connesso con ${email}.`,
      connectedNoEmail: 'Account connesso.',
      loadingEmail: 'Carico l’email connessa all’account',
      windowTitle: 'Completa l’accesso nella finestra di Supabase',
      windowBody:
        'Se Supabase ti chiede prima di creare l’account o l’organizzazione, finisci quel passaggio: la richiesta di autorizzazione resta indietro e va riaperta. Questa pagina si aggiorna da sola appena l’accesso è fatto.',
      reopen: 'Riapri la pagina di autorizzazione',
      almostTitle: 'Manca solo un passaggio',
      almostBody:
        'Se hai appena creato l’account o il database su Supabase, resta da accettare il collegamento: è un clic, nella finestra di Supabase.',
    },
    database: {
      label: 'Database',
      placeholder: 'Seleziona un database…',
      loading: 'Caricamento dei database del tuo account…',
      none: 'Nessun database trovato nel tuo account Supabase. Puoi crearne uno qui sotto.',
      create: 'Crea nuovo database',
      newName: 'Nome del nuovo database',
      region: 'Region',
      regionPlaceholder: 'Seleziona una region…',
      regionsLoading: 'Caricamento delle region…',
      creating: 'Creazione del database in corso… (può richiedere 1-2 minuti)',
      disconnectTitle: 'Scollegare Supabase?',
      deleteData: 'Elimina tabelle e dati',
      keepData: 'Mantieni i dati',
      disconnectBody: {
        before: 'Puoi ',
        delete: 'eliminare',
        middle: ' le tabelle e i dati sincronizzati dal tuo progetto Supabase, oppure ',
        keep: 'mantenerli',
        after:
          ' (verrà interrotta solo la sincronizzazione). In entrambi i casi il collegamento verrà rimosso.',
      },
      typeName: 'Inserisci qui sotto il nome del progetto',
      projectName: 'Nome del progetto',
      syncDisabled: 'Sincronizzazione disabilitata.',
      syncSuspended: 'Sincronizzazione sospesa.',
      limitKnown: (plan: string, max: number, active: number) =>
        `Il tuo piano ${plan} consente al massimo ${max} progetti attivi e ne hai già ${active}.`,
      limitUnknown: 'Il tuo piano Supabase non consente di creare altri progetti.',
      limitBefore: 'Per crearne un altro',
      limitUpgradeLink: 'aggiorna ora il piano Supabase',
      limitUpgradePlain: 'aggiorna il piano Supabase',
      limitAfter:
        ', oppure metti in pausa un progetto esistente dalla dashboard Supabase: i progetti in pausa non occupano nessuno slot.',
      connectedTo: 'Database collegato:',
      change: 'Cambia database',
      disconnect: 'Disconnetti',
    },
  },

  tracking: {
    checking:
      'Controllo se ci sono canali di vendita o snippet di codice nel tema che trasmettono dati alle piattaforme',
    checkingLabel: 'Controllo in corso',
    nothingFound:
      'Non ho trovato canali di vendita né codice nel tema che mandino eventi alle piattaforme.',
    partialNote:
      'Restano fuori dal controllo i pixel personalizzati aggiunti in Impostazioni → Eventi cliente: quelli vale la pena guardarli a mano.',
    conflicts: {
      title: 'Altre fonti di eventi su questo negozio',
      intro:
        'Ogni conversione dovrebbe essere inviata una volta sola. Se una di queste manda gli stessi eventi che invii tu, acquisti e valore vengono contati due volte e le campagne vengono ottimizzate su numeri gonfiati.',
      channelHarmless: 'Gestisce solo shop e cataloghi',
      codeHarmless: 'Non considerare',
      uninstall: 'Disinstalla',
      removeSnippet: 'Rimuovi snippet',
      declaredChannel: 'Quest’app non esegue attività di tracciamento',
      declaredCode: 'Questo codice non esegue attività di tracciamento',
      incomplete:
        'L’elenco può non essere completo: i pixel personalizzati aggiunti in Impostazioni → Eventi cliente non sono visibili da qui. Vale la pena controllarli insieme a questi.',
    },
    serverSide: {
      intro:
        'Un tracciamento server side manda le conversioni dal server e non dal browser: arrivano anche quando il browser le blocca, e con i dati di catalogo e clientela che questa app tiene allineati diventano attribuibili e misurabili. Dicci per quali piattaforme raccogli dati.',
      needs: 'Ho bisogno di un’infrastruttura server side',
      has: 'Ho già una struttura server side',
      receivedTitle: 'Richiesta ricevuta',
      receivedBody:
        'Ti ricontattiamo con una proposta per le piattaforme che hai indicato.',
      hasBody:
        'Hai dichiarato di avere già un’infrastruttura server side. Se cambia qualcosa, scrivici quando vuoi.',
      failed: 'Non è stato possibile registrare la risposta. Riprova.',
      categories: {
        social: 'Social & Browser',
        email: 'Email',
        crm: 'CRM',
        analytics: 'Analytics',
      },
    },
  },

  planStep: {
    introChoose: 'Il piano stabilisce quanti prodotti entrano e ogni quanto si aggiornano.',
    introConfirm:
      'Confermi il piano attivo, oppure ne scegli un altro: la sincronizzazione parte subito dopo.',
    monthly: 'Mensile',
    yearly: 'Annuale',
    // Gli importi arrivano gia' scritti nella valuta del negozio: qui non si
    // aggiunge nessun simbolo, o si finirebbe per dire euro a chi paga in
    // dollari.
    yearlyHint: (amount: string) => `Con l’annuale risparmi fino a ${amount} l’anno`,
    saving: (amount: string) => `Risparmi ${amount}`,
    current: 'Attuale',
    recommended: 'Consigliato',
    free: 'Gratis',
    perMonth: (price: string) => `${price}/mese`,
    perYear: (price: string) => `${price}/anno`,
    yourPlan: 'Il tuo piano:',
    confirmAndSync: 'Conferma e sincronizza',
    syncing: 'Sincronizzazione in corso: prosegue in background, puoi chiudere questa pagina.',
  },

  dashboard: {
    title: 'Dashboard',
    products: {
      title: 'Prodotti',
      total: 'Prodotti totali',
      notEligible: 'Non idonei',
      seeProducts: 'Vedi prodotti',
      eligible: 'Prodotti idonei',
    },
    customers: {
      title: 'Clienti',
      total: 'Clienti totali',
      optIn: 'Clienti opt-in',
      optOut: 'Clienti opt-out',
      optInInfo: 'Qui vengono identificati i clienti che hanno acconsentito al marketing',
      optOutInfo: 'Qui vengono identificati i clienti che non hanno acconsentito al marketing',
      upsell:
        'Potenzia la trasmissione dei dati utente monitorando anche il Lifetime Value (LTV) e Lifetime Profit (LTP).',
      upgrade: 'Aggiorna piano',
    },
    connection: { title: 'Connessione' },
    recentRuns: {
      title: 'Ultime sincronizzazioni',
      seeAll: 'Vedi tutte',
      empty: 'Nessuna sincronizzazione ancora.',
      run: {
        initial: 'Sincronizzazione completa',
        periodic: 'Aggiornamento periodico',
        webhook: 'Aggiornamento da Shopify',
        generic: 'Sincronizzazione',
      },
    },
    chart: {
      title: 'Prodotti sincronizzabili',
      eligible: 'Idonei',
      limit: 'Limite del piano',
    },
    willSync: 'Cosa verrà sincronizzato',
    customersLocked: 'Aggiorna ora per integrare la sincronizzazione dei clienti',
    disconnect: {
      deletedTitle: 'Tabelle e dati eliminati',
      keptTitle: 'Collegamento rimosso',
      deletedBody:
        'Il collegamento è stato rimosso e le tabelle create dall’app, con i dati sincronizzati, sono state eliminate dal progetto.',
      keptBody:
        'Il collegamento è stato rimosso. Le tabelle e i dati sincronizzati restano nel progetto: ricollegandolo, la sincronizzazione riparte da lì.',
    },
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
