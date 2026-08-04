import { useCallback, useEffect, useState } from 'react';
import { useFetcher, useRevalidator } from '@remix-run/react';
import { BlockStack, Button, Banner, InlineStack, Spinner, Text } from '@shopify/polaris';

export type SupabaseConnectStatus = 'idle' | 'in_progress' | 'failed';

export interface SupabaseAccountConnectProps {
  /** L'accesso a Supabase risulta gia' fatto. */
  connected: boolean;
  /** Negozio non ENABLED: nessuna azione disponibile. */
  disabled?: boolean;
  // Notifica il parent lo stato del flusso (guida il badge del passo:
  // Non collegato / In corso / Fallito).
  onStatusChange?: (status: SupabaseConnectStatus) => void;
}

/**
 * Primo passo: l'accesso all'account Supabase.
 *
 * Si conclude qui, con il solo consenso all'integrazione: la scelta del
 * database e' il passo dopo, e vive in un componente suo. La separazione non e'
 * solo di forma — sono due cose che possono restare scollegate fra loro, e chi
 * ha fatto l'accesso ma non ha scelto il database deve vedere dove si e'
 * fermato.
 */
export function SupabaseAccountConnect({
  connected,
  disabled,
  onStatusChange,
}: SupabaseAccountConnectProps) {
  const revalidator = useRevalidator();
  const urlFetcher = useFetcher<{ url?: string; error?: string }>();
  const accountFetcher = useFetcher<{ email: string | null }>();
  const statusFetcher = useFetcher<{ linked: boolean }>();

  const [connecting, setConnecting] = useState(false);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [popupRef, setPopupRef] = useState<Window | null>(null);
  // True se l'ultimo tentativo e' fallito (finestra chiusa senza confermare
  // l'integrazione, o errore): guida il badge "Fallito".
  const [connectFailed, setConnectFailed] = useState(false);

  // Ricezione esito dalla finestra di accesso (origine validata).
  useEffect(() => {
    const appOrigin = window.location.origin;
    function onMessage(event: MessageEvent) {
      if (event.origin !== appOrigin) return;
      const data = event.data as { type?: string; ok?: boolean; error?: string };
      if (!data || data.type !== 'supabase-oauth') return;
      setConnecting(false);
      setPopupRef(null);
      if (data.ok) {
        setOauthError(null);
        setConnectFailed(false);
        // Lo stato del passo lo dice il server: ricaricandolo il primo passo
        // risulta concluso e il secondo si sblocca da se'.
        revalidator.revalidate();
      } else {
        setConnectFailed(true);
        setOauthError('Collegamento a Supabase non riuscito. Riprova.');
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Porta la finestra sull'indirizzo di accesso appena e' pronto.
  useEffect(() => {
    if (urlFetcher.data?.url && popupRef) {
      popupRef.location.href = urlFetcher.data.url;
    } else if (urlFetcher.data?.error && popupRef) {
      popupRef.close();
      setPopupRef(null);
      setConnecting(false);
      setConnectFailed(true);
      setOauthError(urlFetcher.data.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlFetcher.data]);

  // Finestra chiusa senza esito. Non basta a dire che e' andata male: il
  // messaggio puo' non essere mai arrivato (finestra chiusa a mano, oppure
  // Supabase che ha portato il merchant a crearsi account o organizzazione
  // altrove). Prima si chiede al server, e solo se non risulta niente si
  // dichiara fallito — lo fa l'effetto qui sotto, alla risposta.
  useEffect(() => {
    if (!popupRef) return;
    const timer = setInterval(() => {
      if (popupRef.closed) {
        clearInterval(timer);
        setPopupRef(null);
        statusFetcher.load('/api/supabase/link-status');
      }
    }, 500);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popupRef]);

  // Finche' il collegamento e' in corso si chiede al server, a intervalli, se
  // l'autorizzazione e' arrivata. La finestra di Supabase e' di un altro sito:
  // non possiamo guardarci dentro, e se il merchant ci passa dei minuti a
  // crearsi l'account il messaggio di ritorno non arriva mai. Cosi' il passo si
  // sblocca da se' appena l'accesso c'e' davvero, senza costringerlo a
  // ricominciare.
  useEffect(() => {
    if (!connecting || connected) return;
    const timer = setInterval(() => {
      // Fermo quando la scheda non e' in primo piano: li' non c'e' nessuno che
      // guarda il badge, e al ritorno si controlla comunque (effetto sotto).
      if (document.visibilityState !== 'visible') return;
      // Una richiesta alla volta: se la precedente e' ancora in volo si aspetta.
      if (statusFetcher.state === 'idle') {
        statusFetcher.load('/api/supabase/link-status');
      }
    }, 3000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connecting, connected, statusFetcher.state]);

  // Il merchant torna sulla scheda di Shopify: e' il momento piu' probabile in
  // cui l'autorizzazione e' appena stata data. Si controlla subito, senza
  // aspettare il giro dell'intervallo.
  useEffect(() => {
    if (!connecting || connected) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible' && statusFetcher.state === 'idle') {
        statusFetcher.load('/api/supabase/link-status');
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connecting, connected, statusFetcher.state]);

  // Esito della verifica sul server.
  useEffect(() => {
    if (statusFetcher.state !== 'idle' || !statusFetcher.data) return;

    if (statusFetcher.data.linked) {
      setConnecting(false);
      setPopupRef(null);
      setOauthError(null);
      setConnectFailed(false);
      popupRef?.close();
      // Lo stato del passo lo dice il server: ricaricandolo il primo passo
      // risulta concluso e il secondo si sblocca da se'.
      revalidator.revalidate();
      return;
    }

    // Non collegato E finestra chiusa: il tentativo e' finito senza esito.
    // Se la finestra e' ancora aperta non si conclude niente, si continua ad
    // aspettare.
    if (!popupRef) {
      setConnecting((isConnecting) => {
        if (isConnecting) setConnectFailed(true);
        return false;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFetcher.state, statusFetcher.data]);

  const startConnect = useCallback(() => {
    setOauthError(null);
    setConnectFailed(false);
    // Finestra con un nome: se e' gia' aperta la si riusa invece di aprirne una
    // seconda. E' quello che serve a "Riapri la pagina di autorizzazione", che
    // riporta li' chi nel frattempo e' finito a creare account o organizzazione.
    const popup = window.open('', 'supabase-oauth', 'width=600,height=760');
    if (!popup) {
      setOauthError('Consenti i popup per collegare Supabase.');
      return;
    }
    popup.focus();
    setPopupRef(popup);
    setConnecting(true);
    urlFetcher.submit(null, { method: 'post', action: '/api/supabase/oauth-url' });
  }, [urlFetcher]);

  // Con quale account si e' entrati: si chiede solo a collegamento fatto, e
  // dopo che la pagina e' gia' comparsa. Nell'attesa si dice che si sta
  // caricando: una frase piu' corta che dopo un istante cambia da sola sotto gli
  // occhi si legge come un ripensamento dell'app.
  useEffect(() => {
    if (!connected) return;
    if (accountFetcher.state === 'idle' && !accountFetcher.data) {
      accountFetcher.load('/api/supabase/account');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);
  const accountEmail = accountFetcher.data?.email ?? null;
  // Sulla presenza della risposta e non su `state`: fra il render e la partenza
  // della richiesta il fetcher e' fermo, e guardando lo stato quell'istante
  // mostrerebbe di nuovo la frase breve.
  const emailPending = !accountFetcher.data;

  const status: SupabaseConnectStatus = connectFailed
    ? 'failed'
    : connecting
      ? 'in_progress'
      : 'idle';
  useEffect(() => {
    onStatusChange?.(status);
  }, [status, onStatusChange]);

  if (connected) {
    if (emailPending) {
      return (
        <InlineStack gap="200" blockAlign="center">
          <Spinner size="small" accessibilityLabel="Caricamento dell'email in corso" />
          <Text as="p" tone="subdued">
            Carico l&apos;email connessa all&apos;account
          </Text>
        </InlineStack>
      );
    }
    return (
      <Text as="p" tone="subdued">
        {/* Senza email la risposta e' arrivata lo stesso: si dice quel che si sa,
            non si resta a girare su un dato che non tornera'. */}
        {accountEmail ? `Account connesso con ${accountEmail}.` : 'Account connesso.'}
      </Text>
    );
  }

  return (
    <BlockStack gap="300">
      <Text as="p" tone="subdued">
        Accedi a Supabase o crea un nuovo account. Subito dopo l&apos;accesso ti verrà chiesto
        di accettare l&apos;integrazione e, proseguendo, potrai selezionare o creare un nuovo
        database da collegare.
      </Text>

      {oauthError && <Banner tone="critical">{oauthError}</Banner>}

      {/* Il caso che lascia tutti fermi: chi arriva senza account, o senza
          un'organizzazione, viene portato da Supabase a crearla e la richiesta
          di autorizzazione resta indietro. Il passo si sblocca comunque da solo
          appena l'autorizzazione arriva, ma qui gli si dice dove cercarla. */}
      {connecting && (
        <Banner tone="info" title="Completa l'accesso nella finestra di Supabase">
          <BlockStack gap="200">
            <Text as="p">
              Se Supabase ti chiede prima di creare l&apos;account o
              l&apos;organizzazione, finisci quel passaggio: la richiesta di
              autorizzazione resta indietro e va riaperta. Questa pagina si
              aggiorna da sola appena l&apos;accesso è fatto.
            </Text>
            <InlineStack>
              <Button onClick={startConnect}>
                Riapri la pagina di autorizzazione
              </Button>
            </InlineStack>
          </BlockStack>
        </Banner>
      )}

      <InlineStack>
        <Button
          variant="primary"
          onClick={startConnect}
          loading={connecting}
          disabled={disabled || connecting}
        >
          Collega Supabase
        </Button>
      </InlineStack>
    </BlockStack>
  );
}
