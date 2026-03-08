import type { ActivitySummary, BodySnapshot, CoachComment, RecordingPoint, Split } from "../../src/types";
import { kvGet, kvSet } from "./kv.js";

export interface StoredActivityDetail {
  id: string;
  points: RecordingPoint[];
  splits: Split[];
  sensorTimeline: Array<{ kind: "gps" | "coros" | "healthkit"; status: string; at: string; detail?: string }>;
  bodySnapshot: BodySnapshot | null;
  coachComment: CoachComment | null;
  sanitized: boolean;
  repair_version: number;
}

export function buildSyntheticDetail(summary: ActivitySummary, bodySnapshot: BodySnapshot | null = null): StoredActivityDetail {
  const sensorTimeline: StoredActivityDetail["sensorTimeline"] = [
    {
      kind: "gps",
      status: summary.sensor_flags.gps ? "summary route available" : "route unavailable",
      at: summary.start_date_local,
    },
    {
      kind: "coros",
      status: summary.sensor_flags.hr ? "heart rate available" : "heart rate unavailable",
      at: summary.start_date_local,
    },
    {
      kind: "healthkit",
      status: summary.healthkit_export_status,
      at: summary.start_date_local,
    },
  ];

  return {
    id: summary.id,
    points: [],
    splits: [],
    sensorTimeline,
    bodySnapshot,
    coachComment: null,
    sanitized: true,
    repair_version: 1,
  };
}

export function sanitizeSummary(summary: ActivitySummary): ActivitySummary {
  const moving_time = Number.isFinite(summary.moving_time) && summary.moving_time > 0 ? Math.round(summary.moving_time) : 0;
  const elapsed_time = Number.isFinite(summary.elapsed_time) && summary.elapsed_time > moving_time ? Math.round(summary.elapsed_time) : moving_time;
  return {
    ...summary,
    name: summary.name || `${summary.type || summary.sport_type || "Workout"}`,
    type: summary.type || summary.sport_type || "Run",
    sport_type: summary.sport_type || summary.type || "Run",
    moving_time,
    elapsed_time,
    distance: Math.max(0, summary.distance || 0),
    total_elevation_gain: Math.max(0, summary.total_elevation_gain || 0),
    average_speed: Math.max(0, summary.average_speed || 0),
    max_speed: Math.max(0, summary.max_speed || 0),
    average_heartrate: summary.average_heartrate && summary.average_heartrate > 0 ? summary.average_heartrate : null,
    max_heartrate: summary.max_heartrate && summary.max_heartrate > 0 ? summary.max_heartrate : null,
    calories: summary.calories && summary.calories > 0 ? summary.calories : null,
    save_status: summary.save_status || "synced",
    comment_status: summary.comment_status || "idle",
    comment_prompt_version: summary.comment_prompt_version ?? null,
    comment_headline: summary.comment_headline ?? null,
    comment_preview: summary.comment_preview ?? null,
    sensor_flags: {
      gps: Boolean(summary.sensor_flags?.gps || summary.summary_polyline || summary.start_latlng),
      hr: Boolean(summary.sensor_flags?.hr || summary.average_heartrate || summary.max_heartrate),
      body: Boolean(summary.sensor_flags?.body),
      healthkit: Boolean(summary.sensor_flags?.healthkit),
    },
    body_snapshot_status: summary.body_snapshot_status || "missing_data",
    healthkit_export_status: summary.healthkit_export_status || "unsupported",
  };
}

export function sanitizeDetail(detail: StoredActivityDetail): StoredActivityDetail {
  return {
    ...detail,
    points: detail.points.filter((point, index, source) => {
      if (index === 0) return true;
      const previous = source[index - 1];
      const latDiff = Math.abs(point.lat - previous.lat);
      const lngDiff = Math.abs(point.lng - previous.lng);
      return latDiff < 0.02 && lngDiff < 0.02;
    }),
    sanitized: true,
    repair_version: Math.max(1, detail.repair_version || 1),
  };
}

function bodyStatusRank(status: ActivitySummary["body_snapshot_status"]): number {
  switch (status) {
    case "ready":
      return 4;
    case "stale":
      return 3;
    case "error":
      return 2;
    case "missing_data":
      return 1;
    case "missing_token":
    default:
      return 0;
  }
}

export function mergeBodyStatus(
  existing: ActivitySummary["body_snapshot_status"],
  incoming: ActivitySummary["body_snapshot_status"],
): ActivitySummary["body_snapshot_status"] {
  return bodyStatusRank(incoming) >= bodyStatusRank(existing) ? incoming : existing;
}

