import { logout } from "./api";
import { clearSession } from "./session";

/** Ends the session on the API (best effort) and forgets it here. */
export async function signOut(): Promise<void> {
  await logout().catch(() => undefined);
  clearSession();
}
