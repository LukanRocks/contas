import type { NavigatorScreenParams } from "@react-navigation/native";

/** Settings is a stack of its own, so an option can open a screen with a back button. */
export type SettingsStackParamList = {
  SettingsHome: undefined;
  Server: undefined;
  Language: undefined;
  Theme: undefined;
};

/** The tab bar — what the app is once a server is known. */
export type TabParamList = {
  Scan: undefined;
  Home: undefined;
  Settings: NavigatorScreenParams<SettingsStackParamList>;
};
