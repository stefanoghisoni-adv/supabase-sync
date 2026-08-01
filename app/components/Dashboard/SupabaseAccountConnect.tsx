import { useCallback, useEffect, useState } from 'react';
import { useFetcher, useRevalidator } from '@remix-run/react';
import { BlockStack, Button, Banner, InlineStack, Text } from '@shopify/polaris';

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

  // Finestra chiusa senza esito: nessun messaggio arriva, quindi il tentativo e'
  // fallito. (A collegamento riuscito `connecting` e' gia' false.)
  useEffect(() => {
    if (!popupRef) return;
    const timer = setInterval(() => {
      if (popupRef.closed) {
        clearInterval(timer);
        setConnecting((isConnecting) => {
          if (isConnecting) setConnectFailed(true);
          return false;
        });
        setPopupRef(null);
      }
    }, 500);
    return () => clearInterval(timer);
  }, [popupRef]);

  const startConnect = useCallback(() => {
    setOauthError(null);
    setConnectFailed(false);
    const popup = window.open('', 'supabase-oauth', 'width=600,height=760');
    if (!popup) {
      setOauthError('Consenti i popup per collegare Supabase.');
      return;
    }
    setPopupRef(popup);
    setConnecting(true);
    urlFetcher.submit(null, { method: 'post', action: '/api/supabase/oauth-url' });
  }, [urlFetcher]);

  // Con quale account si e' entrati: si chiede solo a collegamento fatto, e
  // dopo che la pagina e' gia' comparsa. Finche' non arriva, la frase resta
  // quella corta.
  useEffect(() => {
    if (!connected) return;
    if (accountFetcher.state === 'idle' && !accountFetcher.data) {
      accountFetcher.load('/api/supabase/account');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);
  const accountEmail = accountFetcher.data?.email ?? null;

  const status: SupabaseConnectStatus = connectFailed
    ? 'failed'
    : connecting
      ? 'in_progress'
      : 'idle';
  useEffect(() => {
    onStatusChange?.(status);
  }, [status, onStatusChange]);

  if (connected) {
    return (
      <Text as="p" tone="subdued">
        {accountEmail
          ? `Accesso effettuato con ${accountEmail} dell'account Supabase.`
          : 'Accesso effettuato.'}
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
