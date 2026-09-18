import { createContext, useContext } from "react";
import type { Language, LanguageSetting } from "./language";
import type { Strings } from "./strings";

export type I18n = {
  /** The words, in the language now in force. */
  t: Strings;
  /** What the user picked: a language, or "system". */
  setting: LanguageSetting;
  /** What is actually being rendered -- `setting`, or what "system" resolved to. */
  language: Language;
  setLanguage: (setting: LanguageSetting) => void;
};

/**
 * Held above the whole app, onboarding included: the language is known before
 * a server is, and every screen the navigators render reads it from here
 * rather than through props.
 */
export const I18nContext = createContext<I18n | null>(null);

export function useI18n(): I18n {
  const i18n = useContext(I18nContext);
  if (!i18n) throw new Error("useI18n() needs an I18nContext above it");
  return i18n;
}

/** The common case: a screen just wants the words. */
export function useStrings(): Strings {
  return useI18n().t;
}

export type { Strings } from "./strings";
export type { Language, LanguageSetting } from "./language";
