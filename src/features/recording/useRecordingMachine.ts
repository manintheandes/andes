import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { KeepAwake } from "@capacitor-community/keep-awake";
import { Capacitor, registerPlugin } from "@capacitor/core";
import type { BodySnapshot, PaceConfidence, PendingWrite, RecordingDraft, RecordingPoint, SensorConnectionStatus, SportType } from "../../types";
import { clearRecordingDraft, loadRecordingDraft, saveRecordingDraft } from "../../lib/storage/recordingDraft";
import { localIso } from "../../lib/time";
import { connectHeartRateDevice } from "../../lib/native/coros";
import { computeSplits, sanitizePoints, sanitizeSeconds } from "../../lib/utils/sanitize";
import { encodePolyline, haversine } from "../../lib/utils/geo";

interface BackgroundPosition {
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy?: number;
  speed?: number;
  time?: number;
}

interface BackgroundGeolocationPlugin {
  addWatcher(
    options: {
      requestPermissions: boolean;
      stale: boolean;
      distanceFilter: number;
      backgroundTitle: string;
      backgroundMessage: string;
    },
    callback: (position: BackgroundPosition | null, error: { message?: string } | null) => void,
  ): Promise<string>;
  removeWatcher(options: { id: string | number }): Promise<void>;
  openSettings(): Promise<void>;
}

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>("BackgroundGeolocation");
const isNative = Capacitor.isNativePlatform();
const MAX_GPS_ACCURACY_METERS = 35;
const MIN_POINT_INTERVAL_MS = 1000;
const MOVEMENT_CONFIRM_WINDOW_MS = 18000;
const LIVE_PACE_BUFFER_MS = 45000;
const LIVE_PACE_WINDOW_MS = 15000;
const REPORTED_SPEED_WINDOW_MS = 12000;
const MAX_LEG_GAP_MS = 4000;

const MIN_MOVING_SPEED_MPS: Record<SportType, number> = {
  Run: 0.45,
  Ride: 1.2,
  Walk: 0.3,
  Hike: 0.25,
  Yoga: 0.2,
};

const STATIONARY_SPEED_THRESHOLD_MPS = 1.0;

const MOVEMENT_CONFIRM_DISTANCE_METERS: Record<SportType, number> = {
  Run: 12,
  Ride: 20,
  Walk: 8,
  Hike: 8,
  Yoga: 2,
};

const MOVEMENT_CONFIRM_NET_DISTANCE_METERS: Record<SportType, number> = {
  Run: 8,
  Ride: 15,
  Walk: 5,
  Hike: 5,
  Yoga: 1,
};

const MOVEMENT_CONFIRM_POINTS: Record<SportType, number> = {
  Run: 1,
  Ride: 1,
  Walk: 1,
  Hike: 1,
  Yoga: 1,
};

const MAX_SPEED_BY_SPORT: Record<SportType, number> = {
  Run: 8.5,
  Ride: 28,
  Walk: 3.2,
  Hike: 4.5,
  Yoga: 2,
};

const MIN_LIVE_PACE_SECONDS: Record<SportType, number> = {
  Run: 4,
  Ride: 5,
  Walk: 4,
  Hike: 4,
  Yoga: 0,
};

const MIN_LIVE_PACE_DISTANCE_METERS: Record<SportType, number> = {
  Run: 4,
  Ride: 10,
  Walk: 3,
  Hike: 3,
  Yoga: 0,
};

function jitterThreshold(previous: RecordingPoint, current: RecordingPoint): number {
  const radius = Math.max(previous.accuracy ?? 0, current.accuracy ?? 0);
  return Math.max(6, Math.min(18, radius * 0.6));
}

function sensorTimelineEntry(kind: "gps" | "coros" | "healthkit", status: string, detail?: string) {
  return {
    kind,
    status,
    at: new Date().toISOString(),
    ...(detail ? { detail } : {}),
  };
}

