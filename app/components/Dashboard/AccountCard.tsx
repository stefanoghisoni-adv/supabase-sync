import { Card, BlockStack, Divider, Text, Button } from '@shopify/polaris';
import { MetricRow } from './MetricRow';
import { planLabel, syncStatusBadge } from './account-format';
import { useNavLoading } from './nav-loading';
import { useT } from '~/lib/i18n/context';
import { LanguageSelect } from './LanguageSelect';
import type { Locale } from '~/lib/i18n/locales';

export interface AccountCardProps {
  planName: string;
  productsSyncActive: boolean;
  customersSyncActive: boolean;
  /**
   * Piano da proporre quando i clienti non sono inclusi (nome tecnico). Null
   * quando i clienti sono gia' inclusi o non c'e' un piano superiore da
   * proporre: in quel caso la riga torna al badge.
   */
  customersUpgradePlan?: string | null;
  /** La lingua in uso e come cambiarla: vive qui perche' e' un dato di account. */
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  localeSaving?: boolean;
}

export function AccountCard({
  planName,
  productsSyncActive,
  customersSyncActive,
  customersUpgradePlan,
  locale,
  onLocaleChange,
  localeSaving,
}: AccountCardProps) {
  const t = useT();
  // Stesso comportamento degli altri link della dashboard: mentre Remix carica
  // /plan il link mostra lo spinner e si disabilita.
  // Lo spinner si accende solo se e' stato questo link a far partire la
  // navigazione: dal menu laterale dell'admin deve restare fermo.
  const plan = useNavLoading('/plan');

  const upgrade = !customersSyncActive && Boolean(customersUpgradePlan);

  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h2" variant="headingMd">
          {t.account.title}
        </Text>
        <MetricRow label={t.account.plan} badge={{ content: planLabel(planName) }} />
        <MetricRow
          label={t.account.productsSync}
          badge={syncStatusBadge(productsSyncActive, t)}
        />
        <MetricRow
          label={t.account.customersSync}
          // L'invito all'upgrade prende il posto del badge "Non attiva": dice la
          // stessa cosa e in piu' dice cosa farci. Il badge resta quando la sync
          // e' attiva, o quando non c'e' nessun piano da proporre — altrimenti
          // la riga rimarrebbe senza risposta.
          action={
            upgrade ? (
              <Button
                variant="plain"
                url="/plan"
                onClick={plan.start}
                disabled={plan.loading}
                loading={plan.loading}
              >
                {t.account.upgradeTo(planLabel(customersUpgradePlan))}
              </Button>
            ) : undefined
          }
          badge={upgrade ? undefined : syncStatusBadge(customersSyncActive, t)}
        />

        {/* La lingua sta qui e non in una card sua: e' una preferenza
            dell'account, come il piano, e una card intera per una tendina
            sarebbe piu' cornice che contenuto. */}
        <Divider />
        <LanguageSelect
          value={locale}
          onChange={onLocaleChange}
          saving={localeSaving}
        />
        <Text as="p" tone="subdued" variant="bodySm">
          {t.language.followsAdmin}
        </Text>
      </BlockStack>
    </Card>
  );
}
