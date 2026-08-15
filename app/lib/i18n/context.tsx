import { createContext, useContext, type ReactNode } from 'react';
import { FALLBACK_LOCALE, type Locale } from './locales';
import { it } from './it';
import { en } from './en';

/**
 * I testi dell'app, nella lingua in uso.
 *
 * Il dizionario e' un oggetto, non un elenco di chiavi da scrivere a mano:
 * `t.settings.title` esiste o non compila, mentre `t('settings.title')` sbagliato
 * si scopre a schermo. Le frasi con un valore dentro sono funzioni — anche
 * quelle tipizzate, quindi un argomento dimenticato e' un errore di
 * compilazione e non un "undefined" in mezzo a una riga.
 */
export type Dictionary = typeof it;

const DICTIONARIES: Record<Locale, Dictionary> = { it, en };

const I18nContext = createContext<{ locale: Locale; t: Dictionary }>({
  locale: FALLBACK_LOCALE,
  t: DICTIONARIES[FALLBACK_LOCALE],
});

export function I18nProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  return (
    <I18nContext.Provider value={{ locale, t: DICTIONARIES[locale] }}>
      {children}
    </I18nContext.Provider>
  );
}

/** I testi nella lingua in uso. */
export function useT(): Dictionary {
  return useContext(I18nContext).t;
}

/** La lingua in uso, per le date e i numeri. */
export function useLocale(): Locale {
  return useContext(I18nContext).locale;
}

/** Il dizionario fuori da React: per il codice del server. */
export function dictionaryFor(locale: Locale): Dictionary {
  return DICTIONARIES[locale];
}
