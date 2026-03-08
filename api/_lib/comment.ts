import { createHash } from "node:crypto";
import type { ActivitySummary, CoachComment } from "../../src/types";
import type { StoredActivityDetail } from "./activities.js";
import { envValue } from "./env.js";

export const COACH_PROMPT_VERSION = "alpaca-coach-v3";

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function distanceContext(distanceMeters: number) {
  return {
    miles: round(distanceMeters / 1609.344),
    feet: Math.round(distanceMeters * 3.28084),
  };
}

function speedContext(averageSpeedMetersPerSecond: number, type: ActivitySummary["type"]) {
  const mph = round(averageSpeedMetersPerSecond * 2.236936);
  if (type === "Ride") {
    return {
      miles_per_hour: mph,
    };
  }
  const minutesPerMile = averageSpeedMetersPerSecond > 0 ? round(26.8224 / averageSpeedMetersPerSecond, 2) : null;
  return {
    minutes_per_mile: minutesPerMile,
  };
}

function hashInput(input: unknown): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function sevenDayLoad(summary: ActivitySummary, history: ActivitySummary[]) {
  const end = new Date(summary.start_date_local).getTime();
  const start = end - 7 * 24 * 60 * 60 * 1000;
  return history
    .filter((candidate) => {
      const at = new Date(candidate.start_date_local).getTime();
      return at >= start && at <= end;
    })
    .reduce((total, candidate) => total + candidate.moving_time, 0);
}

export function buildCoachInput(summary: ActivitySummary, detail: StoredActivityDetail, history: ActivitySummary[]) {
  const previous = history.find((candidate) => candidate.type === summary.type && candidate.id !== summary.id);
  return {
    summary: {
      type: summary.type,
      distance: distanceContext(summary.distance),
      moving_time_seconds: summary.moving_time,
      moving_time_minutes: round(summary.moving_time / 60, 1),
      average_speed: speedContext(summary.average_speed, summary.type),
      average_heartrate: summary.average_heartrate,
      max_heartrate: summary.max_heartrate,
      elevation_feet: Math.round(summary.total_elevation_gain * 3.28084),
      started_at: summary.start_date_local,
      source: summary.source,
    },
    splits: detail.splits.slice(0, 6).map((split, index) => ({
      index: index + 1,
      distance: distanceContext(split.distance),
      time_seconds: split.time,
      time_minutes: round(split.time / 60, 1),
      average_heartrate: split.avgHR,
    })),
    body: detail.bodySnapshot,
    previousSameType: previous
      ? {
          distance: distanceContext(previous.distance),
          moving_time_seconds: previous.moving_time,
          moving_time_minutes: round(previous.moving_time / 60, 1),
          average_speed: speedContext(previous.average_speed, previous.type),
          average_heartrate: previous.average_heartrate,
        }
      : null,
    recentLoadSeconds: sevenDayLoad(summary, history),
    recentLoadHours: round(sevenDayLoad(summary, history) / 3600, 2),
    sensorFlags: summary.sensor_flags,
  };
}

export function createCoachInputHash(summary: ActivitySummary, detail: StoredActivityDetail, history: ActivitySummary[]): string {
  return hashInput(buildCoachInput(summary, detail, history));
}

function normalizeCoachText(value: string): string {
  return value.replace(/\s+/g, " ").replace(/^["']+|["']+$/g, "").trim();
}

function hasMetaLeak(value: string): boolean {
  return /\b(developer says|must be valid json|valid json|cannot mention|probably okay|prompt|schema|response must|wait\b)\b/i.test(value);
}

function sanitizeBullet(value: string): string {
  return normalizeCoachText(value.replace(/"\s*,\s*"/g, " / "));
}

function isUsableCoachField(value: string, maxLength: number): boolean {
  if (!value) return false;
  if (value.length > maxLength) return false;
  if (hasMetaLeak(value)) return false;
  if (value.includes('","')) return false;
  return true;
}

function extractOutputText(response: unknown): string {
  const data = response as { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text;
  }
  for (const item of data.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" || content.type === "text") {
        if (content.text) return content.text;
      }
    }
  }
  return "";
}

