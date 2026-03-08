import type { ActivitySummary } from "../../src/types";
import { sanitizeDetail, sanitizeSummary } from "../_lib/activities.js";
import { requireAuth } from "../_lib/auth.js";
import { allowCors, type ApiRequest, type ApiResponse } from "../_lib/http.js";
import { kvGet, kvSet } from "../_lib/kv.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (allowCors(req, res)) return;
  if (!requireAuth(req, res)) return;
  const activities = await kvGet<Record<string, ActivitySummary>>("an_activities", {});
  let repairedCount = 0;
  const nextActivities: Record<string, ActivitySummary> = {};
  for (const [id, activity] of Object.entries(activities)) {
    const repaired = sanitizeSummary(activity);
    nextActivities[id] = repaired;
    if (JSON.stringify(repaired) !== JSON.stringify(activity)) {
      repairedCount += 1;
    }
    const detail = await kvGet(`an_activity_${id}`, null);
    if (detail) {
      await kvSet(`an_activity_${id}`, sanitizeDetail(detail));
    }
  }
  await kvSet("an_activities", nextActivities);
  res.status(200).json({ repairedCount });
}
