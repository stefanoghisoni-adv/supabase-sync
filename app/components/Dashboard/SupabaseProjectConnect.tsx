import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFetcher, useRevalidator } from '@remix-run/react';
import {
  BlockStack,
  Box,
  Button,
  Banner,
  Combobox,
  Icon,
  InlineStack,
  Labelled,
  Listbox,
  Modal,
  OptionList,
  Popover,
  Spinner,
  Text,
  TextField,
} from '@shopify/polaris';
import { SearchIcon } from '@shopify/polaris-icons';
import { groupRegionsByContinent } from '~/lib/supabase-regions';
import { projectConfirmationName, matchesProjectName } from './disconnect-confirm';

interface SupabaseProject {
  id: string;
  name: string;
  organization_id: string;
  region: string;
}

export interface SupabaseProjectConnectProps {
  /** Un database e' gia' collegato e le tabelle sono pronte. */
  connected: boolean;
  projectName?: string;
  projectUrl?: string;
  // Se true (negozio non ENABLED) tutti i pulsanti d'azione sono disabilitati.
  disabled?: boolean;
  // Stato di autorizzazione: guida il banner nello stato "collegato".
  authorization?: 'ENABLED' | 'PENDING' | 'DISABLED';
  // Disconnessione riuscita: il parent mostra il banner di conferma in cima alla
  // dashboard. Qui non lo si puo' fare, il componente viene rimontato subito dopo.
  onDisconnected?: (mode: 'delete' | 'keep') => void;
}

/**
 * Secondo passo: scelta o creazione del database.
 *
 * Arriva a questo punto chi ha gia' fatto l'accesso, quindi l'elenco dei
 * progetti si carica da solo: non ha senso far premere un altro pulsante per
 * vedere qualcosa che a questo punto e' dovuto.
 */