function deriveRouteMetrics(points: RecordingPoint[]) {
  const cleanPoints = sanitizePoints(points);
  let distance = 0;
  let elevGain = 0;
  for (let index = 1; index < cleanPoints.length; index += 1) {
    const previous = cleanPoints[index - 1];
    const current = cleanPoints[index];
    distance += haversine(previous.lat, previous.lng, current.lat, current.lng);
    elevGain += Math.max(0, current.alt - previous.alt);
  }
  return {
    points: cleanPoints,
    distance,
    elevGain,
    splits: computeSplits(cleanPoints),
  };
}

function draftMovingSeconds(draft: RecordingDraft, fallbackNow = Date.now()) {
  if (draft.type === "Yoga") {
    return sanitizeSeconds(((draft.pausedAt ?? fallbackNow) - draft.startTime - draft.pausedTime) / 1000);
  }
  if (draft.points.length < 2) {
    return 0;
  }
  // Only count time between consecutive points with small gaps.
  // Drift points arrive every 8-15 seconds (GPS wanders 5m). Running points
  // arrive every 1-3 seconds (you move 5m quickly). 6-second threshold
  // cleanly separates the two.
  let movingMs = 0;
  for (let i = 1; i < draft.points.length; i++) {
    const gap = draft.points[i].time - draft.points[i - 1].time;
    if (gap > 0 && gap < 6000) {
      movingMs += gap;
    }
  }
  return sanitizeSeconds(movingMs / 1000);
}

function appendRecentPoint(points: RecordingPoint[], point: RecordingPoint) {
  const next = [...points, point];
  const cutoff = point.time - LIVE_PACE_BUFFER_MS;
  return next.filter((candidate) => candidate.time >= cutoff);
}

interface MovementLeg {
  distance: number;
  seconds: number;
  calculatedSpeed: number;
  reportedSpeed: number | null;
  blendedSpeed: number;
  endTime: number;
}

function normalizeReportedSpeed(value: number | null | undefined, sport: SportType) {
  if (!Number.isFinite(value ?? NaN)) return null;
  if ((value ?? 0) <= 0.15) return null;
  if ((value ?? 0) > MAX_SPEED_BY_SPORT[sport] * 1.15) return null;
  return Number(value);
}

function deriveMovementLegs(points: RecordingPoint[], sport: SportType): MovementLeg[] {
  if (points.length < 2) return [];

  const legs: MovementLeg[] = [];

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const legSeconds = Math.max(0, (current.time - previous.time) / 1000);
    if (legSeconds <= 0) continue;

    const legDistance = haversine(previous.lat, previous.lng, current.lat, current.lng);
    const calculatedSpeed = legDistance / legSeconds;
    const reportedSpeed = normalizeReportedSpeed(current.speed, sport);

    if ((current.accuracy ?? 0) > MAX_GPS_ACCURACY_METERS) continue;
    if (calculatedSpeed > MAX_SPEED_BY_SPORT[sport] * 1.2) continue;
    if (
      legDistance <= jitterThreshold(previous, current) &&
      calculatedSpeed < STATIONARY_SPEED_THRESHOLD_MPS &&
      (reportedSpeed ?? calculatedSpeed) < STATIONARY_SPEED_THRESHOLD_MPS
    ) {
      continue;
    }

    const blendedSpeed = Math.max(calculatedSpeed, reportedSpeed ?? 0);
    legs.push({
      distance: legDistance,
      seconds: legSeconds,
      calculatedSpeed,
      reportedSpeed,
      blendedSpeed,
      endTime: current.time,
    });
  }

  return legs;
}

function summarizeMovement(points: RecordingPoint[], sport: SportType) {
  const legs = deriveMovementLegs(points, sport);
  if (!legs.length) return null;

  let distance = 0;
  let seconds = 0;
  let speedSeconds = 0;

  for (const leg of legs) {
    distance += leg.distance;
    seconds += leg.seconds;
    speedSeconds += leg.blendedSpeed * leg.seconds;
  }

  if (seconds <= 0 || distance <= 0) return null;
  return {
    distance,
    seconds,
    metersPerSecond: speedSeconds / seconds,
  };
}

