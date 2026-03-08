import type { PendingWrite } from "../../types";
import { readJsonWithLegacy, writeJson } from "./jsonStore";

const PENDING_KEY = "alpaca.pending.v1";
const LEGACY_PENDING_KEYS = ["andes.pending.v1"];

export async function loadPendingWrites(): Promise<PendingWrite[]> {
  return readJsonWithLegacy<PendingWrite[]>(PENDING_KEY, LEGACY_PENDING_KEYS, []);
}

export async function savePendingWrites(value: PendingWrite[]): Promise<void> {
  await writeJson(PENDING_KEY, value);
}
