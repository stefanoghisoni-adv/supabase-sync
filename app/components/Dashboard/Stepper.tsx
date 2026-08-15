import type { ReactNode } from 'react';
import { Card, BlockStack, InlineStack, Text, Badge } from '@shopify/polaris';
import type { BadgeProps } from '@shopify/polaris';
import type { StepState } from './stepper-state';
import { useT, type Dictionary } from '~/lib/i18n/context';

export interface StepperItem {
  id: string;
  title: string;
  state: StepState;
  content?: ReactNode;
  lockedHint?: string;
  // Label opzionali per stato, così ogni step può dare un testo più parlante
  // (es. "Collegato" invece del generico "Completato").
  completeLabel?: string;
  activeLabel?: string;
  // Se true, non mostra alcun badge (es. lo step sync una volta completato).
  hideBadge?: boolean;
  // Badge completamente personalizzato: sovrascrive tone/label derivati da state.
  // Serve al primo step per distinguere "Non collegato"/"In corso"/"Collegato".
  badge?: { tone?: BadgeProps['tone']; label: string };
}

const BADGE_TONE: Record<StepState, 'success' | 'info' | undefined> = {
  complete: 'success',
  active: 'info',
  locked: undefined,
};

function badgeLabel(step: StepperItem, t: Dictionary): string {
  if (step.state === 'complete' && step.completeLabel) return step.completeLabel;
  if (step.state === 'active' && step.activeLabel) return step.activeLabel;
  return t.steps.badge[step.state];
}

export function Stepper({ steps }: { steps: StepperItem[] }) {
  const t = useT();
  return (
    <BlockStack gap="300">
      {steps.map((step, index) => (
        <Card key={step.id}>
          <BlockStack gap="300">
            {/* Badge all'estremo destro della riga del titolo, non appiccicato
                al testo: cosi' sta nell'angolo in alto a destra della card e
                tutti gli step lo mostrano incolonnato, qualunque sia la
                lunghezza del titolo. */}
            <InlineStack
              align="space-between"
              blockAlign="center"
              gap="200"
              wrap={false}
            >
              <Text
                as="span"
                variant="headingSm"
                tone={step.state === 'locked' ? 'subdued' : undefined}
              >
                {index + 1}. {step.title}
              </Text>
              {!step.hideBadge && (
                <Badge tone={step.badge ? step.badge.tone : BADGE_TONE[step.state]}>
                  {step.badge ? step.badge.label : badgeLabel(step, t)}
                </Badge>
              )}
            </InlineStack>

            {(step.state === 'active' || step.state === 'complete') && step.content}

            {step.state === 'locked' && step.lockedHint && (
              <Text as="p" tone="subdued">
                {step.lockedHint}
              </Text>
            )}
          </BlockStack>
        </Card>
      ))}
    </BlockStack>
  );
}
