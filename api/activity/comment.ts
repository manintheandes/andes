import type { ActivitySummary } from "../../src/types";
import type { BodySnapshot } from "../../src/types";
import { buildSyntheticDetail, mergeDetail, mergeSummary, mutateActivitySummary, sanitizeDetail, sanitizeSummary, selectBodySnapshot, type StoredActivityDetail } from "../_lib/activities.js";
import { requireAuth } from "../_lib/auth.js";
import { COACH_PROMPT_VERSION, createCoachInputHash, generateCoachComment, isValidCoachCommentContent } from "../_lib/comment.js";
import { allowCors, header, readBody, type ApiRequest, type ApiResponse } from "../_lib/http.js";
import { kvGet, kvSet } from "../_lib/kv.js";
import { fetchOuraSnapshot } from "../_lib/oura.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (allowCors(req, res)) return;
  if (!requireAuth(req, res)) return;
  const body = readBody<{ activityId?: string; force?: boolean }>(req);
  if (!body.activityId) {
    res.status(400).json({ error: "activityId required" });
    return;
  }
  const [activities, detail] = await Promise.all([
    kvGet<Record<string, ActivitySummary>>("an_activities", {}),
    kvGet<StoredActivityDetail | null>(`an_activity_${body.activityId}`, null),
  ]);
  const summary = activities[body.activityId];
  if (!summary) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const safeSummary = sanitizeSummary(summary);
  const day = safeSummary.start_date_local.slice(0, 10);
  let snapshot = await kvGet<BodySnapshot | null>(`an_daily_${day}`, null);
  const token = header(req, "x-oura-token");
  const timeZone = header(req, "x-andes-timezone");
  if ((!snapshot || snapshot.status !== "ready") && token && timeZone) {
    try {
      snapshot = selectBodySnapshot(snapshot, await fetchOuraSnapshot(token, day, timeZone));
      if (snapshot) {
        await kvSet(`an_daily_${day}`, snapshot);
      }
    } catch {
      // Keep comment generation moving with cached data if Oura refresh fails.
    }
  }
  const safeDetailBase = detail ? sanitizeDetail(detail) : buildSyntheticDetail(safeSummary, snapshot);
  const validExistingComment = isValidCoachCommentContent(safeDetailBase.coachComment) ? safeDetailBase.coachComment : null;
  const safeDetail = mergeDetail(detail, {
    ...safeDetailBase,
    bodySnapshot: selectBodySnapshot(safeDetailBase.bodySnapshot, snapshot),
    coachComment: validExistingComment,
  });
  const inputHash = createCoachInputHash(safeSummary, safeDetail, Object.values(activities));
  if (
    validExistingComment &&
    !body.force &&
    validExistingComment.prompt_version === COACH_PROMPT_VERSION &&
    validExistingComment.input_hash === inputHash
  ) {
    const readySummary = mergeSummary(summary, {
      ...safeSummary,
      comment_status: "ready",
      comment_prompt_version: validExistingComment.prompt_version,
      comment_headline: validExistingComment.headline,
      comment_preview: validExistingComment.summary,
      body_snapshot_status: safeDetail.bodySnapshot?.status ?? safeSummary.body_snapshot_status,
      sensor_flags: { ...safeSummary.sensor_flags, body: safeDetail.bodySnapshot?.status === "ready" },
    });
    await Promise.all([
      kvSet(`an_activity_${summary.id}`, safeDetail),
      mutateActivitySummary(summary.id, (existing) => mergeSummary(existing, readySummary)),
    ]);
    res.status(200).json(safeDetail.coachComment);
    return;
  }
  try {
    const comment = await generateCoachComment(safeSummary, safeDetail, Object.values(activities).sort((left, right) => new Date(right.start_date_local).getTime() - new Date(left.start_date_local).getTime()));
    const nextDetail = mergeDetail(detail, { ...safeDetail, coachComment: comment });
    const nextSummary = mergeSummary(summary, {
      ...safeSummary,
      comment_status: "ready" as const,
      comment_prompt_version: comment.prompt_version,
      comment_headline: comment.headline,
      comment_preview: comment.summary,
      body_snapshot_status: safeDetail.bodySnapshot?.status ?? safeSummary.body_snapshot_status,
      sensor_flags: { ...safeSummary.sensor_flags, body: safeDetail.bodySnapshot?.status === "ready" },
    });
    await Promise.all([
      kvSet(`an_activity_${summary.id}`, nextDetail),
      mutateActivitySummary(summary.id, (existing) => mergeSummary(existing, nextSummary)),
    ]);
    res.status(200).json(comment);
  } catch (error) {
    const erroredSummary = mergeSummary(summary, {
      ...safeSummary,
      comment_status: "error",
      comment_prompt_version: null,
      comment_preview: summary.comment_preview ?? "Coach note unavailable right now.",
      body_snapshot_status: safeDetail.bodySnapshot?.status ?? safeSummary.body_snapshot_status,
      sensor_flags: { ...safeSummary.sensor_flags, body: safeDetail.bodySnapshot?.status === "ready" },
    });
    await Promise.all([
      kvSet(`an_activity_${summary.id}`, mergeDetail(detail, safeDetail)),
      mutateActivitySummary(summary.id, (existing) => mergeSummary(existing, erroredSummary)),
    ]);
    res.status(500).json({ error: error instanceof Error ? error.message : "Coach note generation failed." });
  }
}
