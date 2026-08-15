import { useMemo, useState } from 'react';
import { Box, Button, Icon, OptionList, Popover, TextField } from '@shopify/polaris';
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
 * Popover + OptionList, non `<Select>`: quest'ultimo rende un `<select>` nativo,
 * quindi il menu aperto sarebbe quello del sistema operativo — un pezzo di
 * un'altra interfaccia dentro l'app. E' lo stesso comando con cui si sceglie la
 * region creando un database, e per la stessa ragione.
 *
 * Da dieci lingue in su compare anche un campo di ricerca: due si scorrono,
 * trenta si cercano. La soglia la decide `needsSearch`, cosi' aggiungendo
 * lingue il campo arriva da solo.
 *
 * L'etichetta non e' qui: il comando vive su una riga con il suo nome a
 * sinistra, come le altre righe della card, e quella riga la compone chi lo
 * usa.
 */
export function LanguageSelect({ value, onChange, saving, disabled }: LanguageSelectProps) {
  const t = useT();
  const [active, setActive] = useState(false);
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

  const searchable = needsSearch();

  return (
      <Popover
        active={active}
        // Popover largo quanto l'attivatore: pulsante e menu combaciano.
        fullWidth
        preferredPosition="below"
        onClose={() => {
          setActive(false);
          setQuery('');
        }}
        activator={
          <Button
            id="language-select"
            onClick={() => setActive((open) => !open)}
            disclosure
            fullWidth
            textAlign="left"
            disabled={disabled || saving}
            // L'etichetta visibile sta accanto, sulla riga: qui serve solo a
            // chi il pulsante lo sente leggere invece di vederlo.
            accessibilityLabel={t.language.label}
          >
            {LOCALE_LABELS[value]}
          </Button>
        }
      >
        {searchable && (
          // `fixed`: il campo resta in vista mentre l'elenco sotto scorre.
          <Popover.Pane fixed>
            <Box padding="200">
              <TextField
                label={t.language.label}
                labelHidden
                prefix={<Icon source={SearchIcon} />}
                value={query}
                onChange={setQuery}
                placeholder={t.language.searchPlaceholder}
                autoComplete="off"
                clearButton={Boolean(query)}
                onClearButtonClick={() => setQuery('')}
              />
            </Box>
          </Popover.Pane>
        )}
        <Popover.Pane height={searchable ? '280px' : undefined}>
          <OptionList
            options={filtered}
            selected={[value]}
            onChange={(selected) => {
              if (selected[0]) onChange(selected[0] as Locale);
              setActive(false);
              setQuery('');
            }}
          />
        </Popover.Pane>
      </Popover>
  );
}
