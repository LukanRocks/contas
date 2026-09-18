import { useColorScheme } from "react-native";

/**
 * The palette mirrors web/public/styles.css so both front ends read as the same
 * product. React Native has no custom properties and no media queries, so the
 * two sets are swapped by `useColorScheme` instead.
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
  errBg: "#2c1618",
  errText: "#f8837c",
};

export function useTheme(): Theme {
  return useColorScheme() === "dark" ? dark : light;
}
