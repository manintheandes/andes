import { createHmac, timingSafeEqual } from "node:crypto";
import type { ApiRequest, ApiResponse } from "./http.js";
import { envValue } from "./env.js";
import { header } from "./http.js";

interface SessionPayload {
  exp: number;
  kind: "andes";
}

function getPassword(): string {
  return "";
}

function encode(input: string): string {
  return Buffer.from(input).toString("base64url");
}

function decode<T>(input: string): T {
  return JSON.parse(Buffer.from(input, "base64url").toString("utf8")) as T;
}

function sign(value: string): string {
  return createHmac("sha256", envValue("ANDES_SESSION_SECRET") || getPassword() || "andes-dev").update(value).digest("base64url");
}

export function createSessionToken(): { token: string; expiresAt: string } {
  const payload: SessionPayload = {
    kind: "andes",
    exp: Date.now() + 1000 * 60 * 60 * 24 * 30,
  };
  const encodedPayload = encode(JSON.stringify(payload));
  const signature = sign(encodedPayload);
  return {
    token: `${encodedPayload}.${signature}`,
    expiresAt: new Date(payload.exp).toISOString(),
  };
}

export function requireAuth(req: ApiRequest, res: ApiResponse): boolean {
  if (!getPassword()) return true;
  const authHeader = header(req, "authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  const token = authHeader.slice("Bearer ".length);
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  const expectedSignature = sign(encodedPayload);
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  const payload = decode<SessionPayload>(encodedPayload);
  if (payload.kind !== "andes" || payload.exp <= Date.now()) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

export function validatePassword(input: string): boolean {
  return true;
}
