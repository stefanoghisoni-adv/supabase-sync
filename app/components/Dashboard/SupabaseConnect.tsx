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
  Labelled,
  Popover,
  OptionList,
  Icon,
  TextField,
  Spinner,
  Modal,
} from '@shopify/polaris';
import { SearchIcon } from '@shopify/polaris-icons';
import { groupRegionsByContinent } from '~/lib/supabase-regions';

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
  // Se true (negozio non ENABLED) tutti i pulsanti d'azione sono disabilitati.
  disabled?: boolean;
  // Stato di autorizzazione: guida il banner nello stato "collegato".
  authorization?: 'ENABLED' | 'PENDING' | 'DISABLED';
  // Notifica il parent lo stato del flusso di collegamento (guida il badge del
  // primo step: In corso / Fallito / Non collegato).
  onConnectStatusChange?: (status: SupabaseConnectStatus) => void;
}

export type SupabaseConnectStatus = 'idle' | 'in_progress' | 'failed';

export function SupabaseConnect({ connected, projectName, projectUrl, disabled, authorization = 'ENABLED', onConnectStatusChange }: SupabaseConnectProps) {
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
  const [showDisconnect, setShowDisconnect] = useState(false);
  // True se l'ultimo tentativo di collegamento è fallito (popup chiuso senza
  // confermare l'integrazione, o errore OAuth): guida il badge "Fallito".
  const [connectFailed, setConnectFailed] = useState(false);
  // Quale azione di disconnessione è in corso: così il loader appare SOLO sul
  // bottone cliccato ("Elimina" o "Mantieni"), mentre entrambi restano disabilitati.
  const [disconnectMode, setDisconnectMode] = useState<'delete' | 'keep' | null>(null);

  // State for create-project form
  const regionsFetcher = useFetcher<{ regions: { id: string; name: string }[] }>();
  const createFetcher = useFetcher<{ ok?: boolean; ref?: string; password?: string; error?: string }>();
  const regenFetcher = useFetcher<{ ok?: boolean; password?: string; error?: string }>();

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [region, setRegion] = useState('eu-central-1');
  const [regionPopoverActive, setRegionPopoverActive] = useState(false);
  // Se la richiesta delle region non arriva mai in porto (rete giù, 500), dopo
  // qualche secondo smettiamo di mostrare il loader e ripieghiamo sulla lista
  // statica: meglio un default utilizzabile di uno spinner infinito.
  const [regionsTimedOut, setRegionsTimedOut] = useState(false);

  useEffect(() => {
    if (!showCreate || regionsFetcher.data || regionsFetcher.state === 'loading') return;
    const timer = setTimeout(() => setRegionsTimedOut(true), 8000);
    return () => clearTimeout(timer);
  }, [showCreate, regionsFetcher.data, regionsFetcher.state]);

  // Loader nel dropdown finché non sono disponibili TUTTE le region: prima
  // mostravamo subito la sola Frankfurt del fallback, dando l'impressione che
  // l'Europa avesse una voce sola.
  const regionsLoading = !regionsFetcher.data && !regionsTimedOut;

  // Fallback usato sia mentre si carica (per l'etichetta del pulsante) sia se
  // la richiesta è andata a vuoto: il form resta utilizzabile.
  const allRegions = regionsFetcher.data?.regions ?? [
    { id: 'eu-central-1', name: 'Central EU (Frankfurt)' },
  ];
  const selectedRegionName = allRegions.find((r) => r.id === region)?.name ?? '';
  const regionGroups = useMemo(
    () => groupRegionsByContinent(allRegions),
    // allRegions deriva da regionsFetcher.data: dipendiamo da quello, non
    // dall'array ricreato a ogni render dal fallback qui sopra.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [regionsFetcher.data],
  );
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
        setConnectFailed(false);
        projectsFetcher.load('/api/supabase/projects');
      } else {
        setConnectFailed(true);
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
      setConnectFailed(true);
      setOauthError(urlFetcher.data.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlFetcher.data]);

  // Rileva la chiusura del popup senza esito: se l'utente chiude la finestra
  // OAuth senza confermare l'integrazione, nessun messaggio arriva → il flusso
  // è fallito. (Alla connessione riuscita `connecting` è già false: niente fallito.)
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

  const confirmSelection = useCallback(() => {
    selectFetcher.submit(
      { ref: selectedRef },
      { method: 'post', action: '/api/supabase/select-project', encType: 'application/json' },
    );
  }, [selectFetcher, selectedRef]);

  const disconnect = useCallback(
    (deleteData: boolean) => {
      setDisconnectMode(deleteData ? 'delete' : 'keep');
      disconnectFetcher.submit(
        { deleteData },
        { method: 'post', action: '/api/supabase/disconnect', encType: 'application/json' },
      );
    },
    [disconnectFetcher],
  );

  // Al successo di selezione o disconnessione, ricarica il loader.
  useEffect(() => {
    if (selectFetcher.data?.ok || disconnectFetcher.data?.ok) {
      revalidator.revalidate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectFetcher.data, disconnectFetcher.data]);

  const projects = projectsFetcher.data?.projects;
  const projectsLoaded = projectsFetcher.state === 'idle' && projects !== undefined;

  // "In corso": il flusso di collegamento è partito ma non ancora completato
  // (OAuth, caricamento/scelta progetto, creazione tabelle).
  const flowActive =
    !connected &&
    (connecting ||
      projectsFetcher.state === 'loading' ||
      projectsLoaded ||
      provisioning ||
      selectFetcher.state !== 'idle' ||
      createFetcher.state !== 'idle');

  // Stato notificato al parent per il badge del primo step:
  // Non collegato (idle) → In corso → Fallito → (Collegato lo decide il parent).
  const connectStatus: SupabaseConnectStatus = connectFailed
    ? 'failed'
    : flowActive
      ? 'in_progress'
      : 'idle';
  useEffect(() => {
    onConnectStatusChange?.(connectStatus);
  }, [connectStatus, onConnectStatusChange]);

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
  }, [provisioning, creatingRef, selectFetcher]);

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
        {authorization === 'DISABLED' ? (
          <Banner tone="critical">Sincronizzazione disabilitata.</Banner>
        ) : authorization === 'PENDING' ? (
          <Banner tone="warning">Sincronizzazione sospesa.</Banner>
        ) : null}
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
            onClick={() => setShowDisconnect(true)}
            loading={disconnectFetcher.state !== 'idle'}
            disabled={disabled}
          >
            Disconnetti
          </Button>
        </InlineStack>

        <Modal
          open={showDisconnect}
          onClose={() => setShowDisconnect(false)}
          title="Scollegare Supabase?"
          primaryAction={{
            content: 'Elimina tabelle e dati',
            destructive: true,
            onAction: () => disconnect(true),
            loading: disconnectFetcher.state !== 'idle' && disconnectMode === 'delete',
            disabled: disconnectFetcher.state !== 'idle',
          }}
          secondaryActions={[
            {
              content: 'Mantieni i dati',
              onAction: () => disconnect(false),
              loading: disconnectFetcher.state !== 'idle' && disconnectMode === 'keep',
              disabled: disconnectFetcher.state !== 'idle',
            },
            {
              content: 'Annulla',
              onAction: () => setShowDisconnect(false),
              disabled: disconnectFetcher.state !== 'idle',
            },
          ]}
        >
          <Modal.Section>
            <Text as="p">
              Puoi <strong>eliminare</strong> le tabelle e i dati sincronizzati dal tuo
              progetto Supabase, oppure <strong>mantenerli</strong> (verrà interrotta solo la
              sincronizzazione). In entrambi i casi il collegamento verrà rimosso.
            </Text>
          </Modal.Section>
        </Modal>
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
          <Button
            variant="primary"
            onClick={startConnect}
            // Resta in loading da quando parte OAuth fino al caricamento dei
            // progetti: torna attivo solo se il collegamento fallisce (oauthError).
            loading={connecting || projectsFetcher.state === 'loading'}
            disabled={disabled || connecting || projectsFetcher.state === 'loading'}
          >
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
                onChange={(v) => {
                  setQuery(v);
                  // Ricominciare a digitare annulla la selezione, così il
                  // campo mostra ciò che si sta cercando e la lista si rifiltra.
                  if (selectedRef) setSelectedRef('');
                }}
                label="Progetto Supabase"
                value={selectedRef ? selectedName : query}
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
          <Button onClick={() => setShowCreate(true)} disabled={disabled}>➕ Crea nuovo progetto</Button>
        </InlineStack>
      )}

      {showCreate && (
        // Larghezza fissa invece del 50% del contenitore: il pulsante region
        // risultava lunghissimo e il popover, che si dimensiona sul contenuto,
        // sembrava scollegato. Con una larghezza contenuta i due combaciano.
        <Box maxWidth="420px">
          <BlockStack gap="300">
            <TextField
              label="Nome del nuovo progetto"
              value={newName}
              onChange={setNewName}
              autoComplete="off"
            />
            {/* Popover + OptionList, non <Select>: quest'ultimo rende un <select>
                nativo, quindi il menu aperto sarebbe quello del sistema operativo.
                L'attivatore e' un Button con disclosure, cosi' si legge come un
                select e non come un campo di testo. OptionList da' gia' i titoli di
                sezione in grassetto (Text headingSm) con le opzioni in peso normale,
                e non disegna divider: nessun bordo dopo l'ultima sezione. */}
            <Labelled id="region-select" label="Region">
              <Popover
                active={regionPopoverActive}
                // Popover largo quanto l'attivatore: pulsante e menu combaciano.
                fullWidth
                // Sotto al campo, non sopra. L'altezza fissa del Pane serve
                // proprio a questo: un popover corto entra nello spazio
                // disponibile, quindi Polaris non e' costretto a ribaltarlo in
                // alto quando il form sta in fondo alla pagina.
                preferredPosition="below"
                onClose={() => setRegionPopoverActive(false)}
                activator={
                  <Button
                    id="region-select"
                    onClick={() => setRegionPopoverActive((active) => !active)}
                    disclosure
                    fullWidth
                    textAlign="left"
                    disabled={disabled}
                  >
                    {selectedRegionName || 'Seleziona una region…'}
                  </Button>
                }
              >
                <Popover.Pane height="280px">
                  {regionsLoading ? (
                    <Box padding="600">
                      <BlockStack gap="300" inlineAlign="center">
                        <Spinner accessibilityLabel="Caricamento delle region" size="small" />
                        <Text as="span" tone="subdued">
                          Caricamento delle region…
                        </Text>
                      </BlockStack>
                    </Box>
                  ) : (
                    <OptionList
                      sections={regionGroups}
                      selected={[region]}
                      onChange={(selected) => {
                        if (selected[0]) setRegion(selected[0]);
                        setRegionPopoverActive(false);
                      }}
                    />
                  )}
                </Popover.Pane>
              </Popover>
            </Labelled>
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
                    disabled={!creatingRef || provisioning}
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
                  disabled={!newName || disabled}
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
              disabled={disabled}
            >
              Conferma e crea tabelle
            </Button>
          </InlineStack>
        </BlockStack>
      )}
    </BlockStack>
  );
}