function parseCoachPayload(rawText: string): { headline: string; summary: string; bullets: [string, string]; caution: string | null } {
  const parsed = JSON.parse(rawText) as {
    headline?: string;
    summary?: string;
    bullets?: unknown;
    caution?: string | null;
  };

  if (typeof parsed.headline !== "string" || typeof parsed.summary !== "string" || !Array.isArray(parsed.bullets) || parsed.bullets.length !== 2) {
    throw new Error("OpenAI comment payload was invalid.");
  }
  const headline = normalizeCoachText(parsed.headline).slice(0, 120);
  const summary = normalizeCoachText(parsed.summary).slice(0, 420);
  const bullets = parsed.bullets.map((item) => (typeof item === "string" ? sanitizeBullet(item) : "")).slice(0, 2) as [string, string];
  const caution = typeof parsed.caution === "string" ? normalizeCoachText(parsed.caution).slice(0, 160) : null;

  if (!headline || !summary || !bullets[0] || !bullets[1]) {
    throw new Error("OpenAI comment bullets were invalid.");
  }
  if (bullets.some((bullet) => bullet.length > 120 || bullet.includes('","') || hasMetaLeak(bullet))) {
    throw new Error("OpenAI comment bullets contained invalid meta text.");
  }
  if (hasMetaLeak(headline) || hasMetaLeak(summary) || (caution ? hasMetaLeak(caution) : false)) {
    throw new Error("OpenAI comment contained invalid meta text.");
  }
  return {
    headline,
    summary,
    bullets,
    caution,
  };
}

export function isValidCoachCommentContent(comment: CoachComment | null | undefined): comment is CoachComment {
  if (!comment) return false;
  if (!isUsableCoachField(normalizeCoachText(comment.headline), 120)) return false;
  if (!isUsableCoachField(normalizeCoachText(comment.summary), 420)) return false;
  if (!Array.isArray(comment.bullets) || comment.bullets.length !== 2) return false;
  const normalizedBullets = comment.bullets.map((bullet) => sanitizeBullet(String(bullet ?? "")));
  if (normalizedBullets.some((bullet) => !isUsableCoachField(bullet, 120))) return false;
  if (comment.caution && !isUsableCoachField(normalizeCoachText(comment.caution), 160)) return false;
  return true;
}

export async function generateCoachComment(summary: ActivitySummary, detail: StoredActivityDetail, history: ActivitySummary[]): Promise<CoachComment> {
  const apiKey = envValue("ANTHROPIC_API_KEY");
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured.");
  }
  const model = "claude-opus-4-6";
  const input = buildCoachInput(summary, detail, history);
  const input_hash = hashInput(input);
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: "You are Alpaca Coach. Return strict JSON only — no markdown fences, no explanation, just the JSON object. Be restrained, observant, and useful. Never diagnose. Never invent body or HR data when it is missing. Use imperial units only: miles, minutes per mile, miles per hour, and feet. Never mention kilometers, meters, kph, or minutes per kilometer. Keep summary under 80 words. Each bullet must be a standalone sentence under 90 characters. Never mention prompts, schemas, developers, JSON, or your own instructions. JSON schema: {\"headline\": string, \"summary\": string, \"bullets\": [string, string], \"caution\": string | null}",
      messages: [
        {
          role: "user",
          content: JSON.stringify(input),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic comment request failed: ${await response.text()}`);
  }

  const data = await response.json() as { content?: Array<{ type?: string; text?: string }> };
  const rawText = data.content?.find((block) => block.type === "text")?.text ?? "";
  const parsed = parseCoachPayload(rawText);
  return {
    headline: parsed.headline,
    summary: parsed.summary,
    bullets: parsed.bullets,
    caution: parsed.caution ?? null,
    generated_at: new Date().toISOString(),
    model,
    prompt_version: COACH_PROMPT_VERSION,
    input_hash,
  };
}