export function SupabaseProjectConnect({
  connected,
  projectName,
  projectUrl,
  disabled,
  authorization = 'ENABLED',
  onDisconnected,
}: SupabaseProjectConnectProps) {
  const revalidator = useRevalidator();
  const projectsFetcher = useFetcher<{ projects: SupabaseProject[]; error?: string }>();
  const selectFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const disconnectFetcher = useFetcher<{ ok?: boolean }>();

  const [selectedRef, setSelectedRef] = useState<string>('');
  const [query, setQuery] = useState('');
  const [showDisconnect, setShowDisconnect] = useState(false);
  // Secondo passaggio dell'eliminazione: il nome del progetto va scritto a
  // mano, cosi' un clic distratto non porta via tabelle e dati.
  const [askingName, setAskingName] = useState(false);
  const [typedName, setTypedName] = useState('');
  // Quale azione di disconnessione e' in corso: cosi' il loader appare SOLO sul
  // bottone cliccato ("Elimina" o "Mantieni"), mentre entrambi restano disabilitati.
  const [disconnectMode, setDisconnectMode] = useState<'delete' | 'keep' | null>(null);

  // Creazione di un nuovo progetto.
  const regionsFetcher = useFetcher<{ regions: { id: string; name: string }[] }>();
  const createFetcher = useFetcher<{
    ok?: boolean;
    ref?: string;
    password?: string;
    error?: string;
    code?: string;
    billingUrl?: string | null;
  }>();
  const regenFetcher = useFetcher<{ ok?: boolean; password?: string; error?: string }>();

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [region, setRegion] = useState('eu-central-1');
  // Limiti di progetto del piano Supabase: alimenta il loader sul pulsante di
  // creazione e, a limite raggiunto, il banner + il pulsante verso il billing.
  const limitsFetcher = useFetcher<{
    ok: boolean;
    planLabel: string | null;
    activeProjects: number;
    maxProjects: number | null;
    limitReached: boolean;
    billingUrl: string | null;
    debug: string | null;
  }>();
  const limits = limitsFetcher.data;
  const limitsChecking = limitsFetcher.state !== 'idle';

  // Il limite di piano puo' emergere in due momenti: dal controllo preventivo
  // (solo se lo scope organizations:read e' concesso, altrimenti il piano resta
  // ignoto) oppure dal rifiuto di Supabase alla creazione. Il banner e il
  // pulsante di upgrade valgono in entrambi i casi.
  const planLimitFromCreate = createFetcher.data?.code === 'plan_limit';
  const planLimitHit = Boolean(limits?.limitReached || planLimitFromCreate);
  const planLimitBillingUrl = createFetcher.data?.billingUrl ?? limits?.billingUrl ?? null;
  const disconnecting = disconnectFetcher.state !== 'idle';

  const confirmationName = projectConfirmationName({ projectName, projectUrl });
  // Senza un nome da confrontare non si puo' chiedere conferma: in quel caso il
  // passaggio non compare e resta il comportamento diretto.
  const nameConfirmed =
    confirmationName != null && matchesProjectName(typedName, confirmationName);

  const [regionPopoverActive, setRegionPopoverActive] = useState(false);
  // Se la richiesta delle region non arriva mai in porto (rete giù, 500), dopo
  // qualche secondo smettiamo di mostrare il loader e ripieghiamo sulla lista
  // statica: meglio un default utilizzabile di uno spinner infinito.
  const [regionsTimedOut, setRegionsTimedOut] = useState(false);

  const [genPassword, setGenPassword] = useState('');
  const [creatingRef, setCreatingRef] = useState<string | null>(null);
  const [provisioning, setProvisioning] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // L'elenco dei progetti si carica appena il passo e' raggiungibile: chi e' qui
  // ha gia' dato il consenso, quindi non c'e' altro da chiedergli.
  useEffect(() => {
    if (connected) return;
    if (projectsFetcher.state === 'idle' && !projectsFetcher.data) {
      projectsFetcher.load('/api/supabase/projects');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

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

  // Rientro delle opzioni rispetto al titolo di sezione: le voci risultano
  // annidate sotto il continente invece che allineate a filo con esso.
  // Memoizzato perché OptionList confronta le sezioni in profondità.
  const indentedRegionGroups = useMemo(
    () =>
      regionGroups.map((group) => ({
        title: group.title,
        options: group.options.map((option) => ({
          value: option.value,
          label: <Box paddingInlineStart="300">{option.label}</Box>,
        })),
      })),
    [regionGroups],
  );

  const confirmSelection = useCallback(() => {
    selectFetcher.submit(
      { ref: selectedRef },
      { method: 'post', action: '/api/supabase/select-project', encType: 'application/json' },
    );
  }, [selectFetcher, selectedRef]);

  // Chiudendo il modal si riparte dal principio: riaprirlo non deve ritrovare
  // il campo gia' compilato dalla volta prima.
  const closeDisconnect = useCallback(() => {
    setShowDisconnect(false);
    setAskingName(false);
    setTypedName('');
  }, []);

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
      if (disconnectFetcher.data?.ok) {
        // disconnectMode dice quale delle due strade e' stata presa: il testo
        // del banner cambia se i dati sono stati eliminati o mantenuti.
        onDisconnected?.(disconnectMode ?? 'keep');
      }
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

  // Verifica i limiti del piano appena l'elenco progetti è disponibile: il
  // controllo deve essere già concluso (o in corso, col suo loader) quando
  // l'utente guarda il pulsante "Crea nuovo progetto".
  useEffect(() => {
    if (projectsLoaded && limitsFetcher.state === 'idle' && !limitsFetcher.data) {
      limitsFetcher.load('/api/supabase/project-limits');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectsLoaded]);

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
        const res = await fetch(
          `/api/supabase/project-status?ref=${encodeURIComponent(creatingRef)}`,
        );
        const data = (await res.json()) as { ready?: boolean };
        if (data.ready && !cancelled) {
          clearInterval(timer);
          setProvisioning(false);
          selectFetcher.submit(
            { ref: creatingRef },
            {
              method: 'post',
              action: '/api/supabase/select-project',
              encType: 'application/json',
            },
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

  // STATO: database collegato
  if (connected) {
    return (
      <BlockStack gap="300">
        {authorization === 'DISABLED' ? (
          <Banner tone="critical">Sincronizzazione disabilitata.</Banner>
        ) : authorization === 'PENDING' ? (
          <Banner tone="warning">Sincronizzazione sospesa.</Banner>
        ) : null}
        {projectName && (
          <Text as="p" tone="subdued">
            Database collegato: <strong>{projectName}</strong>
          </Text>
        )}
        <InlineStack gap="200">
          <Button
            tone="critical"
            onClick={() => setShowDisconnect(true)}
            loading={disconnecting}
            disabled={disabled}
          >
            Disconnetti
          </Button>
        </InlineStack>

        <Modal
          open={showDisconnect}
          onClose={closeDisconnect}
          title="Scollegare Supabase?"
          primaryAction={{
            content: 'Elimina tabelle e dati',
            destructive: true,
            // Primo clic: chiede di scrivere il nome del progetto. Il secondo
            // cancella davvero, e arriva solo se il nome corrisponde.
            onAction: () => {
              if (confirmationName && !askingName) {
                setAskingName(true);
                return;
              }
              disconnect(true);
            },
            loading: disconnecting && disconnectMode === 'delete',
            disabled: disconnecting || (askingName && !nameConfirmed),
          }}
          secondaryActions={[
            {
              content: 'Mantieni i dati',
              onAction: () => disconnect(false),
              loading: disconnecting && disconnectMode === 'keep',
              disabled: disconnecting,
            },
            {
              content: 'Annulla',
              onAction: closeDisconnect,
              disabled: disconnecting,
            },
          ]}
        >
          <Modal.Section>
            <BlockStack gap="400">
              <Text as="p">
                Puoi <strong>eliminare</strong> le tabelle e i dati sincronizzati dal tuo
                progetto Supabase, oppure <strong>mantenerli</strong> (verrà interrotta solo la
                sincronizzazione). In entrambi i casi il collegamento verrà rimosso.
              </Text>

              {askingName && (
                <BlockStack gap="200">
                  <Text as="p">
                    Inserisci qui sotto il nome del progetto{' '}
                    <strong>{confirmationName}</strong>
                  </Text>
                  <TextField
                    label="Nome del progetto"
                    labelHidden
                    value={typedName}
                    onChange={setTypedName}
                    autoComplete="off"
                    autoFocus
                    placeholder={confirmationName ?? ''}
                    disabled={disconnecting}
                    helpText="L'eliminazione parte solo se il nome corrisponde."
                  />
                </BlockStack>
              )}
            </BlockStack>
          </Modal.Section>
        </Modal>
      </BlockStack>
    );
  }

  return (
    <BlockStack gap="300">
      {planLimitHit && (
        <Banner tone="warning" title="Hai raggiunto il limite massimo di progetti su Supabase">
          <Text as="p">
            {/* Il piano lo conosciamo solo se la OAuth App concede lo scope
                organizations:read. Quando il limite emerge dal rifiuto di
                Supabase alla creazione non lo sappiamo: in quel caso diciamo
                cosa è successo senza inventare un nome di piano. */}
            {limits?.planLabel && limits.maxProjects !== null
              ? `Il tuo piano ${limits.planLabel} consente al massimo ${limits.maxProjects} progetti attivi e ne hai già ${limits.activeProjects}.`
              : 'Il tuo piano Supabase non consente di creare altri progetti.'}{' '}
            Per crearne un altro aggiorna il piano, oppure metti in pausa un progetto
            esistente dalla dashboard Supabase: i progetti in pausa non occupano uno slot.
          </Text>
        </Banner>
      )}

      {projectsFetcher.data?.error && (
        <Banner tone="critical">{projectsFetcher.data.error}</Banner>
      )}

      {!projectsLoaded && (
        <InlineStack gap="200" blockAlign="center">
          <Spinner accessibilityLabel="Caricamento dei database" size="small" />
          <Text as="span" tone="subdued">
            Caricamento dei database del tuo account…
          </Text>
        </InlineStack>
      )}

      {projectsLoaded && projects && projects.length === 0 && (
        <Banner tone="warning">
          Nessun database trovato nel tuo account Supabase. Puoi crearne uno qui sotto.
        </Banner>
      )}

      {projectsLoaded && projects && projects.length > 0 && (
        // 65% e non meta': i nomi dei progetti Supabase sono lunghi e a meta'
        // riga finivano troncati proprio dove il merchant deve distinguerli.
        <Box maxWidth="65%">
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
                label="Database"
                value={selectedRef ? selectedName : query}
                placeholder="Seleziona un database…"
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
        // Disconnessione SEMPLICE in entrambi i rami: qui non è stato creato né
        // collegato alcun database, quindi non c'è nulla da eliminare — si
        // scollega e basta, senza il modal "mantieni/elimina dati".
        <InlineStack gap="300" blockAlign="center">
          {planLimitHit ? (
            // Limite raggiunto: creare non è possibile, quindi offriamo l'upgrade.
            <Button
              variant="primary"
              url={planLimitBillingUrl ?? undefined}
              target="_blank"
              disabled={disabled || !planLimitBillingUrl || disconnecting}
            >
              Aggiorna piano Supabase
            </Button>
          ) : (
            <Button
              onClick={() => setShowCreate(true)}
              // Loader finché non sappiamo se il piano consente un altro progetto.
              loading={limitsChecking}
              disabled={disabled || limitsChecking || disconnecting}
            >
              ➕ Crea nuovo database
            </Button>
          )}
          <Button
            tone="critical"
            onClick={() => disconnect(false)}
            loading={disconnecting}
            disabled={disabled || disconnecting}
          >
            Disconnetti
          </Button>
        </InlineStack>
      )}

      {showCreate && (
        // Larghezza fissa invece del 50% del contenitore: il pulsante region
        // risultava lunghissimo e il popover, che si dimensiona sul contenuto,
        // sembrava scollegato. Con una larghezza contenuta i due combaciano.
        <Box maxWidth="420px">
          <BlockStack gap="300">
            <TextField
              label="Nome del nuovo database"
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
                      sections={indentedRegionGroups}
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
                  <Button onClick={() => navigator.clipboard?.writeText(genPassword)}>
                    Copia
                  </Button>
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
                <Text as="span">
                  Creazione del database in corso… (può richiedere 1-2 minuti)
                </Text>
              </InlineStack>
            ) : (
              <InlineStack gap="200">
                <Button
                  variant="primary"
                  onClick={submitCreate}
                  loading={createFetcher.state !== 'idle'}
                  disabled={!newName || disabled}
                >
                  Crea database
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
            Database: <strong>{selectedName}</strong>. Confermando, l&apos;app preparerà le
            tabelle e collegherà il database.
          </Text>
          {selectFetcher.data?.error && (
            <Banner tone="critical">{selectFetcher.data.error}</Banner>
          )}
          <InlineStack>
            <Button
              variant="primary"
              onClick={confirmSelection}
              loading={selectFetcher.state !== 'idle'}
              disabled={disabled}
            >
              Conferma e prepara le tabelle
            </Button>
          </InlineStack>
        </BlockStack>
      )}
    </BlockStack>
  );
}
