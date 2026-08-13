import type { ReactNode } from 'react';
import {
  BlockStack,
  InlineStack,
  Banner,
  Button,
  ChoiceList,
  Text,
} from '@shopify/polaris';
import type { PlanChoiceOption } from './plan-step';
import { useNavLoading } from './nav-loading';

const PLAN_PATH = '/plan';

export interface PlanStepProps {
  /** Le opzioni fra cui scegliere. Vuoto = nessuna scelta da fare. */
  options: PlanChoiceOption[];
  /** Nome del piano selezionato, '' se nessuno. */
  selected: string;
  onSelect: (planName: string) => void;
  /**
   * Il negozio ha gia' un piano attivo scelto in passato. Cambia il tono del
   * passo: non "scegli", ma "conferma quello che hai".
   */
  planChosen: boolean;
  /** Riepilogo del piano attivo, quando c'e' solo da confermarlo. */
  currentPlanName: string;
  currentPlanSummary: string;
  onConfirm: () => void;
  loading: boolean;
  disabled: boolean;
  error?: string | null;
  /** Il riquadro "Cosa verrà sincronizzato", che il parent sa comporre. */
  children?: ReactNode;
}

/**
 * Terzo passo: il piano, e con esso la prima sincronizzazione.
 *
 * I due gesti stanno insieme perche' sono la stessa decisione: e' il piano a
 * stabilire quanti prodotti entrano e ogni quanto si aggiornano, quindi
 * sincronizzare prima di averlo scelto significherebbe farlo due volte. Il
 * pulsante lo dice: "Conferma e sincronizza".
 *
 * Il confronto per esteso resta nella tab Piano. Qui bastano nome, prezzo e le
 * tre righe che cambiano da un piano all'altro: chi vuole vedere tutto ha il
 * collegamento.
 */
export function PlanStep({
  options,
  selected,
  onSelect,
  planChosen,
  currentPlanName,
  currentPlanSummary,
  onConfirm,
  loading,
  disabled,
  error,
  children,
}: PlanStepProps) {
  // Come gli altri pulsanti-link della dashboard: lo spinner solo se e' stato
  // questo a far partire la navigazione.
  const plan = useNavLoading(PLAN_PATH);
  const hasChoice = options.length > 0;

  return (
    <BlockStack gap="400">
      {children}

      {planChosen || !hasChoice ? (
        <BlockStack gap="200">
          {currentPlanName && (
            <Text as="p">
              Il tuo piano:{' '}
              <Text as="span" fontWeight="bold">
                {currentPlanName}
              </Text>
            </Text>
          )}
          {currentPlanSummary && (
            <Text as="p" tone="subdued" variant="bodySm">
              {currentPlanSummary}
            </Text>
          )}
        </BlockStack>
      ) : (
        <ChoiceList
          title="Scegli il piano"
          choices={options.map((option) => ({
            value: option.value,
            label: option.label,
            helpText: option.helpText,
          }))}
          selected={selected ? [selected] : []}
          onChange={(values) => onSelect(values[0] ?? '')}
          disabled={disabled || loading}
        />
      )}

      {error && <Banner tone="critical">{error}</Banner>}

      <InlineStack gap="300" blockAlign="center">
        <Button
          variant="primary"
          onClick={onConfirm}
          loading={loading}
          disabled={disabled || loading || (hasChoice && !planChosen && !selected)}
        >
          Conferma e sincronizza
        </Button>
        {hasChoice && (
          <Button
            variant="plain"
            url={PLAN_PATH}
            onClick={plan.start}
            disabled={plan.loading}
            loading={plan.loading}
          >
            {planChosen ? 'Cambia piano' : 'Confronta i piani'}
          </Button>
        )}
      </InlineStack>
    </BlockStack>
  );
}
