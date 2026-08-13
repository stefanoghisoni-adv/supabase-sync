import { useCallback, useState } from 'react';
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Checkbox,
  Collapsible,
  InlineStack,
  Text,
} from '@shopify/polaris';
import {
  TRACKING_CATEGORIES,
  selectedInCategory,
  type ServerSideAnswer,
} from './tracking-platforms';

export interface ServerSideStepProps {
  /** Le piattaforme spuntate adesso. */
  selected: string[];
  onSelectedChange: (platforms: string[]) => void;
  onAnswer: (answer: ServerSideAnswer) => void;
  /** Quale delle due risposte sta partendo, se ne sta partendo una. */
  submitting: ServerSideAnswer | null;
  disabled: boolean;
  /** Risposta gia' data: il passo resta leggibile ma non si rifa'. */
  answered: ServerSideAnswer | null;
  error?: string | null;
}

/**
 * Quinto passo: il merchant ha gia' un'infrastruttura server side?
 *
 * Le spunte non servono a configurare niente — servono a dire per cosa gli
 * servirebbe. Una richiesta di contatto che arriva gia' con l'elenco delle
 * piattaforme vale piu' di dieci scambi di email per ricostruirlo.
 *
 * Le due risposte chiudono entrambe il passo: nessuno deve restare bloccato
 * nella configurazione per non aver voluto essere ricontattato.
 */
export function ServerSideStep({
  selected,
  onSelectedChange,
  onAnswer,
  submitting,
  disabled,
  answered,
  error,
}: ServerSideStepProps) {
  // Aperta solo la prima categoria: le altre si aprono se interessano. Il badge
  // dice quante spunte contengono, quindi chiuse non nascondono niente.
  const [open, setOpen] = useState<Record<string, boolean>>({
    [TRACKING_CATEGORIES[0].id]: true,
  });

  const toggle = useCallback((id: string) => {
    setOpen((current) => ({ ...current, [id]: !current[id] }));
  }, []);

  const togglePlatform = useCallback(
    (name: string, checked: boolean) => {
      onSelectedChange(
        checked ? [...selected, name] : selected.filter((p) => p !== name),
      );
    },
    [onSelectedChange, selected],
  );

  const busy = submitting !== null;

  return (
    <BlockStack gap="400">
      <Text as="p" tone="subdued">
        Un tracciamento server side manda le conversioni dal server e non dal
        browser: arrivano anche quando il browser le blocca, e con i dati di
        catalogo e clientela che questa app tiene allineati diventano attribuibili
        e misurabili. Dicci per quali piattaforme raccogli dati.
      </Text>

      <BlockStack gap="200">
        {TRACKING_CATEGORIES.map((category) => {
          const count = selectedInCategory(category, selected);
          const isOpen = open[category.id] ?? false;
          return (
            <Box
              key={category.id}
              background="bg-surface-secondary"
              borderRadius="200"
              padding="300"
            >
              <BlockStack gap="200">
                {/* Titolo e freccia stanno nello stesso pulsante — `disclosure`
                    e' il modo in cui Polaris disegna una tendina — e il badge
                    gli sta accanto, all'altro capo della riga. Dentro un Button
                    il badge non ci puo' stare: accetta solo testo. */}
                <InlineStack align="space-between" blockAlign="center" gap="200" wrap={false}>
                  <Button
                    variant="tertiary"
                    textAlign="left"
                    disclosure={isOpen ? 'up' : 'down'}
                    onClick={() => toggle(category.id)}
                    ariaExpanded={isOpen}
                    ariaControls={`platforms-${category.id}`}
                  >
                    {category.title}
                  </Button>
                  {/* Il badge nasce dal conteggio: a zero non esiste, invece di
                      comparire vuoto accanto a ogni categoria. */}
                  {count > 0 && <Badge tone="info">{String(count)}</Badge>}
                </InlineStack>

                <Collapsible
                  id={`platforms-${category.id}`}
                  open={isOpen}
                  transition={{ duration: '150ms', timingFunction: 'ease-in-out' }}
                >
                  <Box paddingInlineStart="200" paddingBlockStart="100">
                    <BlockStack gap="150">
                      {category.platforms.map((platform) => (
                        <Checkbox
                          key={platform.name}
                          label={platform.name}
                          checked={selected.includes(platform.name)}
                          onChange={(checked) => togglePlatform(platform.name, checked)}
                          disabled={disabled || busy || answered !== null}
                        />
                      ))}
                    </BlockStack>
                  </Box>
                </Collapsible>
              </BlockStack>
            </Box>
          );
        })}
      </BlockStack>

      {error && <Banner tone="critical">{error}</Banner>}

      {answered === 'needs' && (
        <Banner tone="success" title="Richiesta ricevuta">
          <Text as="p">
            Ti ricontattiamo con una proposta per le piattaforme che hai indicato.
          </Text>
        </Banner>
      )}
      {answered === 'has' && (
        <Banner tone="info">
          <Text as="p">
            Hai dichiarato di avere già un&apos;infrastruttura server side. Se
            cambia qualcosa, scrivici quando vuoi.
          </Text>
        </Banner>
      )}

      {answered === null && (
        <InlineStack gap="300">
          <Button
            variant="primary"
            onClick={() => onAnswer('needs')}
            loading={submitting === 'needs'}
            disabled={disabled || busy}
          >
            Ho bisogno di un&apos;infrastruttura server side
          </Button>
          <Button
            onClick={() => onAnswer('has')}
            loading={submitting === 'has'}
            disabled={disabled || busy}
          >
            Ho già una struttura server side
          </Button>
        </InlineStack>
      )}
    </BlockStack>
  );
}
