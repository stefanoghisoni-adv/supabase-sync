import { Banner, BlockStack, List, Text } from '@shopify/polaris';
import type { TrackingFinding } from '~/lib/tracking/detect';

export interface TrackingConflictsProps {
  findings: TrackingFinding[];
}

/**
 * Avviso sulle altre fonti di eventi presenti sul negozio.
 *
 * Non compare quando non c'e' niente da dire. E' voluto: l'elenco e' per forza
 * parziale — alcuni strumenti non sono visibili a nessuna applicazione — quindi
 * un riquadro che dicesse "non ho trovato nulla" verrebbe letto come "sei a
 * posto", che e' precisamente cio' che non possiamo garantire.
 */
export function TrackingConflicts({ findings }: TrackingConflictsProps) {
  if (findings.length === 0) return null;

  const channels = findings.filter((f) => f.kind === 'channel');
  const theme = findings.filter((f) => f.kind === 'theme');

  return (
    <Banner tone="warning" title="Altre fonti di eventi su questo negozio">
      <BlockStack gap="300">
        <Text as="p">
          Ogni conversione dovrebbe essere inviata una volta sola. Qui sotto trovi
          quello che risulta gia' attivo: se manda gli stessi eventi che invii tu,
          acquisti e valore vengono contati due volte, e le campagne vengono
          ottimizzate su numeri gonfiati.
        </Text>

        {channels.length > 0 && (
          <BlockStack gap="100">
            <Text as="h3" variant="headingSm">
              Canali di vendita collegati
            </Text>
            <List>
              {channels.map((f) => (
                <List.Item key={`${f.kind}-${f.name}`}>
                  {f.name} — tramite “{f.where}”
                </List.Item>
              ))}
            </List>
          </BlockStack>
        )}

        {theme.length > 0 && (
          <BlockStack gap="100">
            <Text as="h3" variant="headingSm">
              Codice presente nel tema
            </Text>
            <List>
              {theme.map((f) => (
                <List.Item key={`${f.kind}-${f.name}`}>
                  {f.name} — in {f.where}
                </List.Item>
              ))}
            </List>
          </BlockStack>
        )}

        <Text as="p" tone="subdued">
          L&apos;elenco può non essere completo: i pixel personalizzati aggiunti in
          Impostazioni → Eventi cliente non sono visibili da qui. Vale la pena
          controllarli insieme a questi.
        </Text>
      </BlockStack>
    </Banner>
  );
}
