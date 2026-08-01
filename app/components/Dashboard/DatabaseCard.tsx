import { useCallback, useState } from 'react';
import { Card, BlockStack, InlineStack, Text, Button, Tooltip } from '@shopify/polaris';
import { MetricRow } from './MetricRow';
import { middleTruncate } from './copy-value';

export interface DatabaseCardProps {
  connected: boolean;
  /** Indirizzo dell'app a cui puntare il tool di tracciamento. */
  appUrl: string | null;
  /** Chiave di lettura da usare insieme all'indirizzo qui sopra. */
  readKey: string | null;
}

/**
 * Riga con il valore che si copia con un clic: niente pulsante accanto, il
 * valore stesso e' il bersaglio. Il tooltip dice cosa succede prima del clic e
 * conferma dopo, cosi' non serve spostare l'occhio altrove per sapere se ha
 * funzionato.
 *
 * Stessa impaginazione di MetricRow — etichetta a sinistra, valore a destra —
 * cosi' i valori cadono nella colonna del badge dello stato e la card si legge
 * per colonne invece che a blocchi.
 */
function CopyableRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    // clipboard non c'e' fuori da un contesto sicuro: senza questo controllo il
    // clic andrebbe in errore invece di non fare nulla.
    navigator.clipboard?.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [value]);

  return (
    <InlineStack align="space-between" blockAlign="center" gap="200" wrap={false}>
      <Text as="span" variant="bodyMd">
        {label}
      </Text>
      {/* copy-value: il valore sta in secondo piano e si accende al passaggio
          del puntatore (regole in dashboard.css, il pulsante non prende una
          classe propria). */}
      <div className="copy-value">
        <Tooltip content={copied ? 'Copiato' : 'Clicca per copiare'}>
          {/* monochromePlain: e' un valore da leggere, non un link da seguire, e
              del blu non ha bisogno. Il testo mostrato puo' essere accorciato,
              quello copiato e' sempre intero. */}
          <Button variant="monochromePlain" onClick={copy} textAlign="right">
            {middleTruncate(value)}
          </Button>
        </Tooltip>
      </div>
    </InlineStack>
  );
}

export function DatabaseCard({ connected, appUrl, readKey }: DatabaseCardProps) {
  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h2" variant="headingMd">
          Database
        </Text>
        <MetricRow
          label="Stato"
          badge={{
            tone: connected ? 'success' : undefined,
            content: connected ? 'Collegato' : 'Non collegato',
          }}
        />
        {/* Senza collegamento non esistono ne' indirizzo ne' chiave: la card
            resta alla sola riga di stato. */}
        {appUrl && <CopyableRow label="App URL" value={appUrl} />}
        {readKey && <CopyableRow label="Publishable API Key" value={readKey} />}
      </BlockStack>
    </Card>
  );
}
