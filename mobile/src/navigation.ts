import type { NavigatorScreenParams } from "@react-navigation/native";

/** Home is a stack of its own, so a note opens as a screen with a back button. */
export type HomeStackParamList = {
  NoteList: undefined;
  Note: { chave: string };
};

/** Settings is a stack of its own, so an option can open a screen with a back button. */
export type SettingsStackParamList = {
  SettingsHome: undefined;
  Server: undefined;
  Language: undefined;
  Theme: undefined;
  StartTab: undefined;
};

/** The tab bar — what the app is once a server is known. */
export type TabParamList = {
  Scan: undefined;
  Home: NavigatorScreenParams<HomeStackParamList>;
  Settings: NavigatorScreenParams<SettingsStackParamList>;
};
