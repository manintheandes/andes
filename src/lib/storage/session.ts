import type { SessionState } from "../../types";
import { readJsonWithLegacy, removeJson, writeJson } from "./jsonStore";

const SESSION_KEY = "alpaca.session.v1";
const LEGACY_SESSION_KEYS = ["andes.session.v1"];

export async function loadSession(): Promise<SessionState | null> {
  const session = await readJsonWithLegacy<SessionState | null>(SESSION_KEY, LEGACY_SESSION_KEYS, null);
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    await removeJson(SESSION_KEY);
    return null;
  }
  return session;
}

export async function saveSession(session: SessionState): Promise<void> {
  await writeJson(SESSION_KEY, session);
}

export async function clearSession(): Promise<void> {
  await removeJson(SESSION_KEY);
}
