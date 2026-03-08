import type { PendingWrite } from "../../src/types";
import { mergeDetail, mergeSummary, mutateActivitySummary, sanitizeDetail, sanitizeSummary } from "../_lib/activities.js";
import { requireAuth } from "../_lib/auth.js";
import { allowCors, readBody, type ApiRequest, type ApiResponse } from "../_lib/http.js";
import { kvGet, kvSet } from "../_lib/kv.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (allowCors(req, res)) return;
  if (!requireAuth(req, res)) return;
  const body = readBody<PendingWrite>(req);
  const existingDetail = await kvGet<PendingWrite["detail"] | null>(`an_activity_${body.summary.id}`, null);
  const summary = sanitizeSummary({
    ...body.summary,
    save_status: "synced",
    comment_status: body.summary.comment_status === "ready" ? "ready" : "pending",
    comment_prompt_version: body.summary.comment_prompt_version ?? null,
  });
  const detail = sanitizeDetail(body.detail);
  const nextDetail = mergeDetail(existingDetail, detail);
  await Promise.all([
    mutateActivitySummary(summary.id, (existing) => mergeSummary(existing, summary)),
    kvSet(`an_activity_${summary.id}`, nextDetail),
  ]);
  res.status(200).json({ ok: true, id: summary.id });
}