function reportedSpeedEstimate(points: RecordingPoint[], sport: SportType) {
  if (points.length < 3) return null;
  const latestTime = points[points.length - 1].time;
  const cutoff = latestTime - REPORTED_SPEED_WINDOW_MS;
  const minSpeed = MIN_MOVING_SPEED_MPS[sport];
  const maxSpeed = MAX_SPEED_BY_SPORT[sport] * 1.15;
  const validSpeeds: number[] = [];
  for (let i = points.length - 1; i >= 0 && points[i].time >= cutoff; i -= 1) {
    const s = points[i].speed;
    if (s != null && s > minSpeed && s <= maxSpeed) {
      validSpeeds.push(s);
    }
  }
  if (validSpeeds.length < 3) return null;
  validSpeeds.sort((a, b) => a - b);
  const trimmed = validSpeeds.length >= 6
    ? validSpeeds.slice(1, -1)
    : validSpeeds;
  const mean = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
  return { metersPerSecond: mean, samples: validSpeeds.length };
}

function positionSpeedEstimate(points: RecordingPoint[], sport: SportType) {
  if (points.length < 3) return null;
  const latestTime = points[points.length - 1].time;
  const cutoff = latestTime - LIVE_PACE_WINDOW_MS;
  const windowPoints = points.filter((p) => p.time >= cutoff && (p.accuracy ?? 0) <= MAX_GPS_ACCURACY_METERS);
  if (windowPoints.length < 3) return null;

  let totalDistance = 0;
  let totalSeconds = 0;
  for (let i = 1; i < windowPoints.length; i += 1) {
    const prev = windowPoints[i - 1];
    const curr = windowPoints[i];
    const gapMs = curr.time - prev.time;
    if (gapMs <= 0 || gapMs > MAX_LEG_GAP_MS) continue;
    const legDist = haversine(prev.lat, prev.lng, curr.lat, curr.lng);
    const legSec = gapMs / 1000;
    const legSpeed = legDist / legSec;
    if (legSpeed > MAX_SPEED_BY_SPORT[sport] * 1.2) continue;
    totalDistance += legDist;
    totalSeconds += legSec;
  }

  if (totalSeconds < 3 || totalDistance <= 0) return null;
  return { metersPerSecond: totalDistance / totalSeconds, distance: totalDistance, seconds: totalSeconds };
}

function currentSpeedSample(points: RecordingPoint[], sport: SportType) {
  // Use GPS Doppler speed (CLLocation.speed) as primary signal, like Strava.
  // Fall back to position-derived speed if GPS speed unavailable.
  if (points.length < 2) return null;
  const latest = points[points.length - 1];
  const cutoff = latest.time - LIVE_PACE_WINDOW_MS;
  const windowPoints = points.filter((p) => p.time >= cutoff && (p.accuracy ?? 0) <= MAX_GPS_ACCURACY_METERS);
  if (windowPoints.length < 2) return null;

  // Try GPS speed first (median of recent valid readings)
  const gpsSpeedValues: number[] = [];
  for (const p of windowPoints) {
    if (p.speed != null && p.speed > 0.3 && p.speed <= MAX_SPEED_BY_SPORT[sport] * 1.2) {
      gpsSpeedValues.push(p.speed);
    }
  }

  if (gpsSpeedValues.length >= 3) {
    gpsSpeedValues.sort((a, b) => a - b);
    // Median for robustness against outliers
    const median = gpsSpeedValues[Math.floor(gpsSpeedValues.length / 2)];
    const windowSec = (windowPoints[windowPoints.length - 1].time - windowPoints[0].time) / 1000;
    return {
      distance: median * windowSec,
      seconds: windowSec,
      metersPerSecond: median,
      source: "gps" as const,
      reportedMps: median,
      positionMps: median,
    };
  }

  // Fallback: position-derived speed
  let totalDist = 0;
  let totalSec = 0;
  for (let i = 1; i < windowPoints.length; i++) {
    const dt = (windowPoints[i].time - windowPoints[i - 1].time) / 1000;
    if (dt <= 0 || dt > MAX_LEG_GAP_MS / 1000) continue;
    const d = haversine(windowPoints[i - 1].lat, windowPoints[i - 1].lng, windowPoints[i].lat, windowPoints[i].lng);
    const legSpeed = d / dt;
    if (legSpeed > MAX_SPEED_BY_SPORT[sport] * 1.2) continue;
    totalDist += d;
    totalSec += dt;
  }

  if (totalSec < 3 || totalDist <= 0) return null;
  const mps = totalDist / totalSec;
  return {
    distance: totalDist,
    seconds: totalSec,
    metersPerSecond: mps,
    source: "route" as const,
    reportedMps: 0,
    positionMps: mps,
  };
}

