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

  const rows = (
    <BlockStack gap="300">
      <MetricRow label="Clienti totali" badge={{ content: value(totalCustomers) }} />
      <MetricRow
        label="Clienti opt-in"
        info={OPT_IN_INFO}
        badge={{ tone: 'success', content: value(optIn) }}
      />
      <MetricRow label="Clienti opt-out" info={OPT_OUT_INFO} badge={{ content: value(optOut) }} />
    </BlockStack>
  );

  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h2" variant="headingMd">
          Clienti
        </Text>
        {enabled ? (
          rows
        ) : (
          <Box position="relative">
            {/* Contenuto reale ma inerte: non deve essere raggiungibile da tastiera
                ne' letto dagli screen reader, perche' mostra numeri che il piano
                corrente non da' diritto di vedere. */}
            <div aria-hidden="true" style={{ pointerEvents: 'none' }}>
              {rows}
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
              <Tooltip content="Presto disponibile">
                <Button variant="primary" disabled>
                  Aggiorna piano
                </Button>
              </Tooltip>
            </div>
          </Box>
        )}
      </BlockStack>
    </Card>
  );
}
