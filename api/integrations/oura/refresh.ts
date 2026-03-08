import { requireAuth } from "../../_lib/auth.js";
import { allowCors, header, readBody, type ApiRequest, type ApiResponse } from "../../_lib/http.js";
import { kvSet } from "../../_lib/kv.js";
import { fetchOuraSnapshot } from "../../_lib/oura.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (allowCors(req, res)) return;
  if (!requireAuth(req, res)) return;
  const token = header(req, "x-oura-token");
  if (!token) {
    res.status(401).json({ error: "Oura token required" });
    return;
  }
  const body = readBody<{ day?: string; timeZone?: string }>(req);
  if (!body.day || !body.timeZone) {
    res.status(400).json({ error: "day and timeZone required" });
    return;
  }
  const snapshot = await fetchOuraSnapshot(token, body.day, body.timeZone);
  await kvSet(`an_daily_${body.day}`, snapshot);
  res.status(200).json(snapshot);
}
