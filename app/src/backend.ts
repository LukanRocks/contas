import { createContext, useContext } from "react";
import type { Server } from "./storage";

/** What a server is called until it is renamed in Ajustes › Servidor. */
export const DEFAULT_SERVER_NAME = "Servidor";

type Backend = Server & {
  /** Switches or renames the server; a new address has always just answered `/api/health`. */
  setServer: (server: Server) => void;
};

/**
 * The saved server, handed to screens the navigators render — they cannot
 * receive it as a prop the way a hand-mounted component would.
 */
export const BackendContext = createContext<Backend | null>(null);

export function useBackend(): Backend {
  const backend = useContext(BackendContext);
  if (!backend) throw new Error("useBackend() needs a BackendContext above it");
  return backend;
}
