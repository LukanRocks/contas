import { createContext, useContext } from "react";
import { PALETTES } from "./palette";
import type { Theme } from "./palette";
import type { ColorScheme, ThemeSetting } from "./scheme";

export type ThemeChoice = {
  /** The colours now in force. */
  theme: Theme;
  /** What the user picked: a palette, or "system". */
  setting: ThemeSetting;
  /** What is actually being rendered -- `setting`, or what "system" resolved to. */
  scheme: ColorScheme;
  setTheme: (setting: ThemeSetting) => void;
};

/**
 * Held above the whole app, onboarding included, exactly as the language is:
 * every screen the navigators render reads the palette from here rather than
 * from the device directly, so a pinned palette beats what the phone says.
 */
export const ThemeContext = createContext<ThemeChoice | null>(null);

export function useThemeChoice(): ThemeChoice {
  const choice = useContext(ThemeContext);
  if (!choice) throw new Error("useThemeChoice() needs a ThemeContext above it");
  return choice;
}

/** The common case: a component just wants the colours. */
export function useTheme(): Theme {
  return useThemeChoice().theme;
}

export { PALETTES };
export type { Theme } from "./palette";
export type { ColorScheme, ThemeSetting } from "./scheme";
