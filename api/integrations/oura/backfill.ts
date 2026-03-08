import type { ActivitySummary } from "../../../src/types";
import { mergeSummary, sanitizeSummary } from "../../_lib/activities.js";
import { requireAuth } from "../../_lib/auth.js";
import { allowCors, header, readBody, type ApiRequest, type ApiResponse } from "../../_lib/http.js";
import { kvGet, kvSet } from "../../_lib/kv.js";
import { fetchOuraSnapshots } from "../../_lib/oura.js";

function activityDay(startDateLocal: string): string {
  return startDateLocal.slice(0, 10);
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (allowCors(req, res)) return;
  if (!requireAuth(req, res)) return;

  const token = header(req, "x-oura-token");
  if (!token) {
    res.status(401).json({ error: "Oura token required" });
    return;
  }

  const body = readBody<{ days?: string[]; limit?: number; timeZone?: string }>(req);
  const timeZone = body.timeZone || header(req, "x-andes-timezone");
  if (!timeZone) {
    res.status(400).json({ error: "timeZone required" });
    return;
  }

  const activities = await kvGet<Record<string, ActivitySummary>>("an_activities", {});
  const requestedDays =
    Array.isArray(body.days) && body.days.length
      ? body.days
      : Object.values(activities)
          .map((activity) => activityDay(activity.start_date_local))
          .filter(Boolean);

  const uniqueDays = Array.from(new Set(requestedDays.filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day)))).sort((left, right) => right.localeCompare(left));
  const limit = Math.min(366, Math.max(1, body.limit ?? uniqueDays.length ?? 1));
  const targetDays = uniqueDays.slice(0, limit);
  if (!targetDays.length) {
    res.status(200).json({ processedDays: 0, updatedActivities: 0, readyDays: 0 });
    return;
  }

  const snapshots = await fetchOuraSnapshots(token, targetDays, timeZone);
  const nextActivities = { ...activities };
  let updatedActivities = 0;

  await Promise.all(
    Object.entries(snapshots).map(([day, snapshot]) => kvSet(`an_daily_${day}`, snapshot)),
  );

  for (const activity of Object.values(activities)) {
    const day = activityDay(activity.start_date_local);
    const snapshot = snapshots[day];
    if (!snapshot) continue;

    const nextSummary = mergeSummary(activity, {
      ...sanitizeSummary(activity),
      body_snapshot_status: snapshot.status,
      sensor_flags: {
        ...sanitizeSummary(activity).sensor_flags,
        body: snapshot.status === "ready",
      },
    });

    if (JSON.stringify(nextSummary) !== JSON.stringify(activity)) {
      nextActivities[activity.id] = nextSummary;
      updatedActivities += 1;
    }
  }

  if (updatedActivities > 0) {
    await kvSet("an_activities", nextActivities);
  }

  res.status(200).json({
    processedDays: Object.keys(snapshots).length,
    updatedActivities,
    readyDays: Object.values(snapshots).filter((snapshot) => snapshot.status === "ready").length,
  });
}
