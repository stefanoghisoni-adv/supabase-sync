// app/components/Dashboard/SupabaseConnect.tsx
import { useCallback, useEffect, useState } from 'react';
import { useFetcher, useRevalidator } from '@remix-run/react';
import {
  BlockStack,
  InlineStack,
  Button,
  Text,
  Select,
  Banner,
  Spinner,
} from '@shopify/polaris';

interface SupabaseProject {
  id: string;
  name: string;
  organization_id: string;
  region: string;
}

export function SupabaseConnect() {
  const revalidator = useRevalidator();
  const urlFetcher = useFetcher<{ url?: string; error?: string }>();
  const projectsFetcher = useFetcher<{ projects: SupabaseProject[]; error?: string }>();
  const selectFetcher = useFetcher<{ ok?: boolean; error?: string }>();

  const [connecting, setConnecting] = useState(false);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [selectedRef, setSelectedRef] = useState<string>('');
  // Riferimento al popup aperto sincronicamente (dichiarato prima degli effetti che lo usano).
  const [popupRef, setPopupRef] = useState<Window | null>(null);

  // 1) Ricezione dell'esito OAuth dal popup (origine validata).
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
        projectsFetcher.load('/api/supabase/projects');
      } else {
        setOauthError('Collegamento a Supabase non riuscito. Riprova.');
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2) Quando l'URL di authorize è pronto, reindirizza il popup già aperto.
  useEffect(() => {
    if (urlFetcher.data?.url && popupRef) {
      popupRef.location.href = urlFetcher.data.url;
    } else if (urlFetcher.data?.error && popupRef) {
      popupRef.close();
      setPopupRef(null);
      setConnecting(false);
      setOauthError(urlFetcher.data.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlFetcher.data]);

  const startConnect = useCallback(() => {
    setOauthError(null);
    // Apertura SINCRONA nel gesto utente per non farlo bloccare.
    const popup = window.open('', 'supabase-oauth', 'width=600,height=760');
    if (!popup) {
      setOauthError('Consenti i popup per collegare Supabase.');
      return;
    }
    setPopupRef(popup);
    setConnecting(true);
    urlFetcher.submit(null, { method: 'post', action: '/api/supabase/oauth-url' });
  }, [urlFetcher]);

  const confirmSelection = useCallback(() => {
    selectFetcher.submit(
      { ref: selectedRef },
      { method: 'post', action: '/api/supabase/select-project', encType: 'application/json' },
    );
  }, [selectFetcher, selectedRef]);

  // Al successo della selezione, ricarica il loader → lo stepper avanza.
  useEffect(() => {
    if (selectFetcher.data?.ok) {
      revalidator.revalidate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectFetcher.data]);

  const projects = projectsFetcher.data?.projects;
  const projectsLoaded = projectsFetcher.state === 'idle' && projects !== undefined;

  return (
    <BlockStack gap="300">
      <Text as="p" tone="subdued">
        Collega il tuo account Supabase: l'app elencherà i tuoi progetti e configurerà
        automaticamente le tabelle nel progetto scelto.
      </Text>

      {oauthError && <Banner tone="critical">{oauthError}</Banner>}

      {!projectsLoaded && (
        <InlineStack gap="200" blockAlign="center">
          <Button variant="primary" onClick={startConnect} disabled={connecting}>
            Collega Supabase
          </Button>
          {connecting && <Spinner accessibilityLabel="Collegamento in corso" size="small" />}
        </InlineStack>
      )}

      {projectsLoaded && projects && projects.length === 0 && (
        <Banner tone="warning">
          Nessun progetto trovato nel tuo account Supabase.{' '}
          <a href="https://supabase.com/dashboard/projects" target="_blank" rel="noreferrer">
            Creane uno sulla dashboard Supabase
          </a>{' '}
          e poi ricollega.
        </Banner>
      )}

      {projectsLoaded && projects && projects.length > 0 && (
        <BlockStack gap="300">
          <Select
            label="Progetto Supabase"
            options={[
              { label: 'Seleziona un progetto…', value: '' },
              ...projects.map((p) => ({ label: p.name, value: p.id })),
            ]}
            value={selectedRef}
            onChange={setSelectedRef}
          />

          {selectedRef && (
            <BlockStack gap="200">
              <Text as="p" tone="subdued">
                Progetto: <strong>{projects.find((p) => p.id === selectedRef)?.name}</strong> —
                URL: <code>https://{selectedRef}.supabase.co</code>. Confermando, l'app salverà
                le chiavi e creerà le tabelle <code>products</code>/<code>customers</code>.
              </Text>
              {selectFetcher.data?.error && (
                <Banner tone="critical">{selectFetcher.data.error}</Banner>
              )}
              <InlineStack>
                <Button
                  variant="primary"
                  onClick={confirmSelection}
                  loading={selectFetcher.state !== 'idle'}
                >
                  Conferma e crea tabelle
                </Button>
              </InlineStack>
            </BlockStack>
          )}
        </BlockStack>
      )}
    </BlockStack>
  );
}
