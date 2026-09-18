import type { Language } from "./language";

/** The pieces a date is rendered from; how they are put together is per-language. */
export type DateParts = {
  year: string;
  /** Two digits, as stored. */
  month: string;
  /** Two digits, as stored. */
  day: string;
  /** "19:12", or null when the note carries no time. */
  time: string | null;
};

/**
 * Every word the app shows. The type is the contract: a string missing from
 * either bundle, or one with the wrong parameters, is a typecheck failure
 * rather than a blank label found on a phone.
 *
 * Money is deliberately not in here. `R$ 844,57` is an amount on a Brazilian
 * fiscal document, not a rendering preference, so it reads the same in both
 * languages. Dates are in here, because "02/09" and "09/02" are the same eight
 * characters and different days.
 */
export type Strings = {
  formatDateTime: (parts: DateParts) => string;

  tabs: { scan: string; home: string; settings: string };

  units: {
    /** For `plural(n, one, many)`. */
    item: string;
    items: string;
    note: string;
    notes: string;
  };

  onboarding: {
    subtitle: string;
    submit: string;
    footnote: string;
  };

  server: {
    defaultName: string;
    nameLabel: string;
    addressLabel: string;
    addressPlaceholder: string;
    schemesAccepted: string;
    addressInUse: string;
    willTest: (healthUrl: string) => string;
    save: string;
    screenTitle: string;
    currentStaysUntilNewAnswers: string;
    openHint: string;
  };

  scan: {
    title: string;
    subtitle: string;
    pointAtCode: string;
    consulting: string;
    permissionTitle: string;
    permissionWhy: string;
    permissionDenied: string;
    allowCamera: string;
    openSettings: string;
    noteAdded: string;
    notANote: string;
    scanAnother: string;
    seeNotes: string;
    totalUnknown: string;
  };

  home: {
    title: string;
    loading: string;
    retry: string;
    changeServer: string;
    emptyTitle: string;
    emptyBody: string;
    unknownStore: string;
    noEmissionDate: string;
  };

  settings: {
    title: string;
    languageRow: string;
    languageOpenHint: string;
  };

  language: {
    screenTitle: string;
    system: string;
    systemHint: (resolved: string) => string;
    names: Record<Language, string>;
  };

  errors: {
    addressRequired: string;
    addressInvalid: string;
    addressScheme: string;
    notOurBackend: string;
    unhealthy: (detail: string | null) => string;
    unexpectedList: string;
    timeout: (seconds: number) => string;
    unreachable: (detail: string) => string;
    serverSaid: (status: number, detail: string | null) => string;
    noteMissing: string;
    notANote: string;
    unsupportedUf: (uf: string) => string;
    fetchFailed: string;
    parseFailed: string;
    storeFailed: string;
    unexpected: (detail: string) => string;
  };
};

export const pt: Strings = {
  formatDateTime: ({ year, month, day, time }) =>
    `${day}/${month}/${year}${time ? ` ${time}` : ""}`,

  tabs: { scan: "Escanear", home: "Início", settings: "Ajustes" },

  units: { item: "item", items: "itens", note: "nota", notes: "notas" },

  onboarding: {
    subtitle: "Suas notas ficam no seu servidor. Informe o endereço dele para começar.",
    submit: "Continuar",
    footnote:
      "O endereço fica salvo no aparelho: nas próximas aberturas o app vai direto para as notas.",
  },

  server: {
    defaultName: "Servidor",
    nameLabel: "Nome",
    addressLabel: "Endereço do servidor",
    addressPlaceholder: "192.168.1.10:3000",
    schemesAccepted: "http:// e https:// são aceitos.",
    addressInUse: "É o endereço em uso.",
    willTest: (healthUrl) => `Vamos testar ${healthUrl}`,
    save: "Salvar",
    screenTitle: "Servidor",
    currentStaysUntilNewAnswers: "O endereço atual continua valendo até o novo responder.",
    openHint: "Abre a configuração do servidor",
  },

  scan: {
    title: "Escanear nota",
    subtitle: "Aponte para o QR code da NFC-e",
    pointAtCode: "Aponte para o QR code da nota",
    consulting: "Consultando a nota no portal…",
    permissionTitle: "Acesso à câmera",
    permissionWhy:
      "O app usa a câmera para ler o QR code impresso na nota. Nada é gravado: o código é lido e enviado ao seu servidor.",
    permissionDenied:
      "A permissão está negada. Libere a câmera para o app nos ajustes do aparelho para escanear notas.",
    allowCamera: "Permitir câmera",
    openSettings: "Abrir ajustes",
    noteAdded: "Nota adicionada",
    notANote: "Esse QR code não é de uma nota fiscal.",
    scanAnother: "Escanear outra",
    seeNotes: "Ver as notas",
    totalUnknown: "Total não informado",
  },

  home: {
    title: "Notas escaneadas",
    loading: "Carregando…",
    retry: "Tentar de novo",
    changeServer: "Trocar de servidor",
    emptyTitle: "Nenhuma nota ainda",
    emptyBody: "Escaneie o QR code de uma NFC-e na aba Escanear e ela aparece aqui.",
    unknownStore: "Estabelecimento não identificado",
    noEmissionDate: "Sem data de emissão",
  },

  settings: {
    title: "Ajustes",
    languageRow: "Idioma",
    languageOpenHint: "Abre a escolha de idioma",
  },

  language: {
    screenTitle: "Idioma",
    system: "Do aparelho",
    systemHint: (resolved) => `Seguindo o aparelho: ${resolved}`,
    names: { pt: "Português", en: "Inglês" },
  },

  errors: {
    addressRequired: "Informe o endereço do servidor.",
    addressInvalid: "Endereço inválido. Exemplo: 192.168.1.10:3000",
    addressScheme: "O endereço precisa começar com http:// ou https://",
    notOurBackend: "Esse endereço respondeu, mas não parece ser um servidor nf-price-tracker.",
    unhealthy: (detail) =>
      `O servidor respondeu, mas não está saudável${detail ? `: ${detail}` : "."}`,
    unexpectedList: "Resposta inesperada do servidor ao listar as notas.",
    timeout: (seconds) => `O servidor não respondeu em ${seconds}s.`,
    unreachable: (detail) =>
      `Não foi possível falar com o servidor. Confira o endereço e se o aparelho está na mesma rede (${detail}).`,
    serverSaid: (status, detail) =>
      `O servidor respondeu ${status}${detail ? ` — ${detail}` : "."}`,
    noteMissing: "O servidor respondeu, mas não devolveu a nota.",
    notANote: "Esse QR code não é de uma nota fiscal.",
    unsupportedUf: (uf) =>
      `O servidor ainda não lê notas desse estado (UF ${uf}) — por enquanto só Paraná.`,
    fetchFailed:
      "O servidor não conseguiu abrir a nota no portal da Sefaz. Tente de novo em instantes.",
    parseFailed: "O servidor abriu a nota no portal, mas não conseguiu ler o conteúdo dela.",
    storeFailed: "O servidor leu a nota, mas não conseguiu salvá-la.",
    unexpected: (detail) => `Falha inesperada: ${detail}`,
  },
};

