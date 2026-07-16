// app/components/Dashboard/SupabaseConnect.tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFetcher, useRevalidator } from '@remix-run/react';
import {
  BlockStack,
  InlineStack,
  Box,
  Button,
  Text,
  Banner,
  Combobox,
  Listbox,
  Icon,
  Select,
  TextField,
  Spinner,
} from '@shopify/polaris';
import { SearchIcon } from '@shopify/polaris-icons';

interface SupabaseProject {
  id: string;
  name: string;
  organization_id: string;
  region: string;
}

interface SupabaseConnectProps {
  connected: boolean;
  projectName?: string;
  projectUrl?: string;
}

export function SupabaseConnect({ connected, projectName, projectUrl }: SupabaseConnectProps) {
  const revalidator = useRevalidator();
  const urlFetcher = useFetcher<{ url?: string; error?: string }>();
  const projectsFetcher = useFetcher<{ projects: SupabaseProject[]; error?: string }>();
  const selectFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const disconnectFetcher = useFetcher<{ ok?: boolean }>();

  const [connecting, setConnecting] = useState(false);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [selectedRef, setSelectedRef] = useState<string>('');
  const [query, setQuery] = useState('');
  const [popupRef, setPopupRef] = useState<Window | null>(null);

  // State for create-project form
  const regionsFetcher = useFetcher<{ regions: { id: string; name: string }[] }>();
  const createFetcher = useFetcher<{ ok?: boolean; ref?: string; password?: string; error?: string }>();
  const regenFetcher = useFetcher<{ ok?: boolean; password?: string; error?: string }>();

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [region, setRegion] = useState('eu-central-1');
  const [genPassword, setGenPassword] = useState('');
  const [creatingRef, setCreatingRef] = useState<string | null>(null);
  const [provisioning, setProvisioning] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Ricezione esito OAuth dal popup (origine validata).
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

  // Reindirizza il popup quando l'URL di authorize è pronto.
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

  const disconnect = useCallback(() => {
    disconnectFetcher.submit(null, { method: 'post', action: '/api/supabase/disconnect' });
  }, [disconnectFetcher]);

  // Al successo di selezione o disconnessione, ricarica il loader.
  useEffect(() => {
    if (selectFetcher.data?.ok || disconnectFetcher.data?.ok) {
      revalidator.revalidate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectFetcher.data, disconnectFetcher.data]);

  const projects = projectsFetcher.data?.projects;
  const projectsLoaded = projectsFetcher.state === 'idle' && projects !== undefined;

  const filtered = useMemo(() => {
    if (!projects) return [];
    const q = query.toLowerCase();
    return q ? projects.filter((p) => p.name.toLowerCase().includes(q)) : projects;
  }, [projects, query]);

  const selectedName = projects?.find((p) => p.id === selectedRef)?.name ?? '';

  // Carica le region quando si apre il form.
  useEffect(() => {
    if (showCreate && regionsFetcher.state === 'idle' && !regionsFetcher.data) {
      regionsFetcher.load('/api/supabase/regions');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCreate]);

  // Quando la creazione ritorna il ref, mostra la password e avvia il polling.
  useEffect(() => {
    if (createFetcher.data?.ok && createFetcher.data.ref) {
      setGenPassword(createFetcher.data.password ?? '');
      setCreatingRef(createFetcher.data.ref);
      setProvisioning(true);
      setCreateError(null);
    } else if (createFetcher.data && createFetcher.data.ok === false) {
      setCreateError(createFetcher.data.error ?? 'Creazione non riuscita.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createFetcher.data]);

  // Aggiorna la password mostrata dopo un "Rigenera".
  useEffect(() => {
    if (regenFetcher.data?.ok && regenFetcher.data.password) {
      setGenPassword(regenFetcher.data.password);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regenFetcher.data]);

  // Polling dello stato del progetto finché è pronto, poi select-project.
  useEffect(() => {
    if (!provisioning || !creatingRef) return;
    let cancelled = false;
    const started = Date.now();
    const timer = setInterval(async () => {
      if (cancelled) return;
      if (Date.now() - started > 3 * 60 * 1000) {
        clearInterval(timer);
        setProvisioning(false);
        setCreateError('Il provisioning ci sta mettendo più del previsto. Riprova tra poco.');
        return;
      }
      try {
        const res = await fetch(`/api/supabase/project-status?ref=${encodeURIComponent(creatingRef)}`);
        const data = (await res.json()) as { ready?: boolean };
        if (data.ready && !cancelled) {
          clearInterval(timer);
          setProvisioning(false);
          selectFetcher.submit(
            { ref: creatingRef },
            { method: 'post', action: '/api/supabase/select-project', encType: 'application/json' },
          );
        }
      } catch {
        // rete transitoria: riprova al tick successivo
      }
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provisioning, creatingRef]);

  const submitCreate = useCallback(() => {
    setCreateError(null);
    createFetcher.submit(
      { name: newName, region },
      { method: 'post', action: '/api/supabase/create-project', encType: 'application/json' },
    );
  }, [createFetcher, newName, region]);

  const regenerate = useCallback(() => {
    regenFetcher.submit(null, { method: 'post', action: '/api/supabase/regenerate-password' });
  }, [regenFetcher]);

  // STATO: collegato
  if (connected) {
    return (
      <BlockStack gap="300">
        <Banner tone="success">
          Supabase collegato{projectName ? ` — progetto ${projectName}` : ''}.
        </Banner>
        {projectUrl && (
          <Text as="p" tone="subdued">
            URL: <code>{projectUrl}</code>
          </Text>
        )}
        <InlineStack gap="200">
          <Button variant="primary" disabled>
            Collega Supabase
          </Button>
          <Button
            tone="critical"
            onClick={disconnect}
            loading={disconnectFetcher.state !== 'idle'}
          >
            Disconnetti
          </Button>
        </InlineStack>
      </BlockStack>
    );
  }

  return (
    <BlockStack gap="300">
      <Text as="p" tone="subdued">
        Verrai portato su Supabase per accedere o creare gratuitamente un account, poi torni
        qui. L'app elencherà i tuoi progetti e configurerà le tabelle nel progetto scelto.
      </Text>

      {oauthError && <Banner tone="critical">{oauthError}</Banner>}

      {!projectsLoaded && (
        <InlineStack>
          <Button variant="primary" onClick={startConnect} loading={connecting}>
            Collega Supabase
          </Button>
        </InlineStack>
      )}

      {projectsLoaded && projects && projects.length === 0 && (
        <Banner tone="warning">
          Nessun progetto trovato nel tuo account Supabase. Puoi crearne uno qui sotto.
        </Banner>
      )}

      {projectsLoaded && projects && projects.length > 0 && (
        <Box maxWidth="50%">
          <Combobox
            activator={
              <Combobox.TextField
                prefix={<Icon source={SearchIcon} />}
                onChange={setQuery}
                label="Progetto Supabase"
                value={selectedName || query}
                placeholder="Seleziona un progetto…"
                autoComplete="off"
              />
            }
          >
            {filtered.length > 0 ? (
              <Listbox
                onSelect={(value) => {
                  setSelectedRef(value);
                  setQuery('');
                }}
              >
                {filtered.map((p) => (
                  <Listbox.Option key={p.id} value={p.id} selected={p.id === selectedRef}>
                    {p.name}
                  </Listbox.Option>
                ))}
              </Listbox>
            ) : null}
          </Combobox>
        </Box>
      )}

      {projectsLoaded && projects && !showCreate && (
        <InlineStack>
          <Button onClick={() => setShowCreate(true)}>➕ Crea nuovo progetto</Button>
        </InlineStack>
      )}

      {showCreate && (
        <Box maxWidth="50%">
          <BlockStack gap="300">
            <TextField
              label="Nome del nuovo progetto"
              value={newName}
              onChange={setNewName}
              autoComplete="off"
            />
            <Select
              label="Region"
              options={(regionsFetcher.data?.regions ?? [{ id: 'eu-central-1', name: 'Central EU (Frankfurt)' }]).map(
                (r) => ({ label: r.name, value: r.id }),
              )}
              value={region}
              onChange={setRegion}
            />
            {genPassword && (
              <BlockStack gap="100">
                <Text as="p" tone="subdued">
                  Password del database (salvata in modo sicuro, copiala ora):
                </Text>
                <InlineStack gap="200" blockAlign="center">
                  <code>{genPassword}</code>
                  <Button onClick={() => navigator.clipboard?.writeText(genPassword)}>Copia</Button>
                  <Button
                    onClick={regenerate}
                    loading={regenFetcher.state !== 'idle'}
                    disabled={!creatingRef}
                  >
                    Rigenera password
                  </Button>
                </InlineStack>
                {regenFetcher.data?.error && (
                  <Banner tone="warning">{regenFetcher.data.error}</Banner>
                )}
              </BlockStack>
            )}
            {createError && <Banner tone="critical">{createError}</Banner>}
            {provisioning ? (
              <InlineStack gap="200" blockAlign="center">
                <Spinner accessibilityLabel="Creazione in corso" size="small" />
                <Text as="span">Creazione del progetto in corso… (può richiedere 1-2 minuti)</Text>
              </InlineStack>
            ) : (
              <InlineStack gap="200">
                <Button
                  variant="primary"
                  onClick={submitCreate}
                  loading={createFetcher.state !== 'idle'}
                  disabled={!newName}
                >
                  Crea progetto
                </Button>
                <Button onClick={() => setShowCreate(false)}>Annulla</Button>
              </InlineStack>
            )}
          </BlockStack>
        </Box>
      )}

      {selectedRef && (
        <BlockStack gap="200">
          <Text as="p" tone="subdued">
            Progetto: <strong>{selectedName}</strong> — URL:{' '}
            <code>https://{selectedRef}.supabase.co</code>. Confermando, l'app salverà le chiavi
            e creerà le tabelle <code>products</code>/<code>customers</code>.
          </Text>
          {selectFetcher.data?.error && <Banner tone="critical">{selectFetcher.data.error}</Banner>}
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
  );
}
