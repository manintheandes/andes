import { Capacitor } from "@capacitor/core";

const nativeFlag = typeof window !== "undefined" ? Capacitor.isNativePlatform() : false;
const configuredApiBase =
  typeof import.meta !== "undefined" ? import.meta.env.VITE_ALPACA_API_BASE || import.meta.env.VITE_ANDES_API_BASE || "" : "";

export function isNativePlatform(): boolean {
  return Boolean(nativeFlag);
}

export function apiBase(): string {
  if (configuredApiBase) return configuredApiBase;
  return nativeFlag ? "https://andes-black.vercel.app" : "";
}
