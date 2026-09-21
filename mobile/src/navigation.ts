import type { NavigatorScreenParams } from "@react-navigation/native";

/** The notes are a stack of their own, so a note opens as a screen with a back button. */
export type NotesStackParamList = {
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
  Home: undefined;
  Notes: NavigatorScreenParams<NotesStackParamList>;
  Settings: NavigatorScreenParams<SettingsStackParamList>;
};
