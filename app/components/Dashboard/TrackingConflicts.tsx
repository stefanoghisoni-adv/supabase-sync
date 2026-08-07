import { useFetcher } from '@remix-run/react';
import { Avatar, Banner, BlockStack, Button, Icon, InlineStack, Text } from '@shopify/polaris';
import { CodeIcon } from '@shopify/polaris-icons';
import type { TrackingFinding } from '~/lib/tracking/detect';
import metaIcon from '~/assets/channel-meta.avif';

// Icone dei canali che sappiamo riconoscere. Vite le trasforma in URL con hash
// al build, quindi non serve una cartella pubblica ne' un percorso scritto a
// mano che si romperebbe in silenzio.
const CHANNEL_ICONS: Record<string, string> = {
  Meta: metaIcon,
};

export interface TrackingConflictsProps {
  findings: TrackingFinding[];
  /** `https://admin.shopify.com/store/<negozio>`, per i collegamenti all'admin. */
  adminBase?: string;
  /** Id del tema pubblicato: senza, il collegamento all'editor non si costruisce. */
  themeId?: number | null;
  /** Ricarica l'elenco dopo che una fonte e' stata messa a tacere. */
  onDismissed?: () => void;
}

/**
 * Avviso sulle altre fonti di eventi presenti sul negozio.
 *
 * Non compare quando non c'e' niente da dire. E' voluto: l'elenco e' per forza
 * parziale — alcuni strumenti non sono visibili a nessuna applicazione — quindi
 * un riquadro che dicesse "non ho trovato nulla" verrebbe letto come "sei a
 * posto", che e' precisamente cio' che non possiamo garantire.
 *
 * Ogni riga ha due strade, perche' il merchant ne sa piu' di noi: un canale puo'
 * essere collegato per il solo catalogo, con il tracciamento spento, e in quel
 * caso l'avviso e' rumore. Dichiararlo lo mette a tacere per sempre.
 */
/** Iniziali di un canale: "Facebook & Instagram" → "FI". */
function initials(name: string): string {
  return name
    .split(/[\s&]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
}

export function TrackingConflicts({
  findings,
  adminBase,
  themeId,
  onDismissed,
}: TrackingConflictsProps) {
  const fetcher = useFetcher<{ ok: boolean }>();
  const working = fetcher.state !== 'idle';

  if (findings.length === 0) return null;

  const dismiss = (finding: TrackingFinding) => {
    fetcher.submit(
      { kind: finding.kind, name: finding.name },
      { method: 'POST', action: '/api/tracking/dismiss' },
    );
    onDismissed?.();
  };

  // Dove porta il pulsante di destra. Non esegue niente: accompagna il merchant
  // dove la cosa si fa davvero. Disinstallare un'app o modificare un tema non
  // sono azioni che quest'app puo' compiere, e fingere il contrario sarebbe
  // peggio che non offrirle.
  //
  // I canali stanno in settings/sales_channels e non in settings/apps: la
  // seconda elenca tutte le applicazioni installate, e il merchant si
  // troverebbe a cercare fra quelle quella che gli abbiamo appena segnalato.
  const actionUrl = (finding: TrackingFinding): string | null => {
    if (!adminBase) return null;
    if (finding.kind === 'channel') return `${adminBase}/settings/sales_channels`;
    return themeId ? `${adminBase}/themes/${themeId}` : null;
  };

  return (
    <Banner tone="warning" title="Altre fonti di eventi su questo negozio">
      <BlockStack gap="300">
        <Text as="p">
          Ogni conversione dovrebbe essere inviata una volta sola. Se una di queste
          manda gli stessi eventi che invii tu, acquisti e valore vengono contati due
          volte e le campagne vengono ottimizzate su numeri gonfiati.
        </Text>

        <BlockStack gap="200">
          {findings.map((finding) => {
            const url = actionUrl(finding);
            return (
              <InlineStack
                key={`${finding.kind}-${finding.name}`}
                align="space-between"
                blockAlign="center"
                gap="400"
              >
                <InlineStack gap="300" blockAlign="center" wrap={false}>
                  {/* Segno visivo della riga. NON e' il logo dell'app: Shopify
                      non espone l'icona delle applicazioni altrui — verificato,
                      `catalog` torna null su ogni canale — e disegnare noi il
                      marchio di Meta o Google sarebbe usare un segno che non ci
                      appartiene per parlare di loro. Le iniziali del canale
                      distinguono le righe senza spacciarsi per altro. */}
                  {finding.kind !== 'channel' ? (
                    <Icon source={CodeIcon} tone="subdued" />
                  ) : CHANNEL_ICONS[finding.name] ? (
                    <img
                      src={CHANNEL_ICONS[finding.name]}
                      alt=""
                      width={24}
                      height={24}
                      style={{ borderRadius: 'var(--p-border-radius-100)', display: 'block' }}
                    />
                  ) : (
                    // Canale di cui non abbiamo l'icona: le iniziali. Shopify non
                    // espone il logo delle app altrui (verificato: `catalog` torna
                    // null), quindi ogni icona va aggiunta a mano qui sopra.
                    <Avatar size="sm" name={finding.where} initials={initials(finding.where)} />
                  )}
                  {/* Il nome che il merchant riconosce e' quello dell'app come la
                      vede nel suo admin ("Facebook & Instagram"), non il nome della
                      piattaforma dietro ("Meta"): e' quello che deve andare a
                      cercare fra i canali. Per il codice nel tema il nome dello
                      strumento e' invece l'unica cosa che serve. */}
                  <Text as="span" fontWeight="semibold">
                    {finding.kind === 'channel' ? finding.where : finding.name}
                  </Text>
                </InlineStack>

                <InlineStack gap="200">
                  <Button onClick={() => dismiss(finding)} disabled={working}>
                    {finding.kind === 'channel'
                      ? 'Gestisce solo shop e cataloghi'
                      : 'Non considerare'}
                  </Button>
                  {/* _top e non una scheda nuova: l'admin di Shopify rifiuta di
                      essere incorniciato, quindi un collegamento normale da qui
                      dentro finisce in "Connessione negata". Si esce dal riquadro
                      dell'app restando nella stessa scheda. */}
                  <Button variant="primary" url={url ?? undefined} target="_top" disabled={!url}>
                    {finding.kind === 'channel' ? 'Disinstalla' : 'Rimuovi snippet'}
                  </Button>
                </InlineStack>
              </InlineStack>
            );
          })}
        </BlockStack>

        <Text as="p" tone="subdued">
          L&apos;elenco può non essere completo: i pixel personalizzati aggiunti in
          Impostazioni → Eventi cliente non sono visibili da qui. Vale la pena
          controllarli insieme a questi.
        </Text>
      </BlockStack>
    </Banner>
  );
}
