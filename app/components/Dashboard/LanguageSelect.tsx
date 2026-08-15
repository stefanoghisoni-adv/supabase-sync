import { useMemo, useState } from 'react';
import { Combobox, Icon, Listbox, Select, Spinner, InlineStack, Text } from '@shopify/polaris';
import { SearchIcon } from '@shopify/polaris-icons';
import { LOCALES, LOCALE_LABELS, needsSearch, type Locale } from '~/lib/i18n/locales';
import { useT } from '~/lib/i18n/context';

export interface LanguageSelectProps {
  value: Locale;
  onChange: (locale: Locale) => void;
  /** La scelta e' in viaggio verso il server. */
  saving?: boolean;
  disabled?: boolean;
}

/**
 * Il selettore della lingua.
 *
 * Due lingue si scorrono, trenta si cercano: sotto la soglia e' una tendina,
 * sopra diventa un campo con la ricerca. Il passaggio e' automatico — la soglia
 * la decide `needsSearch` — cosi' aggiungendo lingue non resta un elenco
 * infinito da scorrere solo perche' nessuno si e' ricordato di cambiarlo.
 */
export function LanguageSelect({ value, onChange, saving, disabled }: LanguageSelectProps) {
  const t = useT();
  const [query, setQuery] = useState('');

  const options = useMemo(
    () => LOCALES.map((locale) => ({ value: locale, label: LOCALE_LABELS[locale] })),
    [],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) => option.label.toLowerCase().includes(needle));
  }, [options, query]);

  const label = (
    <InlineStack gap="200" blockAlign="center">
      <Text as="span">{t.language.label}</Text>
      {saving && <Spinner size="small" accessibilityLabel={t.language.saving} />}
    </InlineStack>
  );

  if (!needsSearch()) {
    return (
      <Select
        label={label}
        options={options}
        value={value}
        onChange={(next) => onChange(next as Locale)}
        disabled={disabled || saving}
      />
    );
  }

  return (
    <Combobox
      activator={
        <Combobox.TextField
          label={label}
          prefix={<Icon source={SearchIcon} />}
          value={query || LOCALE_LABELS[value]}
          onChange={setQuery}
          placeholder={t.language.searchPlaceholder}
          autoComplete="off"
          disabled={disabled || saving}
          clearButton={Boolean(query)}
          onClearButtonClick={() => setQuery('')}
        />
      }
    >
      {filtered.length > 0 ? (
        <Listbox
          onSelect={(selected) => {
            setQuery('');
            onChange(selected as Locale);
          }}
        >
          {filtered.map((option) => (
            <Listbox.Option
              key={option.value}
              value={option.value}
              selected={option.value === value}
            >
              {option.label}
            </Listbox.Option>
          ))}
        </Listbox>
      ) : null}
    </Combobox>
  );
}