function confidenceForSample(
  sport: SportType,
  sample: { distance: number; seconds: number; metersPerSecond: number; reportedMps: number; positionMps: number; source: "gps" | "route" } | null,
): PaceConfidence {
  if (!sample || sample.metersPerSecond <= 0) return "none";
  if (sample.source === "gps" && sample.reportedMps > MIN_MOVING_SPEED_MPS[sport] * 2) return "high";
  if (sample.distance >= MIN_LIVE_PACE_DISTANCE_METERS[sport] * 3 && sample.seconds >= MIN_LIVE_PACE_SECONDS[sport] * 2) return "high";
  if (sample.distance >= MIN_LIVE_PACE_DISTANCE_METERS[sport] * 1.5 && sample.seconds >= MIN_LIVE_PACE_SECONDS[sport]) return "medium";
  if (sample.metersPerSecond > MIN_MOVING_SPEED_MPS[sport]) return "low";
  return "none";
}

function smoothSpeed(previous: number | null, next: number, _confidence: PaceConfidence) {
  if (!previous || !Number.isFinite(previous)) return next;
  // High alpha = fast response, minimal lag
  return previous + (next - previous) * 0.85;
}

function withLiveMetrics(draft: RecordingDraft, sampleTime = Date.now()): RecordingDraft {
  const liveDistance = Math.max(0, draft.distance + draft.pendingDistance);
  const movingSeconds = draftMovingSeconds(draft, sampleTime);

  // Average pace: total distance / gap-aware moving time.
  // movingSeconds only counts time between closely-spaced points (< 6s gaps),
  // so drift time (8-15s gaps) is excluded automatically.
  const averagePaceMps =
    draft.type === "Yoga" || movingSeconds < 10 || liveDistance <= 0
      ? null
      : liveDistance / movingSeconds;

  if (draft.type === "Yoga" || draft.status === "paused" || draft.status === "recovery" || draft.status === "saving") {
    return { ...draft, liveDistance, averagePaceMps, currentPaceMps: null, paceConfidence: "none" };
  }

  // Simple: show average pace. No GPS Doppler speed (unreliable through plugin).
  // When sitting still, movingSeconds < 10 → averagePaceMps null → shows "--".
  // When running, movingSeconds grows → averagePaceMps is real → shows pace.
  return {
    ...draft,
    liveDistance,
    averagePaceMps,
    currentPaceMps: averagePaceMps,
    paceConfidence: averagePaceMps ? "high" : "none",
  };
}

type Action =
  | { type: "restore"; draft: RecordingDraft }
  | { type: "start"; sport: SportType }
  | { type: "gps"; point: RecordingPoint }
  | { type: "heart"; value: number }
  | { type: "sensor"; sensor: SensorConnectionStatus }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "gps-error"; message: string; locationBlocked?: boolean }
  | { type: "map"; ready: boolean }
  | { type: "saving" }
  | { type: "error"; message: string }
  | { type: "clear" };

