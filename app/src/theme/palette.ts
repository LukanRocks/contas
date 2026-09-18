import type { ColorScheme } from "./scheme";

/**
 * The palette mirrors web/public/styles.css so both front ends read as the same
 * product. React Native has no custom properties and no media queries, so
 * which of the two applies is decided in `scheme.ts` -- by the device, or by
 * what the user pinned in Settings.
 */
export type Theme = {
  dark: boolean;
  bg: string;
  surface: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  accentText: string;
  okBg: string;
  okText: string;
  errBg: string;
  errText: string;
};

const light: Theme = {
  dark: false,
  bg: "#f6f7f9",
  surface: "#ffffff",
  border: "#e2e5ea",
  text: "#16191d",
  muted: "#646c78",
  accent: "#1f6feb",
  accentText: "#ffffff",
  okBg: "#e7f6ec",
  okText: "#1a7f37",
  errBg: "#fdeceb",
  errText: "#b42318",
};

const dark: Theme = {
  dark: true,
  bg: "#14171c",
  surface: "#1c2027",
  border: "#2c323b",
  text: "#e8eaed",
  muted: "#9aa3af",
  accent: "#4c8dff",
  accentText: "#0b1220",
  okBg: "#12291a",
  okText: "#58d68b",
  errBg: "#2c1618",
  errText: "#f8837c",
};

/** Picked by `resolveScheme`, never read directly. */
export const PALETTES: Record<ColorScheme, Theme> = { light, dark };
