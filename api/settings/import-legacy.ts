import type { LocalSettings } from "../../src/types";
import { requireAuth } from "../_lib/auth.js";
import { allowCors, type ApiRequest, type ApiResponse } from "../_lib/http.js";
import { kvGet } from "../_lib/kv.js";

type LegacySettings = Partial<
  Pick<LocalSettings, "mapboxToken" | "ouraToken" | "stravaClientId" | "stravaClientSecret" | "stravaRefreshToken" | "hrDeviceId" | "hrDeviceName">
>;

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (allowCors(req, res)) return;
  if (!requireAuth(req, res)) return;

  const legacy = await kvGet<LegacySettings | null>("an_settings", null);
  if (!legacy) {
    res.status(200).json({ settings: null });
    return;
  }

  const settings: LegacySettings = {
    mapboxToken: typeof legacy.mapboxToken === "string" ? legacy.mapboxToken : "",
    ouraToken: typeof legacy.ouraToken === "string" ? legacy.ouraToken : "",
    stravaClientId: typeof legacy.stravaClientId === "string" ? legacy.stravaClientId : "",
    stravaClientSecret: typeof legacy.stravaClientSecret === "string" ? legacy.stravaClientSecret : "",
    stravaRefreshToken: typeof legacy.stravaRefreshToken === "string" ? legacy.stravaRefreshToken : "",
    hrDeviceId: typeof legacy.hrDeviceId === "string" ? legacy.hrDeviceId : "",
    hrDeviceName: typeof legacy.hrDeviceName === "string" ? legacy.hrDeviceName : "",
  };

  res.status(200).json({ settings });
}
