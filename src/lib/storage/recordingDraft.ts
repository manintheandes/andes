import type { RecordingDraft } from "../../types";
import { readJsonWithLegacy, removeJson, writeJson } from "./jsonStore";

const DRAFT_KEY = "alpaca.recording.draft.v1";
const LEGACY_DRAFT_KEYS = ["andes.recording.draft.v1"];

export async function loadRecordingDraft(): Promise<RecordingDraft | null> {
  return readJsonWithLegacy<RecordingDraft | null>(DRAFT_KEY, LEGACY_DRAFT_KEYS, null);
}

export async function saveRecordingDraft(value: RecordingDraft): Promise<void> {
  await writeJson(DRAFT_KEY, value);
}

export async function clearRecordingDraft(): Promise<void> {
  await removeJson(DRAFT_KEY);
}
