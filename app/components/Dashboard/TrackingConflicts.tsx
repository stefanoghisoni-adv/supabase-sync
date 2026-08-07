import { useFetcher } from '@remix-run/react';
import { Banner, BlockStack, Button, InlineStack, Text } from '@shopify/polaris';
import type { TrackingFinding } from '~/lib/tracking/detect';

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
  const actionUrl = (finding: TrackingFinding): string | null => {
    if (!adminBase) return null;
    if (finding.kind === 'channel') return `${adminBase}/settings/apps`;
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
                <BlockStack gap="0">
                  <Text as="span" fontWeight="semibold">
                    {finding.name}
                  </Text>
                  <Text as="span" tone="subdued" variant="bodySm">
                    {finding.kind === 'channel'
                      ? `Canale di vendita — ${finding.where}`
                      : `Codice nel tema — ${finding.where}`}
                  </Text>
                </BlockStack>

                <InlineStack gap="200">
                  <Button onClick={() => dismiss(finding)} disabled={working}>
                    {finding.kind === 'channel'
                      ? 'Gestisce solo shop e cataloghi'
                      : 'Non considerare'}
                  </Button>
                  <Button variant="primary" url={url ?? undefined} target="_blank" disabled={!url}>
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
