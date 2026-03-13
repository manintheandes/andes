import type { ActivitySummary, SportType } from "../../types";

const MILE = 1609.34;

export interface PersonalRecord {
  label: string;
  value: string;
  unit: string;
  activityId: string;
  activityName: string;
  date: string;
  type: SportType;
}

function paceString(metersPerSecond: number): string {
  if (!metersPerSecond || metersPerSecond <= 0) return "--";
  const secondsPerMile = MILE / metersPerSecond;
  const minutes = Math.floor(secondsPerMile / 60);
  const seconds = Math.floor(secondsPerMile % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function durationString(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.round(totalSeconds || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = Math.floor(safeSeconds % 60);
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function distanceMiles(meters: number): string {
  return (Math.max(0, meters || 0) / MILE).toFixed(2);
}

function speedMph(metersPerSecond: number): string {
  if (!metersPerSecond || metersPerSecond <= 0) return "--";
  return (metersPerSecond * 2.23694).toFixed(1);
}

function elevationFeet(meters: number): string {
  return Math.round(Math.max(0, meters || 0) * 3.28084).toLocaleString();
}

/**
 * Compute personal records from all activities.
 * Returns records grouped by category.
 */
export function computeRecords(activities: ActivitySummary[]): PersonalRecord[] {
  if (activities.length === 0) return [];

  const records: PersonalRecord[] = [];
  const runs = activities.filter((a) => a.type === "Run");
  const rides = activities.filter((a) => a.type === "Ride");
  const hikes = activities.filter((a) => a.type === "Hike");
  const all = activities;

  // Longest run (distance)
  const longestRun = runs.reduce<ActivitySummary | null>((best, a) => (!best || a.distance > best.distance ? a : best), null);
  if (longestRun && longestRun.distance > 0) {
    records.push({
      label: "Longest Run",
      value: distanceMiles(longestRun.distance),
      unit: "mi",
      activityId: longestRun.id,
      activityName: longestRun.name,
      date: longestRun.start_date_local,
      type: longestRun.type,
    });
  }

  // Fastest pace (run) -- highest average_speed
  const fastestRun = runs.filter((a) => a.average_speed > 0 && a.distance >= 1000).reduce<ActivitySummary | null>((best, a) => (!best || a.average_speed > best.average_speed ? a : best), null);
  if (fastestRun) {
    records.push({
      label: "Fastest Pace",
      value: paceString(fastestRun.average_speed),
      unit: "/mi",
      activityId: fastestRun.id,
      activityName: fastestRun.name,
      date: fastestRun.start_date_local,
      type: fastestRun.type,
    });
  }

  // Fastest 5K -- fastest run that's >= 5km, estimated 5K time from pace
  const fiveKRuns = runs.filter((a) => a.distance >= 5000 && a.average_speed > 0);
  const fastest5K = fiveKRuns.reduce<ActivitySummary | null>((best, a) => {
    if (!best) return a;
    // Estimate 5K time from average speed
    const aTime = 5000 / a.average_speed;
    const bestTime = 5000 / best.average_speed;
    return aTime < bestTime ? a : best;
  }, null);
  if (fastest5K) {
    const estimated5KTime = 5000 / fastest5K.average_speed;
    records.push({
      label: "Fastest 5K",
      value: durationString(estimated5KTime),
      unit: "time",
      activityId: fastest5K.id,
      activityName: fastest5K.name,
      date: fastest5K.start_date_local,
      type: fastest5K.type,
    });
  }

  // Fastest 10K
  const tenKRuns = runs.filter((a) => a.distance >= 10000 && a.average_speed > 0);
  const fastest10K = tenKRuns.reduce<ActivitySummary | null>((best, a) => {
    if (!best) return a;
    const aTime = 10000 / a.average_speed;
    const bestTime = 10000 / best.average_speed;
    return aTime < bestTime ? a : best;
  }, null);
  if (fastest10K) {
    const estimated10KTime = 10000 / fastest10K.average_speed;
    records.push({
      label: "Fastest 10K",
      value: durationString(estimated10KTime),
      unit: "time",
      activityId: fastest10K.id,
      activityName: fastest10K.name,
      date: fastest10K.start_date_local,
      type: fastest10K.type,
    });
  }

  // Longest ride
  const longestRide = rides.reduce<ActivitySummary | null>((best, a) => (!best || a.distance > best.distance ? a : best), null);
  if (longestRide && longestRide.distance > 0) {
    records.push({
      label: "Longest Ride",
      value: distanceMiles(longestRide.distance),
      unit: "mi",
      activityId: longestRide.id,
      activityName: longestRide.name,
      date: longestRide.start_date_local,
      type: longestRide.type,
    });
  }

  // Fastest ride (speed)
  const fastestRide = rides.filter((a) => a.average_speed > 0 && a.distance >= 1000).reduce<ActivitySummary | null>((best, a) => (!best || a.average_speed > best.average_speed ? a : best), null);
  if (fastestRide) {
    records.push({
      label: "Fastest Ride",
      value: speedMph(fastestRide.average_speed),
      unit: "mph",
      activityId: fastestRide.id,
      activityName: fastestRide.name,
      date: fastestRide.start_date_local,
      type: fastestRide.type,
    });
  }

  // Longest duration (any activity)
  const longestDuration = all.reduce<ActivitySummary | null>((best, a) => (!best || a.moving_time > best.moving_time ? a : best), null);
  if (longestDuration && longestDuration.moving_time > 0) {
    records.push({
      label: "Longest Session",
      value: durationString(longestDuration.moving_time),
      unit: "time",
      activityId: longestDuration.id,
      activityName: longestDuration.name,
      date: longestDuration.start_date_local,
      type: longestDuration.type,
    });
  }

  // Highest climb (elevation gain)
  const highestClimb = all.filter((a) => a.total_elevation_gain > 0).reduce<ActivitySummary | null>((best, a) => (!best || a.total_elevation_gain > best.total_elevation_gain ? a : best), null);
  if (highestClimb) {
    records.push({
      label: "Most Climbing",
      value: elevationFeet(highestClimb.total_elevation_gain),
      unit: "ft",
      activityId: highestClimb.id,
      activityName: highestClimb.name,
      date: highestClimb.start_date_local,
      type: highestClimb.type,
    });
  }

  // Highest heart rate
  const highestHR = all.filter((a) => a.max_heartrate && a.max_heartrate > 0).reduce<ActivitySummary | null>((best, a) => {
    if (!best) return a;
    return (a.max_heartrate ?? 0) > (best.max_heartrate ?? 0) ? a : best;
  }, null);
  if (highestHR?.max_heartrate) {
    records.push({
      label: "Max Heart Rate",
      value: String(Math.round(highestHR.max_heartrate)),
      unit: "bpm",
      activityId: highestHR.id,
      activityName: highestHR.name,
      date: highestHR.start_date_local,
      type: highestHR.type,
    });
  }

  // Longest hike
  const longestHike = hikes.reduce<ActivitySummary | null>((best, a) => (!best || a.distance > best.distance ? a : best), null);
  if (longestHike && longestHike.distance > 0) {
    records.push({
      label: "Longest Hike",
      value: distanceMiles(longestHike.distance),
      unit: "mi",
      activityId: longestHike.id,
      activityName: longestHike.name,
      date: longestHike.start_date_local,
      type: longestHike.type,
    });
  }

  // Most calories
  const mostCalories = all.filter((a) => a.calories && a.calories > 0).reduce<ActivitySummary | null>((best, a) => {
    if (!best) return a;
    return (a.calories ?? 0) > (best.calories ?? 0) ? a : best;
  }, null);
  if (mostCalories?.calories) {
    records.push({
      label: "Most Calories",
      value: String(Math.round(mostCalories.calories)),
      unit: "kcal",
      activityId: mostCalories.id,
      activityName: mostCalories.name,
      date: mostCalories.start_date_local,
      type: mostCalories.type,
    });
  }

  return records;
}
