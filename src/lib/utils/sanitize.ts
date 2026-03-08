import type { ActivitySummary, RecordingPoint, Split } from "../../types";
import { haversine, MILE } from "./geo";

const MAX_POINT_ACCURACY_METERS = 35;
const MIN_MOVING_SPEED_MPS = 0.3;

function jitterThreshold(previous: RecordingPoint, current: RecordingPoint): number {
  const radius = Math.max(previous.accuracy ?? 0, current.accuracy ?? 0);
  return Math.max(6, Math.min(18, radius * 0.6));
}

export function sanitizeSeconds(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value);
}

export function sanitizeNumber(value: number | null | undefined): number {
  if (!Number.isFinite(value ?? NaN)) return 0;
  return Math.max(0, Number(value));
}

export function sanitizePoints(points: RecordingPoint[]): RecordingPoint[] {
  if (points.length < 2) return points;
  const first = points[0];
  const next: RecordingPoint[] = [first];
  for (let index = 1; index < points.length; index += 1) {
    const current = points[index];
    const previous = next[next.length - 1];
    if ((current.accuracy ?? 0) > MAX_POINT_ACCURACY_METERS) continue;
    const seconds = Math.max(1, (current.time - previous.time) / 1000);
    const distance = haversine(previous.lat, previous.lng, current.lat, current.lng);
    const speed = distance / seconds;
    if (distance <= jitterThreshold(previous, current) && speed < MIN_MOVING_SPEED_MPS && (current.speed ?? speed) < MIN_MOVING_SPEED_MPS) {
      continue;
    }
    if (distance > 1200) continue;
    next.push(current);
  }
  return next;
}

export function computeSplits(points: RecordingPoint[]): Split[] {
  const splits: Split[] = [];
  let totalDistance = 0;
  let splitStartIndex = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const legDistance = haversine(previous.lat, previous.lng, current.lat, current.lng);
    totalDistance += legDistance;
    const previousMiles = Math.floor((totalDistance - legDistance) / MILE);
    const currentMiles = Math.floor(totalDistance / MILE);
    if (currentMiles > previousMiles) {
      const splitPoints = points.slice(splitStartIndex, index + 1);
      const splitHR = splitPoints.map((point) => point.hr).filter((value): value is number => typeof value === "number");
      splits.push({
        distance: MILE,
        time: Math.max(0, (current.time - points[splitStartIndex].time) / 1000),
        avgHR: splitHR.length ? splitHR.reduce((sum, value) => sum + value, 0) / splitHR.length : null,
        endIdx: index + 1,
      });
      splitStartIndex = index;
    }
  }
  return splits;
}

export function sanitizeActivity(summary: ActivitySummary): ActivitySummary {
  const movingTime = sanitizeSeconds(summary.moving_time);
  const elapsedTime = Math.max(movingTime, sanitizeSeconds(summary.elapsed_time));
  return {
    ...summary,
    moving_time: movingTime,
    elapsed_time: elapsedTime,
    distance: sanitizeNumber(summary.distance),
    total_elevation_gain: sanitizeNumber(summary.total_elevation_gain),
    average_speed: sanitizeNumber(summary.average_speed),
    max_speed: sanitizeNumber(summary.max_speed),
    average_heartrate: summary.average_heartrate && summary.average_heartrate > 0 ? summary.average_heartrate : null,
    max_heartrate: summary.max_heartrate && summary.max_heartrate > 0 ? summary.max_heartrate : null,
    calories: summary.calories && summary.calories > 0 ? summary.calories : null,
  };
}
