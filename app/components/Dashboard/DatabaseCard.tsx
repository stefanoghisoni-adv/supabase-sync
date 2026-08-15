import { useCallback, useEffect, useState } from 'react';
import {
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Tooltip,
  Divider,
} from '@shopify/polaris';
import { MetricRow } from './MetricRow';
import { middleTruncate, copyToClipboard } from './copy-value';
import { useT } from '~/lib/i18n/context';

export interface DatabaseCardProps {
  connected: boolean;
  /** Indirizzo dell'app a cui puntare il tool di tracciamento. */
  appUrl: string | null;
  /** Chiave di lettura da usare insieme all'indirizzo qui sopra. */
  readKey: string | null;
  /** Indirizzo a cui il progetto risponde: si legge e si copia. */
  databaseUrl: string | null;
  /**
   * La pagina del progetto sulla dashboard di Supabase: e' li' che si va a
   * guardare le tabelle. `databaseUrl` aperto in un browser darebbe una
   * risposta dell'API, non una pagina.
   */
  dashboardUrl: string | null;
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
  const t = useT();
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    // La conferma appare solo a copia riuscita: dentro la cornice dell'admin il
    // permesso puo' mancare, e copyToClipboard lo dice invece di far finta.
    copyToClipboard(value).then((ok) => {
      if (!ok) return;
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
        <Tooltip content={copied ? t.database.copied : t.database.copy}>
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

/**
 * Riga di un valore che esiste solo a database collegato.
 *
 * La riga c'e' comunque: sparendo, la card non direbbe quali dati serviranno
 * per il tracciamento, e il collegamento sembrerebbe togliere qualcosa invece
 * di aggiungerlo. Finche' non c'e' nulla da copiare, al posto del valore va un
 * badge grigio — che e' il modo in cui il resto delle Impostazioni dice "questa
 * cosa non e' in uso".
 */
function ValueRow({
  label,
  value,
  available,
}: {
  label: string;
  value: string | null;
  available: boolean;
}) {
  const t = useT();
  if (!available || !value) {
    return <MetricRow label={label} badge={{ content: t.database.notConfigured }} />;
  }
  return <CopyableRow label={label} value={value} />;
}

/**
 * L'indirizzo del database per esteso, con il pulsante che lo apre.
 *
 * Non e' una riga da copiare come le altre: si legge tutto intero e sta a
 * sinistra, perche' e' un indirizzo e va riconosciuto a colpo d'occhio. Il
 * pulsante porta fuori dall'admin, quindi il caricamento non e' una navigazione
 * che possiamo seguire: lo stato di attesa e' a tempo, il minimo per non far
 * partire due schede con due clic ravvicinati.
 */
function DatabaseAddress({ url, openUrl }: { url: string; openUrl: string }) {
  const t = useT();
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    if (!opening) return;
    const timer = setTimeout(() => setOpening(false), 1500);
    return () => clearTimeout(timer);
  }, [opening]);

  return (
    <BlockStack gap="200">
      <Text as="span" variant="bodyMd">
        {t.database.ownerUrl}
      </Text>
      <InlineStack align="space-between" blockAlign="center" gap="300" wrap={false}>
        <Text as="span" tone="subdued" breakWord>
          {url}
        </Text>
        <Button
          url={openUrl}
          target="_blank"
          onClick={() => setOpening(true)}
          loading={opening}
          disabled={opening}
        >
          {t.database.open}
        </Button>
      </InlineStack>
    </BlockStack>
  );
}

export function DatabaseCard({
  connected,
  appUrl,
  readKey,
  databaseUrl,
  dashboardUrl,
}: DatabaseCardProps) {
  const t = useT();
  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h2" variant="headingMd">
          {t.database.title}
        </Text>
        <MetricRow
          label={t.database.status}
          badge={{
            tone: connected ? 'success' : undefined,
            content: connected ? t.common.connected : t.common.notConnected,
          }}
        />
        <ValueRow label={t.database.appUrl} value={appUrl} available={connected} />
        <ValueRow
          label={t.database.readKey}
          value={readKey}
          available={connected}
        />
        {connected && databaseUrl && (
          <>
            <Divider />
            <DatabaseAddress url={databaseUrl} openUrl={dashboardUrl ?? databaseUrl} />
          </>
        )}
      </BlockStack>
    </Card>
  );
}
