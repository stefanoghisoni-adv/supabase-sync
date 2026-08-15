import { BlockStack, InlineStack, Spinner, Text } from '@shopify/polaris';
import { TrackingConflicts, type TrackingConflictsProps } from './TrackingConflicts';
import { useT } from '~/lib/i18n/context';

export interface TrackingCheckStepProps extends Omit<TrackingConflictsProps, 'variant'> {
  /** Il controllo e' ancora in corso. */
  loading: boolean;
}

/**
 * Terzo passo: cosa, su questo negozio, sta gia' mandando eventi.
 *
 * Prima era un avviso in cima alla dashboard. Durante la configurazione pero'
 * non e' una notizia da dare di sfuggita: e' un passaggio, e viene prima della
 * scelta del piano perche' e' li' che il merchant capisce cosa sta comprando —
 * un tracciamento che sostituisce quello che ha, non uno che ci si somma.
 */
export function TrackingCheckStep({ loading, findings, ...rest }: TrackingCheckStepProps) {
  const t = useT();
  if (loading) {
    return (
      <InlineStack gap="200" blockAlign="center" wrap={false}>
        <Spinner size="small" accessibilityLabel={t.tracking.checkingLabel} />
        <Text as="p" tone="subdued">
          {t.tracking.checking}
        </Text>
      </InlineStack>
    );
  }

  if (findings.length === 0) {
    return (
      <BlockStack gap="200">
        <Text as="p">{t.tracking.nothingFound}</Text>
        {/* Dirlo apertamente: l'elenco e' per forza parziale, e "non ho trovato
            nulla" letto come "sei a posto" e' esattamente cio' che non possiamo
            garantire. */}
        <Text as="p" tone="subdued" variant="bodySm">
          {t.tracking.partialNote}
        </Text>
      </BlockStack>
    );
  }

  return <TrackingConflicts findings={findings} variant="plain" {...rest} />;
}