function createDraft(sport: SportType): RecordingDraft {
  return {
    id: crypto.randomUUID(),
    status: "starting",
    type: sport,
    startTime: Date.now(),
    pausedTime: 0,
    pausedAt: null,
    distance: 0,
    elevGain: 0,
    currentHR: null,
    avgHR: null,
    maxHR: null,
    hrSamples: [],
    cadence: null,
    calories: null,
    points: [],
    recentPoints: [],
    pendingPoints: [],
    pendingDistance: 0,
    pendingDuration: 0,
    liveDistance: 0,
    currentPaceMps: null,
    averagePaceMps: null,
    paceConfidence: "none",
    splits: [],
    sensorStatus: {
      coros: "idle",
      gps: "searching",
      mapReady: false,
      healthkit: "idle",
    },
    sensorTimeline: [],
    locationBlocked: false,
    error: null,
  };
}

function reducer(state: RecordingDraft | null, action: Action): RecordingDraft | null {
  switch (action.type) {
    case "restore":
      return withLiveMetrics({
        ...action.draft,
        recentPoints: action.draft.recentPoints ?? [...action.draft.points, ...(action.draft.pendingPoints ?? [])].slice(-12),
        pendingPoints: action.draft.pendingPoints ?? [],
        pendingDistance: action.draft.pendingDistance ?? 0,
        pendingDuration: action.draft.pendingDuration ?? 0,
        liveDistance: action.draft.liveDistance ?? action.draft.distance + (action.draft.pendingDistance ?? 0),
        currentPaceMps: action.draft.currentPaceMps ?? null,
        averagePaceMps: action.draft.averagePaceMps ?? null,
        paceConfidence: action.draft.paceConfidence ?? "none",
        locationBlocked: action.draft.locationBlocked ?? false,
        status: "recovery",
      });
    case "start":
      return createDraft(action.sport);
    case "gps": {
      // Strava approach: accept all points for distance, use GPS Doppler for pace.
      // No stationary filter — drift is negligible on a real run.
      if (!state || (state.status !== "recording" && state.status !== "starting")) return state;
      if ((action.point.accuracy ?? 0) > MAX_GPS_ACCURACY_METERS) {
        const alreadyLimited = state.sensorStatus.gps === "limited";
        return withLiveMetrics({
          ...state,
          locationBlocked: false,
          sensorStatus: { ...state.sensorStatus, gps: "limited" },
          sensorTimeline: alreadyLimited ? state.sensorTimeline : [...state.sensorTimeline, sensorTimelineEntry("gps", "limited", "Low GPS accuracy")],
        }, action.point.time);
      }

      const readyTimeline = state.sensorStatus.gps === "ready" ? state.sensorTimeline : [...state.sensorTimeline, sensorTimelineEntry("gps", "ready")];

      // First point: just store it
      if (state.points.length === 0) {
        return withLiveMetrics({
          ...state,
          points: [action.point],
          recentPoints: appendRecentPoint(state.recentPoints, action.point),
          locationBlocked: false,
          error: null,
          sensorStatus: { ...state.sensorStatus, gps: "ready" },
          sensorTimeline: readyTimeline,
        }, action.point.time);
      }

      const lastPoint = state.points[state.points.length - 1];
      const elapsedMs = action.point.time - lastPoint.time;

      // Rate limit: skip points arriving faster than 1 per second
      if (elapsedMs < MIN_POINT_INTERVAL_MS) {
        const recentPoints = appendRecentPoint(state.recentPoints, action.point);
        return withLiveMetrics({ ...state, recentPoints }, action.point.time);
      }

      const distance = haversine(lastPoint.lat, lastPoint.lng, action.point.lat, action.point.lng);
      const positionSpeed = distance / Math.max(1, elapsedMs / 1000);

      // Teleport filter only: skip impossibly fast jumps
      if (positionSpeed > MAX_SPEED_BY_SPORT[state.type]) {
        return withLiveMetrics(state, action.point.time);
      }

      // Real movement — add to track
      const recentPoints = appendRecentPoint(state.recentPoints, action.point);
      const newPoints = [...state.points, action.point];
      const newDistance = state.distance + distance;
      const newElevGain = state.elevGain + Math.max(0, action.point.alt - lastPoint.alt);

      return withLiveMetrics({
        ...state,
        status: "recording",
        points: newPoints,
        recentPoints,
        distance: newDistance,
        elevGain: newElevGain,
        pendingPoints: [],
        pendingDistance: 0,
        pendingDuration: 0,
        splits: computeSplits(newPoints),
        locationBlocked: false,
        error: null,
        sensorStatus: { ...state.sensorStatus, gps: "ready" },
        sensorTimeline: readyTimeline,
      }, action.point.time);
    }
    case "heart": {
      if (!state) return state;
      const hrSamples = [...state.hrSamples, action.value];
      const average = Math.round(hrSamples.reduce((sum, value) => sum + value, 0) / hrSamples.length);
      return {
        ...state,
        currentHR: action.value,
        avgHR: average,
        maxHR: Math.max(state.maxHR || 0, action.value),
        hrSamples,
        sensorStatus: { ...state.sensorStatus, coros: "live" },
      };
    }
    case "sensor":
      if (!state) return state;
      return {
        ...state,
        sensorStatus: { ...state.sensorStatus, coros: action.sensor },
        sensorTimeline: [...state.sensorTimeline, sensorTimelineEntry("coros", action.sensor)],
      };
    case "pause":
      if (!state || state.status !== "recording") return state;
      return withLiveMetrics({ ...state, status: "paused", pausedAt: Date.now(), recentPoints: [], pendingPoints: [], pendingDistance: 0, pendingDuration: 0 });
    case "resume":
      if (!state || state.status !== "paused" || !state.pausedAt) return state;
      return withLiveMetrics({
        ...state,
        status: "recording",
        pausedTime: state.pausedTime + (Date.now() - state.pausedAt),
        pausedAt: null,
        recentPoints: state.points.length ? [state.points[state.points.length - 1]] : [],
        pendingPoints: [],
        pendingDistance: 0,
        pendingDuration: 0,
        error: null,
      });
    case "gps-error":
      if (!state) return state;
      return {
        ...state,
        locationBlocked: Boolean(action.locationBlocked),
        error: action.message,
        sensorStatus: { ...state.sensorStatus, gps: "limited" },
      };
    case "map":
      if (!state) return state;
      return { ...state, sensorStatus: { ...state.sensorStatus, mapReady: action.ready } };
    case "saving":
      return state ? { ...state, status: "saving" } : state;
    case "error":
      return state ? { ...state, status: "save_error", error: action.message } : state;
    case "clear":
      return null;
    default:
      return state;
  }
}

