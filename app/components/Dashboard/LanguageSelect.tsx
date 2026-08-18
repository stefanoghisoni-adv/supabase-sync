import { useMemo, useState } from 'react';
import { Box, Button, Icon, OptionList, Popover, TextField } from '@shopify/polaris';
import { LanguageIcon, SearchIcon } from '@shopify/polaris-icons';
import { needsSearch } from '~/lib/i18n/locales';
import type { MarketId } from '~/lib/i18n/markets';
import { useT } from '~/lib/i18n/context';

export interface MarketOption {
  id: MarketId;
  /** Bandiera, lingua e valuta gia' composte: "🇪🇺 Italiano — EUR". */
  label: string;
}

export interface LanguageSelectProps {
  /** I mercati fra cui scegliere, con le etichette gia' pronte dal server. */
  options: MarketOption[];
  value: MarketId;
  onChange: (market: MarketId) => void;
  /** La scelta e' in viaggio verso il server. */
  saving?: boolean;
  disabled?: boolean;
  /**
   * Dove sta il comando.
   *
   * `field`: su una riga della card, con il suo nome a sinistra — largo quanto
   * la riga, come gli altri campi.
   * `header`: da solo nella barra del titolo, dove nessuna etichetta lo
   * annuncia. Li' porta un mappamondo e il nome della lingua, che è il modo in
   * cui un selettore di lingua si riconosce senza leggere niente — e prende la
   * larghezza che gli serve, non tutta quella disponibile.
   */
  variant?: 'field' | 'header';
}

/**
 * Il selettore della lingua — e con essa della valuta.
 *
 * Sono una scelta sola perche' per il merchant sono una cosa sola: chi legge in
 * italiano vuole i prezzi in euro. L'etichetta le dice entrambe, cosi' nessuno
 * scopre la valuta al momento di pagare.
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
export function LanguageSelect({
  options: markets,
  value,
  onChange,
  saving,
  disabled,
  variant = 'field',
}: LanguageSelectProps) {
  const t = useT();
  const [active, setActive] = useState(false);
  const [query, setQuery] = useState('');

  const options = useMemo(
    () => markets.map((market) => ({ value: market.id, label: market.label })),
    [markets],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) => option.label.toLowerCase().includes(needle));
  }, [options, query]);

  const searchable = needsSearch(markets.length);
  const inHeader = variant === 'header';

  return (
      <Popover
        active={active}
        // Nella riga della card il menu combacia con l'attivatore; nella barra
        // del titolo il pulsante e' stretto, e un menu della sua larghezza
        // taglierebbe i nomi delle lingue.
        fullWidth={!inHeader}
        preferredPosition="below"
        // Il comando sta all'estremo destro della barra: il menu si apre verso
        // l'interno della pagina, non oltre il bordo.
        preferredAlignment={inHeader ? 'right' : undefined}
        onClose={() => {
          setActive(false);
          setQuery('');
        }}
        activator={
          <Button
            id="language-select"
            onClick={() => setActive((open) => !open)}
            disclosure
            icon={inHeader ? LanguageIcon : undefined}
            fullWidth={!inHeader}
            textAlign={inHeader ? undefined : 'left'}
            disabled={disabled || saving}
            // L'etichetta visibile sta accanto, sulla riga: qui serve solo a
            // chi il pulsante lo sente leggere invece di vederlo.
            accessibilityLabel={t.language.label}
          >
            {markets.find((market) => market.id === value)?.label ?? value}
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
              if (selected[0]) onChange(selected[0] as MarketId);
              setActive(false);
              setQuery('');
            }}
          />
        </Popover.Pane>
      </Popover>
  );
}