export function selectBodySnapshot(existing: BodySnapshot | null | undefined, incoming: BodySnapshot | null | undefined): BodySnapshot | null {
  if (!existing && !incoming) return null;
  if (!existing) return incoming ?? null;
  if (!incoming) return existing;
  if (incoming.status === "ready" && existing.status !== "ready") return incoming;
  if (existing.status === "ready" && incoming.status !== "ready") return existing;
  return new Date(incoming.fetched_at).getTime() >= new Date(existing.fetched_at).getTime() ? incoming : existing;
}

function selectCoachComment(existing: CoachComment | null | undefined, incoming: CoachComment | null | undefined): CoachComment | null {
  if (!existing && !incoming) return null;
  if (!existing) return incoming ?? null;
  if (!incoming) return existing;
  if (incoming.prompt_version !== existing.prompt_version) return incoming;
  return new Date(incoming.generated_at).getTime() >= new Date(existing.generated_at).getTime() ? incoming : existing;
}

export function mergeSummary(existing: ActivitySummary | null | undefined, incoming: ActivitySummary): ActivitySummary {
  if (!existing) {
    return sanitizeSummary(incoming);
  }

  if (existing.source === "andes" && incoming.source === "strava") {
    return sanitizeSummary(existing);
  }

  return sanitizeSummary({
    ...existing,
    ...incoming,
    source: existing.source === "andes" ? "andes" : incoming.source,
    save_status: existing.save_status === "pending" || existing.save_status === "error" ? existing.save_status : incoming.save_status,
    comment_status:
      existing.comment_status === "ready"
        ? "ready"
        : existing.comment_status === "pending" && incoming.comment_status === "idle"
          ? "pending"
          : incoming.comment_status,
    comment_prompt_version: incoming.comment_prompt_version ?? existing.comment_prompt_version ?? null,
    comment_headline: incoming.comment_headline ?? existing.comment_headline,
    comment_preview: incoming.comment_preview ?? existing.comment_preview,
    sensor_flags: {
      gps: existing.sensor_flags.gps || incoming.sensor_flags.gps,
      hr: existing.sensor_flags.hr || incoming.sensor_flags.hr,
      body: existing.sensor_flags.body || incoming.sensor_flags.body,
      healthkit: existing.sensor_flags.healthkit || incoming.sensor_flags.healthkit,
    },
    body_snapshot_status: mergeBodyStatus(existing.body_snapshot_status, incoming.body_snapshot_status),
    healthkit_export_status: existing.healthkit_export_status !== "unsupported" ? existing.healthkit_export_status : incoming.healthkit_export_status,
  });
}

export function mergeDetail(existing: StoredActivityDetail | null | undefined, incoming: StoredActivityDetail): StoredActivityDetail {
  if (!existing) {
    return sanitizeDetail(incoming);
  }

  return sanitizeDetail({
    ...existing,
    ...incoming,
    points: incoming.points.length ? incoming.points : existing.points,
    splits: incoming.splits.length ? incoming.splits : existing.splits,
    sensorTimeline: incoming.sensorTimeline.length ? incoming.sensorTimeline : existing.sensorTimeline,
    bodySnapshot: selectBodySnapshot(existing.bodySnapshot, incoming.bodySnapshot),
    coachComment: selectCoachComment(existing.coachComment, incoming.coachComment),
    repair_version: Math.max(existing.repair_version || 1, incoming.repair_version || 1),
  });
}

function summariesMatch(left: ActivitySummary | undefined, right: ActivitySummary): boolean {
  if (!left) return false;
  return JSON.stringify(sanitizeSummary(left)) === JSON.stringify(sanitizeSummary(right));
}

export async function mutateActivitySummary(
  id: string,
  mutator: (existing: ActivitySummary | undefined, current: Record<string, ActivitySummary>) => ActivitySummary | null,
  attempts = 4,
): Promise<Record<string, ActivitySummary>> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const current = await kvGet<Record<string, ActivitySummary>>("an_activities", {});
    const nextValue = mutator(current[id], current);
    const nextActivities = { ...current };

    if (nextValue === null) {
      delete nextActivities[id];
    } else {
      nextActivities[id] = sanitizeSummary(nextValue);
    }

    await kvSet("an_activities", nextActivities);
    const after = await kvGet<Record<string, ActivitySummary>>("an_activities", {});

    if (nextValue === null) {
      if (!after[id]) return after;
      lastError = new Error(`Activity ${id} was not deleted from summary store.`);
      continue;
    }

    if (summariesMatch(after[id], nextValue)) {
      return after;
    }

    lastError = new Error(`Activity ${id} summary store did not reflect the latest write.`);
  }

  throw lastError ?? new Error(`Unable to persist summary for activity ${id}.`);
}
