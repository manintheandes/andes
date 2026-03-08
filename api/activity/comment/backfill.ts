import type { ActivitySummary, BodySnapshot } from "../../../src/types";
import { buildSyntheticDetail, mergeDetail, mergeSummary, mutateActivitySummary, sanitizeSummary, type StoredActivityDetail } from "../../_lib/activities.js";
import { requireAuth } from "../../_lib/auth.js";
import { COACH_PROMPT_VERSION, createCoachInputHash, generateCoachComment, isValidCoachCommentContent } from "../../_lib/comment.js";
import { allowCors, readBody, type ApiRequest, type ApiResponse } from "../../_lib/http.js";
import { kvGet, kvSet } from "../../_lib/kv.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (allowCors(req, res)) return;
  if (!requireAuth(req, res)) return;
  const body = readBody<{ limit?: number }>(req);
  const limit = Math.min(50, Math.max(1, body.limit || 12));
  const activities = await kvGet<Record<string, ActivitySummary>>("an_activities", {});
  const ordered = Object.values(activities).sort((left, right) => new Date(right.start_date_local).getTime() - new Date(left.start_date_local).getTime());

  const sorted: ActivitySummary[] = [];
  for (const activity of ordered) {
    if (sorted.length >= limit) break;
    const detail = await kvGet<StoredActivityDetail | null>(`an_activity_${activity.id}`, null);
    const validComment = isValidCoachCommentContent(detail?.coachComment) ? detail?.coachComment : null;
    const promptVersion = validComment?.prompt_version ?? null;
    const needsComment =
      activity.comment_status !== "ready" ||
      activity.comment_prompt_version !== COACH_PROMPT_VERSION ||
      promptVersion !== COACH_PROMPT_VERSION;
    if (needsComment) {
      sorted.push(activity);
    }
  }

  let processed = 0;
  let reused = 0;
  let errored = 0;
  for (const activity of sorted) {
    const summary = sanitizeSummary(activity);
    const detail = await kvGet<StoredActivityDetail | null>(`an_activity_${activity.id}`, null);
    const snapshot = await kvGet<BodySnapshot | null>(`an_daily_${summary.start_date_local.slice(0, 10)}`, null);
    const baseDetail = detail ?? buildSyntheticDetail(summary, snapshot);
    const safeDetail = baseDetail.bodySnapshot ? baseDetail : { ...baseDetail, bodySnapshot: snapshot };
    const reusableComment = isValidCoachCommentContent(safeDetail.coachComment) ? safeDetail.coachComment : null;
    const reusable =
      reusableComment &&
      reusableComment.prompt_version === COACH_PROMPT_VERSION &&
      reusableComment.input_hash === createCoachInputHash(summary, safeDetail, Object.values(activities));
    if (reusable) {
      activities[activity.id] = mergeSummary(activity, {
        ...summary,
        comment_status: "ready",
        comment_prompt_version: reusableComment.prompt_version,
        comment_headline: reusableComment.headline,
        comment_preview: reusableComment.summary,
      });
      await Promise.all([
        kvSet(`an_activity_${activity.id}`, mergeDetail(detail, safeDetail)),
        mutateActivitySummary(activity.id, (existing) => mergeSummary(existing, activities[activity.id])),
      ]);
      reused += 1;
      continue;
    }
    try {
      const comment = await generateCoachComment(summary, safeDetail, Object.values(activities));
      activities[activity.id] = mergeSummary(activity, {
        ...summary,
        comment_status: "ready",
        comment_prompt_version: comment.prompt_version,
        comment_headline: comment.headline,
        comment_preview: comment.summary,
      });
      await Promise.all([
        kvSet(`an_activity_${activity.id}`, mergeDetail(detail, { ...safeDetail, coachComment: comment })),
        mutateActivitySummary(activity.id, (existing) => mergeSummary(existing, activities[activity.id])),
      ]);
      processed += 1;
    } catch {
      activities[activity.id] = mergeSummary(activity, {
        ...summary,
        comment_status: "error",
        comment_prompt_version: null,
        comment_preview: activity.comment_preview ?? "Coach note unavailable right now.",
      });
      await mutateActivitySummary(activity.id, (existing) => mergeSummary(existing, activities[activity.id]));
      errored += 1;
    }
  }

  const latestActivities = await kvGet<Record<string, ActivitySummary>>("an_activities", {});
  let remaining = 0;
  for (const activity of Object.values(latestActivities)) {
    const detail = await kvGet<StoredActivityDetail | null>(`an_activity_${activity.id}`, null);
    const promptVersion = detail?.coachComment?.prompt_version ?? null;
    if (activity.comment_status !== "ready" || activity.comment_prompt_version !== COACH_PROMPT_VERSION || promptVersion !== COACH_PROMPT_VERSION) {
      remaining += 1;
    }
  }
  res.status(200).json({ processed, reused, errored, remaining });
}
