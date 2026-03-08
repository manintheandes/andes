import { requireAuth } from "./_lib/auth.js";
import { sanitizeSummary } from "./_lib/activities.js";
import { allowCors, header, type ApiRequest, type ApiResponse } from "./_lib/http.js";
import { kvGet } from "./_lib/kv.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (allowCors(req, res)) return;
  if (!requireAuth(req, res)) return;
  const requestedDay = header(req, "x-andes-day");
  const bodyDay = requestedDay && /^\d{4}-\d{2}-\d{2}$/.test(requestedDay) ? requestedDay : new Date().toISOString().slice(0, 10);

  const [activities, todayBody] = await Promise.all([
    kvGet<Record<string, ReturnType<typeof sanitizeSummary>>>("an_activities", {}),
    kvGet("an_daily_" + bodyDay, null),
  ]);

  const normalized = Object.fromEntries(Object.entries(activities).map(([key, value]) => [key, sanitizeSummary(value)]));
  const pendingCount = Object.values(normalized).filter((activity) => activity.save_status !== "synced").length;
  const repairedCount = Object.entries(activities).reduce((count, [key, value]) => {
    return JSON.stringify(value) === JSON.stringify(normalized[key]) ? count : count + 1;
  }, 0);
  res.status(200).json({
    activities: normalized,
    todayBody,
    pendingCount,
    repairedCount,
  });
}
