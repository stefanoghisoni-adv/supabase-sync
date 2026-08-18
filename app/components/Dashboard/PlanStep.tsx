import { useT, useLocale } from '~/lib/i18n/context';
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  ButtonGroup,
  Card,
  InlineGrid,
  InlineStack,
  RadioButton,
  Text,
} from '@shopify/polaris';
import type { PlanCard } from '~/components/Billing/plan-catalog';
import { formatMoney } from '~/lib/billing/money';
import { PlanFeatureList } from '~/components/Billing/PlanFeatureList';
import type { BillingInterval } from '~/lib/billing/partner-pricing';
import { yearlySaving } from './plan-step';
import { PlanOptionGrid } from './PlanOptionGrid';

export interface PlanStepProps {
  /** Le card fra cui scegliere. Vuoto = nessuna scelta da fare. */
  cards: PlanCard[];
  /** Per quanti cicli vale il prezzo riservato del partner, se ce n'e' uno. */
  discountIntervals: number | null;
  /**
   * La valuta in cui sono scritti i prezzi delle card — la stessa in cui il
   * negozio verra' addebitato. Arriva con i prezzi e non si separa mai da loro.
   */
  currency: string;
  /** Mensile o annuale: cambia tutti i prezzi insieme. */
  interval: BillingInterval;
  onIntervalChange: (interval: BillingInterval) => void;
  /** Nome del piano selezionato, '' se nessuno. */
  selected: string;
  onSelect: (planName: string) => void;
  /** Il piano attivo adesso: si segnala, non si nasconde. */
  currentPlanName: string;
  /** Il piano che basta a questo catalogo: porta il badge "Consigliato". */
  recommendedPlanName: string | null;
  /**
   * Il negozio ha gia' un piano attivo scelto in passato. Cambia il tono del
   * passo: non "scegli", ma "conferma quello che hai".
   */
  planChosen: boolean;
  onConfirm: () => void;
  loading: boolean;
  disabled: boolean;
  error?: string | null;
}

/**
 * Quarto passo: il piano, e con esso la prima sincronizzazione.
 *
 * I due gesti stanno insieme perche' sono la stessa decisione: e' il piano a
 * stabilire quanti prodotti entrano e ogni quanto si aggiornano, quindi
 * sincronizzare prima di averlo scelto significherebbe farlo due volte. Il
 * pulsante lo dice: "Conferma e sincronizza".
 *
 * Le card sono quelle della tab Piano, con lo stesso elenco di cio' che ogni
 * piano include: un elenco di righe di testo faceva scegliere al buio, e i
 * prezzi da soli non dicono cosa cambia da uno all'altro.
 */
export function PlanStep({
  cards,
  discountIntervals,
  currency,
  interval,
  onIntervalChange,
  selected,
  onSelect,
  currentPlanName,
  recommendedPlanName,
  planChosen,
  onConfirm,
  loading,
  disabled,
  error,
}: PlanStepProps) {
  const t = useT();
  const locale = useLocale();
  const hasChoice = cards.length > 0;
  const saving = yearlySaving(cards);
  const isCurrent = (card: PlanCard) =>
    card.name.trim().toLowerCase() === currentPlanName.trim().toLowerCase();

  return (
    <BlockStack gap="400">
      {hasChoice ? (
        <BlockStack gap="300">
          <Text as="p" tone="subdued">
            {planChosen ? t.planStep.introConfirm : t.planStep.introChoose}
          </Text>

          {/* La cadenza sta sopra le card perche' cambia tutti i prezzi
              insieme: dentro ciascuna card avrebbe fatto credere che si potesse
              pagare un piano al mese e un altro all'anno. */}
          <InlineStack gap="300" blockAlign="center">
            <ButtonGroup variant="segmented">
              <Button
                pressed={interval === 'monthly'}
                onClick={() => onIntervalChange('monthly')}
                disabled={disabled || loading}
              >
                {t.planStep.monthly}
              </Button>
              <Button
                pressed={interval === 'yearly'}
                onClick={() => onIntervalChange('yearly')}
                disabled={disabled || loading}
              >
                {t.planStep.yearly}
              </Button>
            </ButtonGroup>
            {interval === 'monthly' && saving != null && (
              <Text as="span" tone="subdued">
                {t.planStep.yearlyHint(formatMoney(saving, currency, locale))}
              </Text>
            )}
          </InlineStack>

          <PlanOptionGrid
            cards={cards}
            selected={selected}
            onSelect={onSelect}
            currentPlanName={currentPlanName}
            recommendedPlanName={recommendedPlanName}
            discountIntervals={discountIntervals}
            interval={interval}
            currency={currency}
            disabled={disabled}
            loading={loading}
          />
        </BlockStack>
      ) : (
        <Text as="p">
          {t.planStep.yourPlan}{' '}
          <Text as="span" fontWeight="bold">
            {currentPlanName}
          </Text>
        </Text>
      )}

      {error && <Banner tone="critical">{error}</Banner>}

      <Box paddingBlockStart="100">
        <InlineStack>
          <Button
            variant="primary"
            onClick={onConfirm}
            loading={loading}
            disabled={disabled || loading || (hasChoice && !selected)}
          >
            {t.planStep.confirmAndSync}
          </Button>
        </InlineStack>
      </Box>
    </BlockStack>
  );
}
