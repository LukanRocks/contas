import { createContext, useContext } from "react";
import type { Strings } from "./i18n/strings";
import type { TabParamList } from "./navigation";

/**
 * The tabs the app can open on, the default first. Settings is not one:
 * nobody opens the app to change it.
 */
export const START_TABS = ["Home", "Notes", "Scan"] as const satisfies readonly (keyof TabParamList)[];

export type StartTab = (typeof START_TABS)[number];

/** Guards what comes back from the device's store, which is just a string. */
export function isStartTab(value: unknown): value is StartTab {
  return typeof value === "string" && (START_TABS as readonly string[]).includes(value);
}

/** The tab bar's own label, so the choice reads exactly as the tab it opens. */
export function startTabLabel(tab: StartTab, t: Strings): string {
  return { Home: t.tabs.home, Notes: t.tabs.notes, Scan: t.tabs.scan }[tab];
}

export type StartTabChoice = {
  startTab: StartTab;
  setStartTab: (tab: StartTab) => void;
};

/**
 * Read once by the tab bar, when it mounts, and from Settings › Start screen.
 * A new pick is saved at once but only opens the app the next time it starts:
 * the navigator is already standing where the user is.
 */
export const StartTabContext = createContext<StartTabChoice | null>(null);

export function useStartTab(): StartTabChoice {
  const choice = useContext(StartTabContext);
  if (!choice) throw new Error("useStartTab() needs a StartTabContext above it");
  return choice;
}