/** Month names, so an English date is never read as the wrong day. */
const MONTHS_EN = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export const en: Strings = {
  formatDateTime: ({ year, month, day, time }) => {
    const name = MONTHS_EN[Number(month) - 1] ?? month;
    return `${Number(day)} ${name} ${year}${time ? ` ${time}` : ""}`;
  },

  tabs: { scan: "Scan", home: "Notes", settings: "Settings" },

  units: { item: "item", items: "items", note: "note", notes: "notes" },

  onboarding: {
    subtitle: "Your notes live on your own server. Enter its address to get started.",
    submit: "Continue",
    footnote: "The address is saved on this device: next time the app opens straight on the notes.",
  },

  server: {
    defaultName: "Server",
    nameLabel: "Name",
    addressLabel: "Server address",
    addressPlaceholder: "192.168.1.10:3000",
    schemesAccepted: "http:// and https:// are both accepted.",
    addressInUse: "That is the address in use.",
    willTest: (healthUrl) => `We will try ${healthUrl}`,
    save: "Save",
    screenTitle: "Server",
    currentStaysUntilNewAnswers: "The current address stays in force until the new one answers.",
    openHint: "Opens the server settings",
  },

  scan: {
    title: "Scan a note",
    subtitle: "Point at the QR code on the receipt",
    pointAtCode: "Point at the QR code on the receipt",
    consulting: "Looking the note up on the portal…",
    permissionTitle: "Camera access",
    permissionWhy:
      "The app uses the camera to read the QR code printed on the receipt. Nothing is recorded: the code is read and sent to your server.",
    permissionDenied:
      "Camera access is denied. Allow the camera for this app in your device settings to scan notes.",
    allowCamera: "Allow camera",
    openSettings: "Open settings",
    noteAdded: "Note added",
    notANote: "That QR code is not a fiscal note.",
    scanAnother: "Scan another",
    seeNotes: "See the notes",
    totalUnknown: "No total on the note",
  },

  home: {
    title: "Scanned notes",
    loading: "Loading…",
    retry: "Try again",
    changeServer: "Change server",
    emptyTitle: "No notes yet",
    emptyBody: "Scan a receipt's QR code on the Scan tab and it shows up here.",
    unknownStore: "Store not identified",
    noEmissionDate: "No issue date",
  },

  settings: {
    title: "Settings",
    languageRow: "Language",
    languageOpenHint: "Opens the language choice",
  },

  language: {
    screenTitle: "Language",
    system: "Device language",
    systemHint: (resolved) => `Following the device: ${resolved}`,
    names: { pt: "Portuguese", en: "English" },
  },

  errors: {
    addressRequired: "Enter the server's address.",
    addressInvalid: "That address is not valid. For example: 192.168.1.10:3000",
    addressScheme: "The address has to start with http:// or https://",
    notOurBackend: "Something answered there, but it does not look like an nf-price-tracker server.",
    unhealthy: (detail) => `The server answered, but it is not healthy${detail ? `: ${detail}` : "."}`,
    unexpectedList: "Unexpected answer from the server while listing the notes.",
    timeout: (seconds) => `The server did not answer within ${seconds}s.`,
    unreachable: (detail) =>
      `Could not reach the server. Check the address, and that this device is on the same network (${detail}).`,
    serverSaid: (status, detail) => `The server answered ${status}${detail ? ` — ${detail}` : "."}`,
    noteMissing: "The server answered, but did not return the note.",
    notANote: "That QR code is not a fiscal note.",
    unsupportedUf: (uf) =>
      `The server does not read notes from that state yet (UF ${uf}) — only Paraná for now.`,
    fetchFailed: "The server could not open the note on the Sefaz portal. Try again in a moment.",
    parseFailed: "The server opened the note on the portal, but could not read its contents.",
    storeFailed: "The server read the note, but could not save it.",
    unexpected: (detail) => `Unexpected failure: ${detail}`,
  },
};

export const BUNDLES: Record<Language, Strings> = { pt, en };
