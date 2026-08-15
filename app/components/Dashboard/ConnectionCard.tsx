import type { ReactNode } from 'react';
import { Card, BlockStack, Text } from '@shopify/polaris';
import { MetricRow } from './MetricRow';
import { useT } from '~/lib/i18n/context';

/**
 * Il collegamento, quando non e' piu' un passo da fare.
 *
 * A setup concluso i tre passi spariscono dalla dashboard: hanno finito il loro
 * lavoro e occupavano meta' pagina per non dire piu' niente. Quel che resta
 * utile — con che account si e' entrati, quale database e' collegato, e il modo
 * per staccarlo — vive qui, in una card come le altre.
 *
 * Dentro ci vanno gli stessi componenti dei passi, che a collegamento fatto si
 * riducono gia' a poche righe: cosi' la disconnessione resta quella di sempre,
 * con la stessa conferma, e non ne esiste una seconda copia da tenere allineata.
 */
export function ConnectionCard({ children }: { children: ReactNode }) {
  const t = useT();
  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h2" variant="headingMd">
          {t.dashboard.connection.title}
        </Text>
        {/* La riga di stato apre la card come nelle altre: etichetta a
            sinistra, badge a destra. La card compare solo a collegamento
            fatto, quindi non ha un altro stato da dire. */}
        <MetricRow
          label={t.database.status}
          badge={{ tone: 'success', content: t.common.connected }}
        />
        {children}
      </BlockStack>
    </Card>
  );
}
