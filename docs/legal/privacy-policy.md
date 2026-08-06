# Informativa sulla privacy — CoreWard

Ultimo aggiornamento: 6 agosto 2026

> **Bozza da far verificare da un legale prima della pubblicazione.**
> I campi fra parentesi quadre vanno completati: senza indirizzo del titolare
> l'informativa non è a norma.

## 1. Chi tratta i dati

**Titolare del trattamento**: Stefano Ghisoni
Indirizzo: [via, CAP, città, paese]
Partita IVA / Codice fiscale: [da inserire se l'attività è esercitata in forma d'impresa]
Contatto: support@coreward.app

CoreWard è un'applicazione per Shopify che sincronizza i dati di catalogo e
clientela di un negozio nel database che il merchant possiede e controlla.

## 2. Due ruoli distinti

Questa distinzione governa tutto il resto del documento.

**Verso il merchant, CoreWard è titolare.** I dati dell'account — dominio del
negozio, nome, cognome, email e lingua dell'utente Shopify che installa l'app,
piano sottoscritto e stato di fatturazione — sono trattati da CoreWard per
erogare il servizio.

**Verso i clienti finali del merchant, CoreWard è responsabile del
trattamento.** I dati dei clienti del negozio appartengono al merchant, che ne è
il titolare e decide finalità e mezzi. CoreWard li tratta esclusivamente su
istruzione del merchant, nei termini del [Data Processing Agreement](./dpa.md).

## 3. Quali dati

### Dati del merchant (CoreWard titolare)

| Dato | Origine | Perché |
|---|---|---|
| Dominio del negozio | Shopify, all'installazione | Identificare l'account |
| Nome, cognome, email, lingua dell'utente | Sessione Shopify | Autenticazione e assistenza |
| Piano, stato dell'abbonamento | Shopify Billing | Fatturazione e limiti di servizio |
| Indirizzo del progetto database collegato | Fornito dal merchant | Far funzionare la sincronizzazione |

### Dati dei clienti del negozio (CoreWard responsabile)

Solo per i merchant il cui piano include la sincronizzazione clienti, e **solo
per i clienti che hanno prestato il consenso al marketing su Shopify**:

indirizzo email, numero di telefono, nome, cognome, stato del consenso e livello
di adesione, totale speso, numero di ordini, stato cliente, tag, note.

Non vengono trattati indirizzi di spedizione o fatturazione, dati di pagamento,
contenuto degli ordini.

## 4. Il consenso comanda

Un cliente che non ha acconsentito al marketing su Shopify non viene
sincronizzato. Se revoca il consenso dopo esserlo stato, il suo record non viene
cancellato dal database del merchant — viene marcato come non consenziente, e da
quel momento ogni tentativo di lettura attraverso CoreWard viene rifiutato.

La scelta di non cancellare è del merchant: quei dati sono suoi e possono
servirgli per finalità diverse dal marketing, per le quali risponde lui.

## 5. Dove stanno i dati

| Cosa | Dove | Fornitore |
|---|---|---|
| Database dell'applicazione | Parigi, Francia (UE) | Supabase |
| Esecuzione dell'applicazione | Parigi, Francia (UE) | Vercel |
| Coda dei lavori di sincronizzazione | N. Virginia, Stati Uniti (us-east-1) | Upstash |
| Dati di catalogo e clientela | Progetto del merchant, **nella regione che il merchant sceglie** | Supabase, sotto contratto del merchant |

Nella coda transitano soltanto identificatori interni di negozio: nessun dato
personale.

I dati di catalogo e clientela non risiedono sull'infrastruttura di CoreWard.
Vivono nel progetto database del merchant, di cui il merchant è intestatario.

## 6. Responsabili esterni

- **Vercel Inc.** — esecuzione dell'applicazione
- **Supabase Inc.** — database dell'applicazione
- **Upstash Inc.** — coda dei lavori

Non ci sono altri fornitori. I dati non vengono venduti, ceduti né comunicati a
terzi per finalità proprie.

## 7. Per quanto tempo

| Dato | Conservazione |
|---|---|
| Sessione Shopify | Cancellata alla disinstallazione dell'app |
| Account e piano | Finché l'account esiste |
| Registro degli accessi ai dati dei clienti | 12 mesi |
| Dettaglio delle sincronizzazioni | Solo le ultime esecuzioni consultabili |
| Dati di catalogo e clientela | Restano nel database del merchant, anche dopo la disinstallazione |

Sull'ultima riga: disinstallare CoreWard **non cancella** ciò che il merchant ha
raccolto. Quelle tabelle sono nel suo progetto e restano sue. Chi vuole
eliminarle lo fa dal proprio database.

## 8. Diritti

Ogni interessato può chiedere accesso, rettifica, cancellazione, limitazione,
portabilità e opposizione, e proporre reclamo all'autorità di controllo
competente.

**Se sei un cliente di un negozio** che usa CoreWard, il tuo interlocutore è il
negozio: è lui il titolare dei tuoi dati. CoreWard dà seguito alle richieste che
riceve tramite i canali previsti da Shopify per l'accesso e la cancellazione, e
assiste il merchant nel rispondere.

**Se sei un merchant**, scrivi a support@coreward.app.

## 9. Sicurezza

I dati in transito viaggiano su HTTPS. I segreti conservati dall'applicazione
sono cifrati con AES-256-GCM. Il database dell'applicazione non è raggiungibile
attraverso interfacce pubbliche. Ogni lettura di dati personali dei clienti viene
registrata. La procedura seguita in caso di incidente è pubblica e consultabile
nel repository del progetto.

## 10. Modifiche

Le modifiche sostanziali vengono comunicate ai merchant attivi via email con
almeno 30 giorni di preavviso. La data in cima al documento indica l'ultima
revisione.
