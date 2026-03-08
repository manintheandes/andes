import { registerPlugin } from "@capacitor/core";
import { Health } from "@capgo/capacitor-health";
import type { RecordingPoint, SportType } from "../../types";

export interface HealthAuthorizationSnapshot {
  available: boolean;
  readAuthorized: boolean;
  writeAuthorized: boolean;
  readScopes: string[];
  missingReadScopes: string[];
  writeScopes: string[];
  missingWriteScopes: string[];
}

interface AndesHealthKitPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  getAuthorizationStatus(): Promise<HealthAuthorizationSnapshot>;
  requestAuthorization(): Promise<HealthAuthorizationSnapshot>;
  writeWorkout(options: {
    type: SportType;
    startDate: string;
    endDate: string;
    distance: number;
    calories: number | null;
    averageHeartRate: number | null;
    maxHeartRate: number | null;
    route: RecordingPoint[];
  }): Promise<{ exportedAt: string | null; routeStored: boolean; queued: boolean }>;
  retryPendingExports(): Promise<{ processed: number }>;
}

const AndesHealthKit = registerPlugin<AndesHealthKitPlugin>("AndesHealthKit");

export async function getHealthAvailability(): Promise<boolean> {
  try {
    const result = await AndesHealthKit.isAvailable();
    return Boolean(result.available);
  } catch {
    const result = await Health.isAvailable();
    return Boolean(result.available);
  }
}

export async function getHealthAuthorizationStatus(): Promise<HealthAuthorizationSnapshot> {
  try {
    return await AndesHealthKit.getAuthorizationStatus();
  } catch {
    const status = await Health.checkAuthorization({
      read: ["sleep", "restingHeartRate", "heartRateVariability", "heartRate"] as never[],
      write: ["distance", "calories", "heartRate"] as never[],
    });
    return {
      available: true,
      readAuthorized: status.readDenied.length === 0,
      writeAuthorized: status.writeDenied.length === 0,
      readScopes: status.readAuthorized,
      missingReadScopes: status.readDenied,
      writeScopes: status.writeAuthorized,
      missingWriteScopes: status.writeDenied,
    };
  }
}

export async function requestHealthAuthorization(): Promise<HealthAuthorizationSnapshot> {
  try {
    return await AndesHealthKit.requestAuthorization();
  } catch {
    const status = await Health.requestAuthorization({
      read: ["sleep", "restingHeartRate", "heartRateVariability", "heartRate"] as never[],
      write: ["distance", "calories", "heartRate"] as never[],
    });
    return {
      available: true,
      readAuthorized: status.readDenied.length === 0,
      writeAuthorized: status.writeDenied.length === 0,
      readScopes: status.readAuthorized,
      missingReadScopes: status.readDenied,
      writeScopes: status.writeAuthorized,
      missingWriteScopes: status.writeDenied,
    };
  }
}

export async function readHealthFallback(startDate: string, endDate: string): Promise<{ hrv: number | null; rhr: number | null }> {
  try {
    const [hrv, rhr] = await Promise.all([
      Health.readSamples({ dataType: "heartRateVariability", startDate, endDate, limit: 1, ascending: false }),
      Health.readSamples({ dataType: "restingHeartRate", startDate, endDate, limit: 1, ascending: false }),
    ]);
    return {
      hrv: hrv.samples[0]?.value ?? null,
      rhr: rhr.samples[0]?.value ?? null,
    };
  } catch {
    return { hrv: null, rhr: null };
  }
}

export async function writeWorkoutToHealthKit(options: Parameters<AndesHealthKitPlugin["writeWorkout"]>[0]): Promise<{ exportedAt: string | null; routeStored: boolean; queued: boolean }> {
  return AndesHealthKit.writeWorkout(options);
}

export async function retryPendingHealthkitExports(): Promise<{ processed: number }> {
  return AndesHealthKit.retryPendingExports();
}
