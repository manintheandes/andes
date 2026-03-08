import type { ActivitySummary, BodySnapshot } from "../../src/types";
import { buildSyntheticDetail, mergeDetail, mergeSummary, mutateActivitySummary, sanitizeDetail, sanitizeSummary, selectBodySnapshot } from "../_lib/activities.js";
import { requireAuth } from "../_lib/auth.js";
import { isValidCoachCommentContent } from "../_lib/comment.js";
import { allowCors, header, type ApiRequest, type ApiResponse } from "../_lib/http.js";
import { kvGet, kvSet } from "../_lib/kv.js";
import { fetchOuraSnapshot } from "../_lib/oura.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (allowCors(req, res)) return;
  if (!requireAuth(req, res)) return;
  const id = typeof req.query.id === "string" ? req.query.id : "";
  if (!id) {
    res.status(400).json({ error: "id required" });
    return;
  }
  const [activities, detail] = await Promise.all([
    kvGet<Record<string, ActivitySummary>>("an_activities", {}),
    kvGet(`an_activity_${id}`, null),
  ]);
  const summary = activities[id];
  if (!summary) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const safeSummary = sanitizeSummary(summary);
  const day = safeSummary.start_date_local.slice(0, 10);
  let bodySnapshot = await kvGet<BodySnapshot | null>(`an_daily_${day}`, null);
  const token = header(req, "x-oura-token");
  const timeZone = header(req, "x-andes-timezone");
  if ((!bodySnapshot || bodySnapshot.status !== "ready") && token && timeZone) {
    try {
      bodySnapshot = selectBodySnapshot(bodySnapshot, await fetchOuraSnapshot(token, day, timeZone));
      if (bodySnapshot) {
        const nextSummary = mergeSummary(summary, {
          ...safeSummary,
          body_snapshot_status: bodySnapshot.status,
          sensor_flags: { ...safeSummary.sensor_flags, body: bodySnapshot.status === "ready" },
        });
        await Promise.all([
          kvSet(`an_daily_${day}`, bodySnapshot),
          mutateActivitySummary(id, (existing) => mergeSummary(existing, nextSummary)),
        ]);
      }
    } catch {
      // Keep serving the activity even if Oura refresh fails.
    }
  }
  if (!detail) {
    res.status(200).json(buildSyntheticDetail(safeSummary, bodySnapshot));
    return;
  }
  const safeDetail = sanitizeDetail(detail);
  const validCoachComment = isValidCoachCommentContent(safeDetail.coachComment) ? safeDetail.coachComment : null;
  const mergedDetail = mergeDetail(detail, {
    ...safeDetail,
    bodySnapshot: selectBodySnapshot(safeDetail.bodySnapshot, bodySnapshot),
    coachComment: validCoachComment,
  });
  const syncedSummary = validCoachComment
    ? mergeSummary(summary, {
        ...safeSummary,
        comment_status: "ready",
        comment_prompt_version: validCoachComment.prompt_version,
        comment_headline: validCoachComment.headline,
        comment_preview: validCoachComment.summary,
        body_snapshot_status: mergedDetail.bodySnapshot?.status ?? safeSummary.body_snapshot_status,
        sensor_flags: { ...safeSummary.sensor_flags, body: mergedDetail.bodySnapshot?.status === "ready" },
      })
    : mergeSummary(summary, {
        ...safeSummary,
        comment_status: safeSummary.comment_status === "ready" ? "idle" : safeSummary.comment_status,
        comment_prompt_version: null,
        comment_headline: validCoachComment ? safeSummary.comment_headline : null,
        comment_preview: validCoachComment ? safeSummary.comment_preview : null,
        body_snapshot_status: mergedDetail.bodySnapshot?.status ?? safeSummary.body_snapshot_status,
        sensor_flags: { ...safeSummary.sensor_flags, body: mergedDetail.bodySnapshot?.status === "ready" },
      });

  const writes: Promise<void>[] = [];
  if (JSON.stringify(mergedDetail) !== JSON.stringify(detail)) {
    writes.push(kvSet(`an_activity_${id}`, mergedDetail));
  }
  if (JSON.stringify(syncedSummary) !== JSON.stringify(summary)) {
    writes.push(mutateActivitySummary(id, (existing) => mergeSummary(existing, syncedSummary)).then(() => undefined));
  }
  if (writes.length) {
    await Promise.all(writes);
  }
  res.status(200).json(mergedDetail);
}
