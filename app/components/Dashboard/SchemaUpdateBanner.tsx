import { useEffect } from 'react';
import { useFetcher, useRevalidator } from '@remix-run/react';
import { Banner, BlockStack, InlineStack, Text, Button } from '@shopify/polaris';

interface MigrateResponse {
  ok: boolean;
  error?: string;
}

/**
 * Aggiornamento delle tabelle in attesa.
 *
 * Non si chiude: finche' le tabelle sono indietro la sincronizzazione non puo'
 * scrivere tutto quello che dovrebbe, quindi la notizia resta vera e va tenuta
 * davanti agli occhi. Sparisce da se' quando l'aggiornamento e' andato a buon
 * fine — che nella maggior parte dei casi succede da solo, senza che il
 * merchant clicchi nulla.
 */
export function SchemaUpdateBanner() {
  const fetcher = useFetcher<MigrateResponse>();
  const revalidator = useRevalidator();
  const running = fetcher.state !== 'idle';

  // Riuscito: si ricarica lo stato della pagina e il banner sparisce da se'.
  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data?.ok) {
      revalidator.revalidate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);

  return (
    <Banner tone="warning" title="Aggiornamento del database disponibile">
      <BlockStack gap="200">
        <Text as="p">
          È disponibile un aggiornamento delle tabelle del tuo database. Non devi
          accedere al database né toccare tabelle o colonne, e non devi
          riconfermare l&apos;integrazione: basta un clic e l&apos;aggiornamento
          viene eseguito per te. I dati già sincronizzati restano dove sono.
        </Text>

        {fetcher.data?.ok === false && fetcher.data.error ? (
          <Text as="p" tone="critical">
            {fetcher.data.error}
          </Text>
        ) : null}

        <InlineStack>
          <Button
            variant="primary"
            loading={running}
            disabled={running}
            onClick={() =>
              fetcher.submit(null, { method: 'post', action: '/api/supabase/migrate' })
            }
          >
            Esegui aggiornamento sul database
          </Button>
        </InlineStack>
      </BlockStack>
    </Banner>
  );
}