function buildPendingWrite(draft: RecordingDraft, bodySnapshot: BodySnapshot | null): PendingWrite {
  const now = Date.now();
  const movingSeconds = draftMovingSeconds(draft, now);
  const pointCoords = draft.points.map((point) => [point.lat, point.lng] as [number, number]);
  const polyline = pointCoords.length > 1 ? encodePolyline(pointCoords) : null;
  const summary = {
    id: draft.id,
    source: "andes" as const,
    name: `${new Date(draft.startTime).getHours() < 12 ? "Morning" : new Date(draft.startTime).getHours() < 17 ? "Afternoon" : "Evening"} ${draft.type}`,
    type: draft.type,
    sport_type: draft.type,
    start_date_local: localIso(draft.startTime),
    moving_time: movingSeconds,
    elapsed_time: sanitizeSeconds((now - draft.startTime) / 1000),
    distance: Math.round(draft.distance),
    total_elevation_gain: Math.round(draft.elevGain),
    average_speed: movingSeconds > 0 ? draft.distance / movingSeconds : 0,
    max_speed: 0,
    average_heartrate: draft.avgHR,
    max_heartrate: draft.maxHR,
    average_cadence: draft.cadence,
    calories: draft.calories,
    summary_polyline: polyline,
    start_latlng: draft.points.length ? [draft.points[0].lat, draft.points[0].lng] as [number, number] : null,
    save_status: "pending" as const,
    comment_status: "pending" as const,
    comment_prompt_version: null,
    comment_headline: null,
    comment_preview: null,
    sensor_flags: {
      gps: draft.points.length > 1,
      hr: Boolean(draft.avgHR),
      body: Boolean(bodySnapshot && bodySnapshot.status === "ready"),
      healthkit: false,
    },
    body_snapshot_status: bodySnapshot?.status ?? ("missing_data" as const),
    healthkit_export_status: "idle" as const,
  };
  return {
    id: draft.id,
    createdAt: new Date().toISOString(),
    summary,
    detail: {
      id: draft.id,
      points: draft.points,
      splits: draft.splits,
      sensorTimeline: draft.sensorTimeline,
      bodySnapshot,
      coachComment: null,
      sanitized: true,
      repair_version: 1,
    },
  };
}

