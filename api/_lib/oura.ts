import type { BodySnapshot } from "../../src/types";

interface OuraEntry {
  day: string;
  score?: number;
  contributors?: Record<string, number | undefined>;
  average_hrv?: number;
  average_heart_rate?: number;
  total_sleep_duration?: number;
}

interface OuraResponse {
  data?: OuraEntry[];
}

function shiftDay(day: string, delta: number): string {
  const anchor = new Date(`${day}T12:00:00Z`);
  anchor.setUTCDate(anchor.getUTCDate() + delta);
  return anchor.toISOString().slice(0, 10);
}

function previousDay(day: string): string {
  return shiftDay(day, -1);
}

function dayDistance(start: string, end: string): number {
  const startTime = new Date(`${start}T00:00:00Z`).getTime();
  const endTime = new Date(`${end}T00:00:00Z`).getTime();
  return Math.max(0, Math.round((endTime - startTime) / 86400000));
}

function normalizeDaySet(days: string[]): string[] {
  return Array.from(new Set(days.filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day)))).sort();
}

function buildSnapshot(
  day: string,
  bestSleep?: OuraEntry,
  bestReadiness?: OuraEntry,
  bestSession?: OuraEntry,
): BodySnapshot {
  const sourceDay = bestSleep?.day ?? bestReadiness?.day ?? bestSession?.day ?? day;
  return {
    day,
    sleep_score: bestSleep?.score ?? null,
    readiness_score: bestReadiness?.score ?? null,
    hrv: bestSession?.average_hrv ? Math.round(bestSession.average_hrv) : null,
    rhr: bestSession?.average_heart_rate ? Math.round(bestSession.average_heart_rate) : null,
    total_sleep: bestSession?.total_sleep_duration ?? null,
    contributors: bestReadiness?.contributors,
    source_day: sourceDay,
    fetched_at: new Date().toISOString(),
    status: bestSleep || bestReadiness || bestSession ? "ready" : "missing_data",
  };
}

async function fetchOuraRange(token: string, startDay: string, endDay: string) {
  const headers = { Authorization: `Bearer ${token}` };
  const base = "https://api.ouraring.com/v2/usercollection";
  const rangeStart = previousDay(startDay);

  const [dailySleepResp, readinessResp, sleepResp] = await Promise.all([
    fetch(`${base}/daily_sleep?start_date=${rangeStart}&end_date=${endDay}`, { headers }),
    fetch(`${base}/daily_readiness?start_date=${rangeStart}&end_date=${endDay}`, { headers }),
    fetch(`${base}/sleep?start_date=${rangeStart}&end_date=${endDay}`, { headers }),
  ]);

  return {
    daily_sleep: dailySleepResp.ok ? ((await dailySleepResp.json()) as OuraResponse).data ?? [] : [],
    daily_readiness: readinessResp.ok ? ((await readinessResp.json()) as OuraResponse).data ?? [] : [],
    sleep: sleepResp.ok ? ((await sleepResp.json()) as OuraResponse).data ?? [] : [],
  };
}

export async function fetchOuraSnapshots(token: string, days: string[], timeZone: string): Promise<Record<string, BodySnapshot>> {
  void timeZone;
  const normalizedDays = normalizeDaySet(days);
  if (!normalizedDays.length) return {};

  const snapshots: Record<string, BodySnapshot> = {};
  let index = 0;

  while (index < normalizedDays.length) {
    const chunkStart = normalizedDays[index];
    let chunkEnd = chunkStart;
    let chunkDays = [chunkStart];
    index += 1;

    while (index < normalizedDays.length && dayDistance(chunkStart, normalizedDays[index]) < 90) {
      chunkEnd = normalizedDays[index];
      chunkDays.push(normalizedDays[index]);
      index += 1;
    }

    const range = await fetchOuraRange(token, chunkStart, chunkEnd);
    const sleepByDay = new Map(range.daily_sleep.map((entry) => [entry.day, entry]));
    const readinessByDay = new Map(range.daily_readiness.map((entry) => [entry.day, entry]));
    const sessionByDay = new Map(range.sleep.map((entry) => [entry.day, entry]));

    for (const day of chunkDays) {
      const previous = previousDay(day);
      snapshots[day] = buildSnapshot(
        day,
        sleepByDay.get(day) ?? sleepByDay.get(previous),
        readinessByDay.get(day) ?? readinessByDay.get(previous),
        sessionByDay.get(day) ?? sessionByDay.get(previous),
      );
    }
  }

  return snapshots;
}

export async function fetchOuraSnapshot(token: string, day: string, timeZone: string): Promise<BodySnapshot> {
  return (await fetchOuraSnapshots(token, [day], timeZone))[day] ?? buildSnapshot(day, undefined, undefined, undefined);
}
