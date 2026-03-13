import type { ActivityDetail, BodySnapshot, BootstrapResponse, CoachComment, LocalSettings, PendingWrite, SessionState } from "../../types";
import { apiBase } from "../storage/device";
import { loadSession } from "../storage/session";
import { activityDetailSchema, bootstrapSchema, coachCommentSchema, loginSchema } from "./contracts";

function localRequestContext() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return {
    day: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

async function request<T>(path: string, init: RequestInit = {}, parser?: (input: unknown) => T): Promise<T> {
  const session = await loadSession();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  const context = localRequestContext();
  headers.set("x-andes-day", context.day);
  headers.set("x-andes-timezone", context.timeZone);
  if (session?.token) {
    headers.set("Authorization", `Bearer ${session.token}`);
  }
  const response = await fetch(`${apiBase()}${path}`, { ...init, headers });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `${response.status}`);
  }
  const json = (await response.json()) as unknown;
  return parser ? parser(json) : (json as T);
}

function liveBase(): string {
  return apiBase() || "https://andes-black.vercel.app";
}

function sameOriginBase(): string {
  return apiBase();
}

export async function login(password: string): Promise<SessionState> {
  return request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ password }),
  }, (input) => loginSchema.parse(input));
}

export async function logout(): Promise<void> {
  await request("/api/auth/logout", { method: "POST", body: JSON.stringify({}) });
}

export async function fetchBootstrap(): Promise<BootstrapResponse> {
  return request("/api/bootstrap", { method: "GET" }, (input) => bootstrapSchema.parse(input));
}

export async function fetchActivity(id: string, ouraToken?: string): Promise<ActivityDetail> {
  return request(`/api/activity?id=${encodeURIComponent(id)}`, {
    method: "GET",
    headers: ouraToken ? { "x-oura-token": ouraToken } : undefined,
  }, (input) => activityDetailSchema.parse(input));
}

export async function saveActivity(payload: PendingWrite): Promise<void> {
  await request("/api/activity/save", { method: "POST", body: JSON.stringify(payload) });
}

export async function deleteActivity(id: string): Promise<void> {
  await request("/api/activity/delete", {
    method: "POST",
    body: JSON.stringify({ activityId: id }),
  });
}

export async function refreshOura(token: string, day: string, timeZone: string): Promise<BodySnapshot> {
  return request("/api/integrations/oura/refresh", {
    method: "POST",
    headers: { "x-oura-token": token },
    body: JSON.stringify({ day, timeZone }),
  }) as Promise<BodySnapshot>;
}

export async function backfillOuraHistory(token: string, days: string[], timeZone: string): Promise<{ processedDays: number; updatedActivities: number; readyDays: number }> {
  return request("/api/integrations/oura/backfill", {
    method: "POST",
    headers: { "x-oura-token": token },
    body: JSON.stringify({ days, timeZone }),
  }) as Promise<{ processedDays: number; updatedActivities: number; readyDays: number }>;
}

export async function importStrava(credentials: { clientId?: string; clientSecret?: string; refreshToken: string }): Promise<{ count: number }> {
  const headers: Record<string, string> = {};
  if (credentials.refreshToken) headers["x-strava-refresh-token"] = credentials.refreshToken;
  if (credentials.clientId) headers["x-strava-client-id"] = credentials.clientId;
  if (credentials.clientSecret) headers["x-strava-client-secret"] = credentials.clientSecret;
  return request("/api/integrations/strava/import", {
    method: "POST",
    headers,
    body: JSON.stringify({}),
  }) as Promise<{ count: number }>;
}

export function stravaConnectUrl(): string {
  return `${apiBase()}/api/integrations/strava/connect`;
}

export async function repairLibrary(): Promise<{ repairedCount: number }> {
  return request("/api/library/repair", { method: "POST", body: JSON.stringify({}) }) as Promise<{ repairedCount: number }>;
}

export async function commentActivity(id: string, force = false, ouraToken?: string): Promise<CoachComment> {
  return request("/api/activity/comment", {
    method: "POST",
    headers: ouraToken ? { "x-oura-token": ouraToken } : undefined,
    body: JSON.stringify({ activityId: id, force }),
  }, (input) => coachCommentSchema.parse(input));
}

export async function backfillComments(limit = 12): Promise<{ processed: number; reused: number; errored: number; remaining: number }> {
  return request("/api/activity/comment/backfill", {
    method: "POST",
    body: JSON.stringify({ limit }),
  }) as Promise<{ processed: number; reused: number; errored: number; remaining: number }>;
}

export async function importLegacySettings(): Promise<Partial<LocalSettings> | null> {
  const session = await loadSession();
  const headers = new Headers();
  if (session?.token) {
    headers.set("Authorization", `Bearer ${session.token}`);
  }

  try {
    const response = await fetch(`${sameOriginBase()}/api/settings/import-legacy`, {
      method: "GET",
      headers,
    });
    if (response.ok) {
      const json = (await response.json()) as { settings?: Partial<LocalSettings> | null };
      return json.settings ?? null;
    }
  } catch {
    // Fall through to legacy import path.
  }

  try {
    const response = await fetch(`${liveBase()}/api/get-data?key=an_settings`);
    if (!response.ok) return null;
    const json = (await response.json()) as { value?: Partial<LocalSettings> | null };
    return json.value ?? null;
  } catch {
    return null;
  }
}
