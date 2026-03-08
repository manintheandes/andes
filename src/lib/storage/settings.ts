import type { LocalSettings } from "../../types";
import { readJsonWithLegacy, writeJson } from "./jsonStore";

const SETTINGS_KEY = "alpaca.settings.v1";
const LEGACY_SETTINGS_KEYS = ["andes.settings.v2"];

export const defaultSettings: LocalSettings = {
  mapboxToken: "",
  ouraToken: "",
  lastOuraSyncAt: null,
  lastOuraSyncDay: null,
  lastOuraSyncError: null,
  stravaClientId: "",
  stravaClientSecret: "",
  stravaRefreshToken: "",
  lastStravaImportAt: null,
  lastStravaImportError: null,
  hrDeviceId: "",
  hrDeviceName: "",
  healthkitEnabled: true,
  healthkitReadAuthorized: false,
  healthkitWriteAuthorized: false,
  lastHealthkitExportAt: null,
  lastHealthkitError: null,
};

export async function loadSettings(): Promise<LocalSettings> {
  const stored = await readJsonWithLegacy<Partial<LocalSettings>>(SETTINGS_KEY, LEGACY_SETTINGS_KEYS, {});
  return { ...defaultSettings, ...stored };
}

export async function saveSettings(value: LocalSettings): Promise<void> {
  await writeJson(SETTINGS_KEY, value);
}
