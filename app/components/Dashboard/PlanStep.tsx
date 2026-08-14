import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  InlineGrid,
  InlineStack,
  RadioButton,
  Text,
} from '@shopify/polaris';
import type { PlanCard } from '~/components/Billing/plan-catalog';
import { PlanFeatureList } from '~/components/Billing/PlanFeatureList';
import { planPriceLabel } from './plan-step';

export interface PlanStepProps {
  /** Le card fra cui scegliere. Vuoto = nessuna scelta da fare. */
  cards: PlanCard[];
  /** Per quanti cicli vale il prezzo riservato del partner, se ce n'e' uno. */
  discountIntervals: number | null;
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
  const hasChoice = cards.length > 0;
  const isCurrent = (card: PlanCard) =>
    card.name.trim().toLowerCase() === currentPlanName.trim().toLowerCase();

  return (
    <BlockStack gap="400">
      {hasChoice ? (
        <BlockStack gap="300">
          <Text as="p" tone="subdued">
            {planChosen
              ? 'Confermi il piano attivo, oppure ne scegli un altro: la sincronizzazione parte subito dopo.'
              : 'Il piano stabilisce quanti prodotti entrano e ogni quanto si aggiornano.'}
          </Text>

          <InlineGrid columns={{ xs: 1, sm: 2, lg: 4 }} gap="300">
            {cards.map((card) => {
              const chosen = card.name === selected;
              return (
                // L'anello attorno alla card selezionata: Polaris non espone il
                // bordo della Card, e l'outline su un contenitore non occupa
                // spazio — quindi la card non si restringe quando si accende.
                // Stessa tecnica gia' usata per il "Consigliato" nella tab Piano.
                <div
                  key={card.name}
                  style={{
                    borderRadius: 'var(--p-border-radius-300)',
                    outline: chosen ? '2px solid var(--p-color-bg-fill-brand)' : undefined,
                    display: 'grid',
                  }}
                >
                  <Card padding="400">
                    {/* Colonna a tutta altezza: l'elenco delle funzioni parte
                        alla stessa quota su tutte le card, che affiancate hanno
                        altezze diverse solo se qualcosa va a capo. */}
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                      <BlockStack gap="300">
                        <InlineStack gap="200" blockAlign="center" wrap={false}>
                          {/* Il radio e' l'unico comando: l'etichetta e' il nome
                              del piano, quindi ci si clicca sopra. */}
                          <RadioButton
                            label={card.name}
                            checked={chosen}
                            id={`plan-${card.name}`}
                            name="plan-step"
                            onChange={() => onSelect(card.name)}
                            disabled={disabled || loading}
                          />
                          {isCurrent(card) && <Badge tone="info">Attuale</Badge>}
                          {/* Consigliato per QUESTO negozio: il piu' economico
                              che contenga il suo catalogo. Non e' il
                              "consigliato" del listino, uguale per tutti. */}
                          {card.name === recommendedPlanName && !isCurrent(card) && (
                            <Badge tone="success">Consigliato</Badge>
                          )}
                        </InlineStack>

                        <Text as="p" variant="headingLg">
                          {planPriceLabel(card, discountIntervals)}
                        </Text>

                        <PlanFeatureList features={card.features} />
                      </BlockStack>
                    </div>
                  </Card>
                </div>
              );
            })}
          </InlineGrid>
        </BlockStack>
      ) : (
        <Text as="p">
          Il tuo piano:{' '}
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
            Conferma e sincronizza
          </Button>
        </InlineStack>
      </Box>
    </BlockStack>
  );
}
