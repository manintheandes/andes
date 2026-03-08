import type { ActivitySummary } from "../../src/types";
import { mutateActivitySummary } from "../_lib/activities.js";
import { requireAuth } from "../_lib/auth.js";
import { allowCors, readBody, type ApiRequest, type ApiResponse } from "../_lib/http.js";
import { kvDelete, kvGet } from "../_lib/kv.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (allowCors(req, res)) return;
  if (!requireAuth(req, res)) return;

  const body = readBody<{ activityId?: string }>(req);
  if (!body.activityId) {
    res.status(400).json({ error: "activityId required" });
    return;
  }

  const activities = await kvGet<Record<string, ActivitySummary>>("an_activities", {});
  if (!activities[body.activityId]) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  await Promise.all([
    mutateActivitySummary(body.activityId, () => null),
    kvDelete(`an_activity_${body.activityId}`),
  ]);

  res.status(200).json({ ok: true, id: body.activityId });
}
