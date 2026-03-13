import type { ActivitySummary } from "../../../src/types";
import { mergeSummary } from "../../_lib/activities.js";
import { requireAuth } from "../../_lib/auth.js";
import { envValue } from "../../_lib/env.js";
import { allowCors, header, type ApiRequest, type ApiResponse } from "../../_lib/http.js";
import { kvGet, kvSet } from "../../_lib/kv.js";
import { importStravaActivities } from "../../_lib/strava.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (allowCors(req, res)) return;
  if (!requireAuth(req, res)) return;

  // Accept credentials from headers (manual entry) or fall back to server env (OAuth flow).
  const clientId = header(req, "x-strava-client-id") || envValue("STRAVA_CLIENT_ID");
  const clientSecret = header(req, "x-strava-client-secret") || envValue("STRAVA_CLIENT_SECRET");
  const refreshToken = header(req, "x-strava-refresh-token");

  if (!clientId || !clientSecret || !refreshToken) {
    res.status(400).json({ error: "Missing Strava credentials" });
    return;
  }
  const imported = await importStravaActivities(clientId, clientSecret, refreshToken);
  const existing = await kvGet<Record<string, ActivitySummary>>("an_activities", {});
  const merged = { ...existing };
  for (const [id, summary] of Object.entries(imported)) {
    merged[id] = mergeSummary(existing[id], summary);
  }
  await kvSet("an_activities", merged);
  res.status(200).json({ count: Object.keys(imported).length });
}
