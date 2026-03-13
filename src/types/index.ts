export type SportType = "Run" | "Ride" | "Walk" | "Yoga" | "Hike";
export type AppView = "home" | "records" | "sleep" | "coach" | "settings";
export type ActivitySource = "andes" | "strava";
export type SaveStatus = "synced" | "pending" | "error";
export type CommentStatus = "idle" | "pending" | "ready" | "error";
export type BodySnapshotStatus = "ready" | "stale" | "missing_token" | "missing_data" | "error";
export type HealthkitExportStatus = "idle" | "exported" | "pending" | "failed" | "unsupported";
export type SensorConnectionStatus = "idle" | "paired" | "connecting" | "live" | "signal_lost" | "reconnecting" | "unavailable";
export type RecordingStatus = "idle" | "starting" | "recording" | "paused" | "saving" | "save_error" | "recovery";
export type PaceConfidence = "none" | "low" | "medium" | "high";

export interface SensorFlags {
  gps: boolean;
  hr: boolean;
  body: boolean;
  healthkit: boolean;
}

export interface SensorStatus {
  coros: SensorConnectionStatus;
  gps: "searching" | "ready" | "limited";
  mapReady: boolean;
  healthkit: HealthkitExportStatus;
}

export interface BodySnapshot {
  day: string;
  sleep_score: number | null;
  readiness_score: number | null;
  hrv: number | null;
  rhr: number | null;
  total_sleep: number | null;
  contributors?: Record<string, number | undefined>;
  source_day: string;
  fetched_at: string;
  status: BodySnapshotStatus;
}

export interface CoachComment {
  headline: string;
  summary: string;
  bullets: [string, string];
  caution: string | null;
  generated_at: string;
  model: string;
  prompt_version: string;
  input_hash: string;
}

export interface ActivitySummary {
  id: string;
  source: ActivitySource;
  name: string;
  type: SportType;
  sport_type: SportType;
  start_date_local: string;
  moving_time: number;
  elapsed_time: number;
  distance: number;
  total_elevation_gain: number;
  average_speed: number;
  max_speed: number;
  average_heartrate: number | null;
  max_heartrate: number | null;
  average_cadence: number | null;
  calories: number | null;
  summary_polyline: string | null;
  start_latlng: [number, number] | null;
  save_status: SaveStatus;
  comment_status: CommentStatus;
  comment_prompt_version: string | null;
  comment_headline: string | null;
  comment_preview: string | null;
  sensor_flags: SensorFlags;
  body_snapshot_status: BodySnapshotStatus;
  healthkit_export_status: HealthkitExportStatus;
}

export interface Split {
  distance: number;
  time: number;
  avgHR: number | null;
  endIdx: number;
}

export interface RecordingPoint {
  lat: number;
  lng: number;
  alt: number;
  time: number;
  hr: number | null;
  accuracy?: number | null;
  speed?: number | null;
}

export interface SensorEvent {
  kind: "gps" | "coros" | "healthkit";
  status: string;
  at: string;
  detail?: string;
}

export interface ActivityDetail {
  id: string;
  points: RecordingPoint[];
  splits: Split[];
  sensorTimeline: SensorEvent[];
  bodySnapshot: BodySnapshot | null;
  coachComment: CoachComment | null;
  sanitized: boolean;
  repair_version: number;
}

export interface PendingWrite {
  id: string;
  summary: ActivitySummary;
  detail: ActivityDetail;
  createdAt: string;
}

export interface RecordingDraft {
  id: string;
  status: RecordingStatus;
  type: SportType;
  startTime: number;
  pausedTime: number;
  pausedAt: number | null;
  distance: number;
  elevGain: number;
  currentHR: number | null;
  avgHR: number | null;
  maxHR: number | null;
  hrSamples: number[];
  cadence: number | null;
  calories: number | null;
  points: RecordingPoint[];
  recentPoints: RecordingPoint[];
  pendingPoints: RecordingPoint[];
  pendingDistance: number;
  pendingDuration: number;
  liveDistance: number;
  currentPaceMps: number | null;
  averagePaceMps: number | null;
  paceConfidence: PaceConfidence;
  splits: Split[];
  sensorStatus: SensorStatus;
  sensorTimeline: SensorEvent[];
  movingSeconds: number;
  recentSpeeds: number[];
  locationBlocked: boolean;
  error: string | null;
}

export interface BootstrapResponse {
  activities: Record<string, ActivitySummary>;
  todayBody: BodySnapshot | null;
  pendingCount: number;
  repairedCount: number;
}

export interface LocalSettings {
  mapboxToken: string;
  ouraToken: string;
  lastOuraSyncAt: string | null;
  lastOuraSyncDay: string | null;
  lastOuraSyncError: string | null;
  stravaClientId: string;
  stravaClientSecret: string;
  stravaRefreshToken: string;
  lastStravaImportAt: string | null;
  lastStravaImportError: string | null;
  hrDeviceId: string;
  hrDeviceName: string;
  healthkitEnabled: boolean;
  healthkitReadAuthorized: boolean;
  healthkitWriteAuthorized: boolean;
  lastHealthkitExportAt: string | null;
  lastHealthkitError: string | null;
}

export interface SessionState {
  token: string;
  expiresAt: string;
}
