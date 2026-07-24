import { Card, BlockStack, Text, Button, Tooltip, Box } from '@shopify/polaris';
import { MetricRow } from './MetricRow';

const OPT_IN_INFO = 'Qui vengono identificati i clienti che hanno acconsentito al marketing';
const OPT_OUT_INFO = 'Qui vengono identificati i clienti che non hanno acconsentito al marketing';

export interface CustomersCardProps {
  enabled: boolean;
  totalCustomers: number;
  optIn: number;
  optOut: number;
  loading: boolean;
}

export function CustomersCard({
  enabled,
  totalCustomers,
  optIn,
  optOut,
  loading,
}: CustomersCardProps) {
  const value = (n: number) => (loading ? '—' : String(n));

  // `withInfo` esiste per l'accessibilita' della variante bloccata: il Tooltip di
  // Polaris imposta tabIndex=0 sul proprio nodo, quindi le icone info sarebbero
  // raggiungibili col tab anche dietro l'overlay (pointer-events blocca il mouse,
  // non la tastiera) — e un aria-hidden con discendenti focalizzabili e' una
  // violazione WAI-ARIA. Da bloccata quindi i tooltip non si renderizzano affatto.
  const rows = (withInfo: boolean) => (
    <BlockStack gap="300">
      <MetricRow label="Clienti totali" badge={{ content: value(totalCustomers) }} />
      <MetricRow
        label="Clienti opt-in"
        info={withInfo ? OPT_IN_INFO : undefined}
        badge={{ tone: 'success', content: value(optIn) }}
      />
      <MetricRow
        label="Clienti opt-out"
        info={withInfo ? OPT_OUT_INFO : undefined}
        badge={{ content: value(optOut) }}
      />
    </BlockStack>
  );

  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h2" variant="headingMd">
          Clienti
        </Text>
        {enabled ? (
          rows(true)
        ) : (
          <Box position="relative">
            {/* Contenuto reale ma inerte: non deve essere raggiungibile da tastiera
                ne' letto dagli screen reader, perche' mostra numeri che il piano
                corrente non da' diritto di vedere. Senza tooltip non resta nulla
                di focalizzabile, quindi l'aria-hidden e' legittimo. */}
            <div aria-hidden="true" style={{ pointerEvents: 'none' }}>
              {rows(false)}
            </div>
            {/* Velo che sfuma dal 40% in alto (prime righe intraviste) all'opaco in
                basso. Polaris non ha un token per i gradienti: unica eccezione. */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background:
                  'linear-gradient(to bottom, rgba(255,255,255,0.4) 0%, rgba(255,255,255,1) 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <BlockStack gap="200" inlineAlign="center">
                <Tooltip content="Presto disponibile">
                  <Button variant="primary" disabled>
                    Aggiorna piano
                  </Button>
                </Tooltip>
                {/* Sta nell'overlay insieme al pulsante, non fra le righe velate:
                    quelle sono aria-hidden, questa deve restare leggibile. */}
                <Box paddingInline="400">
                  <Text as="p" tone="subdued" alignment="center" variant="bodySm">
                    Potenzia la trasmissione dei dati utente monitorando anche il
                    lifetime value (LTV) e lifetime profit (LTP).
                  </Text>
                </Box>
              </BlockStack>
            </div>
          </Box>
        )}
      </BlockStack>
    </Card>
  );
}
