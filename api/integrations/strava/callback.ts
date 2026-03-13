import { allowCors, type ApiRequest, type ApiResponse } from "../../_lib/http.js";
import { envValue } from "../../_lib/env.js";

/**
 * Strava OAuth callback handler.
 *
 * Strava redirects here with ?code=...&scope=... after the user authorizes.
 * We exchange the code for tokens and redirect back to the app with the
 * refresh token embedded in a fragment so the frontend can persist it.
 */
export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (allowCors(req, res)) return;

  const code = Array.isArray(req.query.code) ? req.query.code[0] : req.query.code;
  const error = Array.isArray(req.query.error) ? req.query.error[0] : req.query.error;

  if (error || !code) {
    res.status(302).setHeader(
      "Location",
      `/?strava_error=${encodeURIComponent(error || "missing_code")}`,
    );
    res.end();
    return;
  }

  const clientId = envValue("STRAVA_CLIENT_ID");
  const clientSecret = envValue("STRAVA_CLIENT_SECRET");

  if (!clientId || !clientSecret) {
    res.status(500).json({ error: "Strava client credentials not configured on server." });
    return;
  }

  try {
    const tokenResponse = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      const detail = await tokenResponse.text();
      res.status(302).setHeader(
        "Location",
        `/?strava_error=${encodeURIComponent(`Token exchange failed: ${detail}`)}`,
      );
      res.end();
      return;
    }

    const data = (await tokenResponse.json()) as {
      access_token: string;
      refresh_token: string;
      athlete?: { id: number; firstname?: string; lastname?: string };
    };

    // Redirect to the app with tokens in the URL fragment (never logged by servers).
    const fragment = `strava_connected=1&strava_refresh_token=${encodeURIComponent(data.refresh_token)}&strava_athlete=${encodeURIComponent(data.athlete?.firstname || "")}`;
    res.status(302).setHeader("Location", `/#${fragment}`);
    res.end();
  } catch (err) {
    res.status(302).setHeader(
      "Location",
      `/?strava_error=${encodeURIComponent(err instanceof Error ? err.message : "Unknown error")}`,
    );
    res.end();
  }
}