interface RecordingMachineOptions {
  pairedDeviceId?: string;
  bodySnapshot?: BodySnapshot | null;
  onQueuedWrite: (write: PendingWrite) => Promise<void>;
}

export function useRecordingMachine({ pairedDeviceId, bodySnapshot = null, onQueuedWrite }: RecordingMachineOptions) {
  const [draft, dispatch] = useReducer(reducer, null);
  const [now, setNow] = useState(() => Date.now());
  const [draftHydrated, setDraftHydrated] = useState(false);
  const watchIdRef = useRef<string | number | null>(null);
  const foregroundWatchIdRef = useRef<number | null>(null);
  const disconnectHrRef = useRef<null | (() => Promise<void>)>(null);
  const draftRef = useRef<RecordingDraft | null>(null);

  useEffect(() => {
    draftRef.current = draft;
    if (!draftHydrated) return;
    if (draft) {
      void saveRecordingDraft(draft);
    } else {
      void clearRecordingDraft();
    }
  }, [draft, draftHydrated]);

  useEffect(() => {
    void (async () => {
      const stored = await loadRecordingDraft();
      if (stored) {
        dispatch({ type: "restore", draft: stored });
      }
      setDraftHydrated(true);
    })();
  }, []);

  useEffect(() => {
    if (!draft) return;
    setNow(Date.now());
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [draft]);

  const cleanup = useCallback(async () => {
    KeepAwake.allowSleep().catch(() => undefined);
    if (watchIdRef.current !== null) {
      if (isNative) {
        await BackgroundGeolocation.removeWatcher({ id: watchIdRef.current });
      } else {
        navigator.geolocation.clearWatch(Number(watchIdRef.current));
      }
      watchIdRef.current = null;
    }
    if (foregroundWatchIdRef.current !== null) {
      navigator.geolocation.clearWatch(foregroundWatchIdRef.current);
      foregroundWatchIdRef.current = null;
    }
    if (disconnectHrRef.current) {
      await disconnectHrRef.current();
      disconnectHrRef.current = null;
    }
  }, []);

  const start = useCallback(async (sport: SportType) => {
    dispatch({ type: "start", sport });
    KeepAwake.keepAwake().catch(() => undefined);

    const handlePosition = (
      position:
        | GeolocationPosition
        | { coords: { latitude: number; longitude: number; altitude?: number | null; accuracy?: number | null; speed?: number | null }; timestamp: number }
    ) => {
      dispatch({
        type: "gps",
        point: {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          alt: position.coords.altitude || 0,
          time: position.timestamp,
          hr: draftRef.current?.currentHR ?? null,
          accuracy: position.coords.accuracy ?? null,
          speed: position.coords.speed ?? null,
        },
      });
    };

    if (sport !== "Yoga") {
      const distanceFilterBySport =
        sport === "Ride" ? 8 : 5;
      const geolocationOptions: PositionOptions = {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 8000,
      };
      if (isNative) {
        watchIdRef.current = await BackgroundGeolocation.addWatcher(
          { requestPermissions: true, stale: false, distanceFilter: distanceFilterBySport, backgroundTitle: "Alpaca", backgroundMessage: "Alpaca is recording your activity" },
          (position: BackgroundPosition | null, error: { message?: string } | null) => {
            if (error) {
              const message = error.message || "Location access is required to record distance.";
              const denied = /denied|not authorized|permission/i.test(message);
              dispatch({
                type: "gps-error",
                message: denied ? "Location access is off. Open Settings and allow Alpaca to use your location." : message,
                locationBlocked: denied,
              });
              return;
            }
            if (!position) return;
            handlePosition({
              coords: {
                latitude: position.latitude,
                longitude: position.longitude,
                altitude: position.altitude ?? 0,
                accuracy: position.accuracy ?? null,
                speed: position.speed ?? null,
              },
              timestamp: position.time || Date.now(),
            });
          }
        );
      } else {
        watchIdRef.current = navigator.geolocation.watchPosition(
          handlePosition,
          (error) => {
            const denied = error.code === error.PERMISSION_DENIED;
            dispatch({
              type: "gps-error",
              message: denied ? "Location access is off. Open Settings and allow Alpaca to use your location." : "Unable to get a GPS fix yet.",
              locationBlocked: denied,
            });
          },
          geolocationOptions
        );
      }
    }

    if (pairedDeviceId) {
      try {
        disconnectHrRef.current = await connectHeartRateDevice(
          pairedDeviceId,
          (hr) => dispatch({ type: "heart", value: hr }),
          (status) => dispatch({ type: "sensor", sensor: status })
        );
      } catch {
        dispatch({ type: "sensor", sensor: "unavailable" });
      }
    }
  }, [pairedDeviceId]);

  const pause = useCallback(() => dispatch({ type: "pause" }), []);
  const resume = useCallback(() => dispatch({ type: "resume" }), []);
  const setMapReady = useCallback((ready: boolean) => dispatch({ type: "map", ready }), []);
  const openLocationSettings = useCallback(async () => {
    if (!isNative) return;
    try {
      await BackgroundGeolocation.openSettings();
    } catch {
      // ignore
    }
  }, []);
  const discard = useCallback(async () => {
    await cleanup();
    dispatch({ type: "clear" });
  }, [cleanup]);

  const stop = useCallback(async () => {
    if (!draftRef.current) return;
    dispatch({ type: "saving" });
    await cleanup();
    const write = buildPendingWrite(draftRef.current, bodySnapshot);
    try {
      await onQueuedWrite(write);
      dispatch({ type: "clear" });
    } catch (error) {
      dispatch({ type: "error", message: error instanceof Error ? error.message : "Unable to queue activity." });
    }
  }, [bodySnapshot, cleanup, onQueuedWrite]);

  const currentElapsed = useMemo(() => {
    if (!draft) return 0;
    if (draft.status === "paused" && draft.pausedAt) {
      return sanitizeSeconds((draft.pausedAt - draft.startTime - draft.pausedTime) / 1000);
    }
    return sanitizeSeconds((now - draft.startTime - draft.pausedTime) / 1000);
  }, [draft, now]);

  return {
    draft,
    currentElapsed,
    start,
    pause,
    resume,
    stop,
    discard,
    setMapReady,
    openLocationSettings,
  };
}
