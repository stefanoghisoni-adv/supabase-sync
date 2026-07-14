import type { ReactNode } from 'react';
import { Card, BlockStack, InlineStack, Text, Badge } from '@shopify/polaris';
import type { StepState } from './stepper-state';

export interface StepperItem {
  id: string;
  title: string;
  state: StepState;
  content?: ReactNode;
  lockedHint?: string;
}

const BADGE: Record<StepState, { tone?: 'success' | 'info'; label: string }> = {
  complete: { tone: 'success', label: 'Completato' },
  active: { tone: 'info', label: 'In corso' },
  locked: { tone: undefined, label: 'Bloccato' },
};

export function Stepper({ steps }: { steps: StepperItem[] }) {
  return (
    <BlockStack gap="300">
      {steps.map((step, index) => (
        <Card key={step.id}>
          <BlockStack gap="300">
            <InlineStack gap="200" blockAlign="center">
              <Text
                as="span"
                variant="headingSm"
                tone={step.state === 'locked' ? 'subdued' : undefined}
              >
                {index + 1}. {step.title}
              </Text>
              <Badge tone={BADGE[step.state].tone}>
                {BADGE[step.state].label}
              </Badge>
            </InlineStack>

            {step.state === 'active' && step.content}

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
