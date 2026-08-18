import { useT } from '~/lib/i18n/context';
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
  OptionList,
  Popover,
  Spinner,
  Text,
  TextField,
} from '@shopify/polaris';
import { SearchIcon, PlusIcon } from '@shopify/polaris-icons';
import { groupRegionsByContinent } from '~/lib/supabase-regions';

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
}: SupabaseProjectConnectProps) {
  const t = useT();
  const revalidator = useRevalidator();
  const projectsFetcher = useFetcher<{ projects: SupabaseProject[]; error?: string }>();
  const selectFetcher = useFetcher<{ ok?: boolean; error?: string }>();

  const [selectedRef, setSelectedRef] = useState<string>('');
  const [query, setQuery] = useState('');

  // Creazione di un nuovo progetto.
  const regionsFetcher = useFetcher<{ regions: { id: string; name: string }[] }>();
  const createFetcher = useFetcher<{
    ok?: boolean;
    ref?: string;
    error?: string;
    code?: string;
    billingUrl?: string | null;
  }>();

  const [showCreate, setShowCreate] = useState(false);
  // Il merchant ha un database collegato ma vuole sceglierne un altro. Finche'
  // non ne conferma uno resta collegato a quello di prima: cambiare non e'
  // scollegare, e nessun dato si muove finche' la scelta non e' fatta.
  const [changing, setChanging] = useState(false);
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

  const [regionPopoverActive, setRegionPopoverActive] = useState(false);
  // Se la richiesta delle region non arriva mai in porto (rete giù, 500), dopo
  // qualche secondo smettiamo di mostrare il loader e ripieghiamo sulla lista
  // statica: meglio un default utilizzabile di uno spinner infinito.
  const [regionsTimedOut, setRegionsTimedOut] = useState(false);

  const [creatingRef, setCreatingRef] = useState<string | null>(null);
  const [provisioning, setProvisioning] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // La schermata di scelta e' a video: o perche' non c'e' ancora un database, o
  // perche' se ne sta cambiando uno. E' l'unica condizione che conta — dalla
  // sola `connected` l'elenco non veniva mai chiesto a chi premeva "Cambia
  // database", e il riquadro restava a caricare per sempre.
  const choosing = !connected || changing;

  // L'elenco dei progetti si carica appena la scelta e' a video: chi e' qui ha
  // gia' dato il consenso, quindi non c'e' altro da chiedergli.
  useEffect(() => {
    if (!choosing) return;
    if (projectsFetcher.state === 'idle' && !projectsFetcher.data) {
      projectsFetcher.load('/api/supabase/projects');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choosing]);

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

  // Scelto il database, ricarica il loader: da li' in poi la pagina parla del
  // collegamento nuovo.
  useEffect(() => {
    if (selectFetcher.data?.ok) revalidator.revalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectFetcher.data]);

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

  // Verifica i limiti del piano appena serve saperlo: il controllo deve essere
  // gia' concluso (o in corso, col suo loader) quando il merchant guarda il
  // pulsante "Crea un nuovo database". Serve in due momenti — mentre sceglie
  // fra i progetti, e a collegamento fatto, dove quel pulsante sta accanto a
  // "Cambia database".
  useEffect(() => {
    if ((projectsLoaded || connected) && limitsFetcher.state === 'idle' && !limitsFetcher.data) {
      limitsFetcher.load('/api/supabase/project-limits');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectsLoaded, connected]);

  // Quando la creazione ritorna il ref si avvia il polling.
  useEffect(() => {
    if (createFetcher.data?.ok && createFetcher.data.ref) {
      setCreatingRef(createFetcher.data.ref);
      setProvisioning(true);
      setCreateError(null);
    } else if (createFetcher.data && createFetcher.data.ok === false) {
      setCreateError(createFetcher.data.error ?? 'Creazione non riuscita.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createFetcher.data]);

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

  // STATO: database collegato
  if (!choosing) {
    return (
      <BlockStack gap="300">
        {authorization === 'DISABLED' ? (
          <Banner tone="critical">{t.connect.database.syncDisabled}</Banner>
        ) : authorization === 'PENDING' ? (
          <Banner tone="warning">{t.connect.database.syncSuspended}</Banner>
        ) : null}
        {projectName && (
          <Text as="p" tone="subdued">
            {t.connect.database.connectedTo} <strong>{projectName}</strong>
          </Text>
        )}
        <InlineStack gap="200">
          {/* Crearne uno nuovo viene prima: e' la strada di chi non ha ancora
              il database che gli serve. Spento quando il piano Supabase non
              consente altri progetti — resta al suo posto per dire cosa non si
              puo' fare, invece di sparire senza spiegazioni. */}
          <Button
            icon={PlusIcon}
            onClick={() => {
              setChanging(true);
              setShowCreate(true);
            }}
            loading={limitsChecking}
            disabled={disabled || limitsChecking || planLimitHit}
          >
            {t.connect.database.create}
          </Button>
          {/* Cambiare database non e' scollegarsi: si torna alla scelta, e
              quello di adesso resta collegato finche' non se ne conferma un
              altro. Scollegarsi e' un'altra cosa e sta nel passo sopra, con
              l'account. */}
          <Button onClick={() => setChanging(true)} disabled={disabled}>
            {t.connect.database.change}
          </Button>
        </InlineStack>

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
              ? t.connect.database.limitKnown(
                  limits.planLabel,
                  limits.maxProjects,
                  limits.activeProjects,
                )
              : t.connect.database.limitUnknown}{' '}
            {t.connect.database.limitBefore}{' '}
            {/* Button e non Link: dentro un Banner, Polaris spegne i Link
                rendendoli monocromatici (leggono BannerContext e non hanno una
                prop per chiedere il contrario). Il Button variant="plain" resta
                blu, ed e' lo stesso comando gia' usato altrove nell'app. */}
            {planLimitBillingUrl ? (
              <Button variant="plain" url={planLimitBillingUrl} target="_blank">
                {t.connect.database.limitUpgradeLink}
              </Button>
            ) : (
              t.connect.database.limitUpgradePlain
            )}
            {t.connect.database.limitAfter}
          </Text>
        </Banner>
      )}

      {projectsFetcher.data?.error && (
        <Banner tone="critical">{projectsFetcher.data.error}</Banner>
      )}

      {!projectsLoaded && (
        <InlineStack gap="200" blockAlign="center">
          <Spinner accessibilityLabel={t.connect.database.loading} size="small" />
          <Text as="span" tone="subdued">
            {t.connect.database.loading}
          </Text>
        </InlineStack>
      )}

      {projectsLoaded && projects && projects.length === 0 && (
        <Banner tone="warning">
          {t.connect.database.none}
        </Banner>
      )}

      {/* La scelta fra i database esistenti sparisce mentre se ne sta creando
          uno nuovo: sono due strade alternative, e chi ha appena premuto "Crea"
          non ha piu' niente da scegliere li' dentro. Compariva perche' la
          condizione guardava solo quanti progetti esistono — e un progetto,
          appena creato, esiste. Si torna alla scelta con "Annulla". */}
      {projectsLoaded && projects && projects.length > 0 && !showCreate && (
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
                label={t.connect.database.label}
                value={selectedRef ? selectedName : query}
                placeholder={t.connect.database.placeholder}
                autoComplete="off"
                // Con una scelta fatta il campo non si puo' piu' svuotare
                // scrivendoci dentro: la "x" e' l'unico modo per tornare
                // indietro e poter creare un progetto nuovo.
                clearButton={Boolean(selectedRef || query)}
                onClearButtonClick={() => {
                  setSelectedRef('');
                  setQuery('');
                }}
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
          {/* Con un database scelto la conferma e' l'azione principale, ma la
              creazione resta al suo posto accanto: sono due strade, e la
              seconda non deve sparire solo perche' si e' data un'occhiata alla
              prima. Prima si nascondeva, e per riaverla bisognava sapere che la
              "x" nel campo la faceva tornare. */}
          {selectedRef && (
            <Button
              variant="primary"
              onClick={confirmSelection}
              loading={selectFetcher.state !== 'idle'}
              disabled={disabled}
            >
              {t.common.confirm}
            </Button>
          )}
          {/* A limite raggiunto il comando resta al suo posto, spento: dice
              cosa non si puo' fare e perche' — l'avviso qui sopra porta gia'
              all'aggiornamento del piano. */}
          <Button
            // Icona di Polaris e non l'emoji: l'emoji ha colori propri e
            // restava nera a pulsante spento, come se quella parte fosse
            // ancora attiva. L'icona segue lo stato del comando.
            icon={PlusIcon}
            onClick={() => setShowCreate(true)}
            // Loader finché non sappiamo se il piano consente un altro progetto.
            loading={limitsChecking}
            disabled={disabled || limitsChecking || planLimitHit}
          >
            {t.connect.database.create}
          </Button>
          {/* Chi sta cambiando database e' gia' collegato: qui non ha niente da
              scollegare, ha solo da poter tornare indietro. Scollegarsi si fa
              dal passo sopra, dov'e' l'account. */}
          {changing && (
            <Button
              onClick={() => {
                setChanging(false);
                setShowCreate(false);
              }}
              disabled={disabled}
            >
              {t.common.cancel}
            </Button>
          )}
        </InlineStack>
      )}

      {showCreate && (
        // Larghezza fissa invece del 50% del contenitore: il pulsante region
        // risultava lunghissimo e il popover, che si dimensiona sul contenuto,
        // sembrava scollegato. Con una larghezza contenuta i due combaciano.
        <Box maxWidth="420px">
          <BlockStack gap="300">
            <TextField
              label={t.connect.database.newName}
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
            <Labelled id="region-select" label={t.connect.database.region}>
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
                    {selectedRegionName || t.connect.database.regionPlaceholder}
                  </Button>
                }
              >
                <Popover.Pane height="280px">
                  {regionsLoading ? (
                    <Box padding="600">
                      <BlockStack gap="300" inlineAlign="center">
                        <Spinner accessibilityLabel={t.connect.database.regionsLoading} size="small" />
                        <Text as="span" tone="subdued">
                          {t.connect.database.regionsLoading}
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
            {createError && <Banner tone="critical">{createError}</Banner>}
            {provisioning ? (
              <InlineStack gap="200" blockAlign="center">
                <Spinner accessibilityLabel="Creazione in corso" size="small" />
                <Text as="span">
                  {t.connect.database.creating}
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
                <Button onClick={() => setShowCreate(false)}>{t.common.cancel}</Button>
              </InlineStack>
            )}
          </BlockStack>
        </Box>
      )}

      {selectedRef && selectFetcher.data?.error && (
        <Banner tone="critical">{selectFetcher.data.error}</Banner>
      )}
    </BlockStack>
  );
}
