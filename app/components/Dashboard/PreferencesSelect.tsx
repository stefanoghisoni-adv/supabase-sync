import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  InlineGrid,
  InlineStack,
  OptionList,
  Popover,
} from '@shopify/polaris';
import { LanguageIcon } from '@shopify/polaris-icons';
import { dictionaryFor, useT } from '~/lib/i18n/context';
import type { Locale } from '~/lib/i18n/locales';
import { CURRENCY_META, LOCALE_LABELS } from '~/lib/i18n/preferences';

export interface PreferenceOption {
  value: string;
  label: string;
}

export interface Preferences {
  locale: Locale;
  currency: string;
}

export interface PreferencesSelectProps {
  locales: PreferenceOption[];
  currencies: PreferenceOption[];
  value: Preferences;
  onConfirm: (next: Preferences) => void;
  /** La scelta e' in viaggio verso il server. */
  saving?: boolean;
  disabled?: boolean;
  /**
   * Dove sta il comando.
   *
   * `field`: su una riga della card, con il suo nome a sinistra.
   * `header`: da solo nella barra del titolo, dove nessuna etichetta lo
   * annuncia — li' porta un mappamondo e prende la larghezza che gli serve.
   */
  variant?: 'field' | 'header';
}

/** Quanto e' alta ciascuna colonna prima di cominciare a scorrere. */
const COLUMN_MAX_HEIGHT = 240;

/**
 * Lingua e valuta, in un comando solo.
 *
 * Due colonne e non due tendine separate: sono la stessa decisione presa in un
 * momento solo ("in che lingua leggo e in che valuta pago"), e due comandi
 * distinti l'avrebbero spezzata in due giri. Ma restano due elenchi, ognuno con
 * il suo scorrimento: con dieci lingue e tre valute la colonna corta non deve
 * allungarsi per seguire l'altra.
 *
 * Niente si applica prima di "Conferma": le colonne sono una scelta in sospeso
 * e chiudere il popover la butta via. Senza il pulsante, un clic sbagliato
 * sulla valuta cambierebbe tutti i prezzi mentre stai ancora cercando la
 * lingua.
 */
export function PreferencesSelect({
  locales,
  currencies,
  value,
  onConfirm,
  saving,
  disabled,
  variant = 'field',
}: PreferencesSelectProps) {
  const t = useT();
  const [active, setActive] = useState(false);
  const [pending, setPending] = useState<Preferences>(value);

  // Riaprendo si riparte da quel che vale adesso: una scelta abbandonata la
  // volta scorsa non deve restare li' ad aspettare un clic distratto.
  useEffect(() => {
    if (!active) setPending(value);
  }, [active, value.locale, value.currency]); // eslint-disable-line react-hooks/exhaustive-deps

  const inHeader = variant === 'header';
  const changed = pending.locale !== value.locale || pending.currency !== value.currency;

  // Il pulsante parla la lingua che stai per scegliere, non quella in cui sei:
  // e' l'anteprima piu' onesta di cosa succede premendolo.
  const confirmLabel = dictionaryFor(pending.locale).common.confirm;

  const currencyFlag = CURRENCY_META[value.currency]?.flag ?? '';
  const activatorLabel = `${LOCALE_LABELS[value.locale]} · ${currencyFlag} ${value.currency}`.trim();

  const column = (
    title: string,
    options: PreferenceOption[],
    selected: string,
    onSelect: (next: string) => void,
  ) => (
    // maxHeight + overflow: Polaris non espone lo scorrimento di una singola
    // colonna, e Popover.Pane ne farebbe scorrere una sola per tutto il
    // riquadro — che e' esattamente quel che non vogliamo.
    //
    // overscrollBehavior: arrivato in fondo alla colonna, la rotellina non
    // deve passare il turno alla pagina sotto. Chi sta scorrendo un elenco
    // dentro un riquadro aperto non si aspetta di vedersi scorrere via la
    // pagina.
    <div
      style={{
        maxHeight: COLUMN_MAX_HEIGHT,
        overflowY: 'auto',
        overscrollBehavior: 'contain',
      }}
    >
      <OptionList
        title={title}
        options={options}
        selected={[selected]}
        onChange={(next) => {
          if (next[0]) onSelect(next[0]);
        }}
      />
    </div>
  );

  return (
    <Popover
      active={active}
      // Mai largo quanto l'attivatore: qui dentro ci stanno due colonne, e sulla
      // riga della card l'attivatore e' meta' riga — le colonne finivano
      // tagliate. Il riquadro si dimensiona sul contenuto.
      preferredPosition="below"
      preferredAlignment={inHeader ? 'right' : undefined}
      onClose={() => setActive(false)}
      activator={
        <Button
          id="preferences-select"
          onClick={() => setActive((open) => !open)}
          disclosure
          icon={inHeader ? LanguageIcon : undefined}
          fullWidth={!inHeader}
          textAlign={inHeader ? undefined : 'left'}
          disabled={disabled || saving}
          accessibilityLabel={t.language.label}
        >
          {activatorLabel}
        </Button>
      }
    >
      {/* Larghezza minima sul contenuto: due colonne strette una accanto
          all'altra taglierebbero i nomi delle lingue. */}
      <Box minWidth="380px">
        <InlineGrid columns={2}>
          {column(t.language.label, locales, pending.locale, (next) =>
            setPending((p) => ({ ...p, locale: next as Locale })),
          )}
          {column(t.language.currency, currencies, pending.currency, (next) =>
            setPending((p) => ({ ...p, currency: next })),
          )}
        </InlineGrid>

        {/* La fascia del pulsante resta in vista mentre le colonne scorrono. */}
        <Popover.Section>
          <InlineStack align="end">
            <Button
              variant="primary"
              loading={saving}
              disabled={saving || !changed}
              onClick={() => {
                onConfirm(pending);
                setActive(false);
              }}
            >
              {confirmLabel}
            </Button>
          </InlineStack>
        </Popover.Section>
      </Box>
    </Popover>
  );
}
