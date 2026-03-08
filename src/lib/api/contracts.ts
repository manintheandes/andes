import { z } from "zod";

export const sensorFlagsSchema = z.object({
  gps: z.boolean(),
  hr: z.boolean(),
  body: z.boolean(),
  healthkit: z.boolean(),
});

export const bodySnapshotSchema = z.object({
  day: z.string(),
  sleep_score: z.number().nullable(),
  readiness_score: z.number().nullable(),
  hrv: z.number().nullable(),
  rhr: z.number().nullable(),
  total_sleep: z.number().nullable(),
  contributors: z.record(z.string(), z.number().optional()).optional(),
  source_day: z.string(),
  fetched_at: z.string(),
  status: z.enum(["ready", "stale", "missing_token", "missing_data", "error"]),
});

export const coachCommentSchema = z.object({
  headline: z.string(),
  summary: z.string(),
  bullets: z.tuple([z.string(), z.string()]),
  caution: z.string().nullable(),
  generated_at: z.string(),
  model: z.string(),
  prompt_version: z.string(),
  input_hash: z.string(),
});

export const activitySummarySchema = z.object({
  id: z.string(),
  source: z.enum(["andes", "strava"]),
  name: z.string(),
  type: z.enum(["Run", "Ride", "Walk", "Yoga", "Hike"]),
  sport_type: z.enum(["Run", "Ride", "Walk", "Yoga", "Hike"]),
  start_date_local: z.string(),
  moving_time: z.number(),
  elapsed_time: z.number(),
  distance: z.number(),
  total_elevation_gain: z.number(),
  average_speed: z.number(),
  max_speed: z.number(),
  average_heartrate: z.number().nullable(),
  max_heartrate: z.number().nullable(),
  average_cadence: z.number().nullable(),
  calories: z.number().nullable(),
  summary_polyline: z.string().nullable(),
  start_latlng: z.tuple([z.number(), z.number()]).nullable(),
  save_status: z.enum(["synced", "pending", "error"]),
  comment_status: z.enum(["idle", "pending", "ready", "error"]),
  comment_prompt_version: z.string().nullable(),
  comment_headline: z.string().nullable(),
  comment_preview: z.string().nullable(),
  sensor_flags: sensorFlagsSchema,
  body_snapshot_status: z.enum(["ready", "stale", "missing_token", "missing_data", "error"]),
  healthkit_export_status: z.enum(["idle", "exported", "pending", "failed", "unsupported"]),
});

export const recordingPointSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  alt: z.number(),
  time: z.number(),
  hr: z.number().nullable(),
  accuracy: z.number().nullable().optional(),
  speed: z.number().nullable().optional(),
});

export const splitSchema = z.object({
  distance: z.number(),
  time: z.number(),
  avgHR: z.number().nullable(),
  endIdx: z.number(),
});

export const sensorEventSchema = z.object({
  kind: z.enum(["gps", "coros", "healthkit"]),
  status: z.string(),
  at: z.string(),
  detail: z.string().optional(),
});

export const activityDetailSchema = z.object({
  id: z.string(),
  points: z.array(recordingPointSchema),
  splits: z.array(splitSchema),
  sensorTimeline: z.array(sensorEventSchema),
  bodySnapshot: bodySnapshotSchema.nullable(),
  coachComment: coachCommentSchema.nullable(),
  sanitized: z.boolean(),
  repair_version: z.number(),
});

export const bootstrapSchema = z.object({
  activities: z.record(z.string(), activitySummarySchema),
  todayBody: bodySnapshotSchema.nullable(),
  pendingCount: z.number(),
  repairedCount: z.number(),
});

export const loginSchema = z.object({
  token: z.string(),
  expiresAt: z.string(),
});
