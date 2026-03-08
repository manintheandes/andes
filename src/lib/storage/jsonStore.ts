import { Preferences } from "@capacitor/preferences";
import { isNativePlatform } from "./device";

async function readRaw(key: string): Promise<string | null> {
  if (isNativePlatform()) {
    const result = await Preferences.get({ key });
    return result.value;
  }
  return window.localStorage.getItem(key);
}

async function writeRaw(key: string, value: string): Promise<void> {
  if (isNativePlatform()) {
    await Preferences.set({ key, value });
    return;
  }
  window.localStorage.setItem(key, value);
}

async function removeRaw(key: string): Promise<void> {
  if (isNativePlatform()) {
    await Preferences.remove({ key });
    return;
  }
  window.localStorage.removeItem(key);
}

export async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const value = await readRaw(key);
    if (!value) return fallback;
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export async function writeJson<T>(key: string, value: T): Promise<void> {
  await writeRaw(key, JSON.stringify(value));
}

export async function removeJson(key: string): Promise<void> {
  await removeRaw(key);
}

export async function readJsonWithLegacy<T>(key: string, legacyKeys: string[], fallback: T): Promise<T> {
  const primary = await readJson<T | null>(key, null);
  if (primary !== null) return primary;

  for (const legacyKey of legacyKeys) {
    const legacy = await readJson<T | null>(legacyKey, null);
    if (legacy !== null) {
      await writeJson(key, legacy);
      await removeJson(legacyKey);
      return legacy;
    }
  }

  return fallback;
}
