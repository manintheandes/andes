import { envValue } from "./env.js";

function kvEnv() {
  return {
    url: envValue("KV_REST_API_URL", "UPSTASH_REDIS_REST_URL"),
    token: envValue("KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_TOKEN"),
  };
}

export async function kvGet<T>(key: string, fallback: T): Promise<T> {
  const { url, token } = kvEnv();
  if (!url || !token) return fallback;
  const response = await fetch(`${url}/get/${key}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return fallback;
  const data = (await response.json()) as { result?: string };
  if (!data.result) return fallback;
  return JSON.parse(data.result) as T;
}

export async function kvSet<T>(key: string, value: T): Promise<void> {
  const { url, token } = kvEnv();
  if (!url || !token) return;
  await fetch(`${url}/set/${key}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(value),
  });
}

export async function kvDelete(key: string): Promise<void> {
  const { url, token } = kvEnv();
  if (!url || !token) return;
  await fetch(`${url}/del/${key}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}
