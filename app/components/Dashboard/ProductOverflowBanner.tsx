import { useCallback, useState } from 'react';
import { useFetcher } from '@remix-run/react';
import {
  Badge,
  Banner,
  BlockStack,
  Button,
  InlineStack,
  Modal,
  Text,
} from '@shopify/polaris';
import { planLabel } from './account-format';
import {
  planComparisonRows,
  type PlanForSuggestion,
} from './plan-suggestion';

type SubscribeResponse =
  | { confirmationUrl: string }
  | { ok: true }
  | { error: string };

export interface ProductOverflowBannerProps {
  /** Prodotti totali del negozio: idonei e non idonei insieme. */
  totalProducts: number;
  currentPlan: PlanForSuggestion;
  /** Piano proposto; null = non c'e' niente da proporre e il banner non compare. */
  suggestedPlan: PlanForSuggestion | null;
  disabled?: boolean;
}

/**
 * Avviso per chi ha piu' prodotti di quanti il suo piano ne sincronizzi.
 *
 * Distinto dall'avviso di quota in esaurimento: quello dice che lo spazio sta
 * finendo, questo che una parte del catalogo resta gia' fuori. E soprattutto
 * porta con se' la soluzione, invece di rimandare a un'altra pagina: il nome
 * del piano che basta e' gia' calcolato, e l'aggiornamento si conferma qui.
 */
export function ProductOverflowBanner({
  totalProducts,
  currentPlan,
  suggestedPlan,
  disabled,
}: ProductOverflowBannerProps) {
  const [confirming, setConfirming] = useState(false);
  const fetcher = useFetcher<SubscribeResponse>();
  const submitting = fetcher.state !== 'idle';

  const confirm = useCallback(() => {
    if (!suggestedPlan) return;
    fetcher.submit(
      { plan: suggestedPlan.planName },
      { method: 'POST', action: '/billing/subscribe' },
    );
  }, [fetcher, suggestedPlan]);

  // Shopify vuole la conferma dell'addebito fuori dal riquadro dell'app: si
  // esce dall'iframe, non si naviga dentro.
  const confirmationUrl =
    fetcher.data && 'confirmationUrl' in fetcher.data ? fetcher.data.confirmationUrl : null;
  if (confirmationUrl && typeof window !== 'undefined') {
    window.top?.location.replace(confirmationUrl);
  }

  if (!suggestedPlan) return null;

  const nextLabel = planLabel(suggestedPlan.planName);
  const excluded = currentPlan.maxProducts == null ? 0 : totalProducts - currentPlan.maxProducts;
  const rows = planComparisonRows(currentPlan, suggestedPlan);
  const error = fetcher.data && 'error' in fetcher.data ? fetcher.data.error : null;

  return (
    <>
      <Banner tone="warning" title="Una parte del catalogo resta fuori">
        <BlockStack gap="300">
          <Text as="p">
            Il negozio ha {totalProducts} prodotti e il piano {planLabel(currentPlan.planName)} ne
            sincronizza fino a {currentPlan.maxProducts}: {excluded}{' '}
            {excluded === 1 ? 'resta escluso' : 'restano esclusi'}. Con {nextLabel} rientrano tutti,
            anche quelli che oggi non sono ancora idonei.
          </Text>
          {error && <Text as="p" tone="critical">{error}</Text>}
          <InlineStack>
            <Button
              variant="primary"
              onClick={() => setConfirming(true)}
              disabled={disabled || submitting}
            >
              {`Aggiorna ora a ${nextLabel}`}
            </Button>
          </InlineStack>
        </BlockStack>
      </Banner>

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Stai per passare a ${nextLabel}`}
        primaryAction={{
          content: 'Conferma e procedi',
          onAction: confirm,
          loading: submitting,
          disabled: submitting,
        }}
        secondaryActions={[
          { content: 'Annulla', onAction: () => setConfirming(false), disabled: submitting },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <InlineStack gap="400" align="space-between" blockAlign="center">
              <Text as="span" variant="bodySm" tone="subdued">
                Cosa cambia
              </Text>
              <InlineStack gap="400">
                <Text as="span" variant="bodySm" tone="subdued">
                  {planLabel(currentPlan.planName)}
                </Text>
                <Text as="span" variant="bodySm" tone="subdued">
                  {nextLabel}
                </Text>
              </InlineStack>
            </InlineStack>

            {rows.map((row) => (
              <InlineStack key={row.label} gap="400" align="space-between" blockAlign="center">
                <Text as="span">{row.label}</Text>
                <InlineStack gap="400" blockAlign="center">
                  {/* Il valore che si lascia resta in grigio: e' il termine di
                      paragone, non una cosa da leggere per prima. */}
                  <Text as="span" tone="subdued">
                    {row.current}
                  </Text>
                  <Badge tone="success">{row.next}</Badge>
                </InlineStack>
              </InlineStack>
            ))}

            <Text as="p" tone="subdued">
              L&apos;addebito viene confermato da te su Shopify: da qui non parte nessun pagamento.
            </Text>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </>
  );
}
