import { allowCors, type ApiRequest, type ApiResponse } from "../../_lib/http.js";
import { envValue } from "../../_lib/env.js";

/**
 * Initiates Strava OAuth flow by redirecting to Strava's authorization page.
 */
export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (allowCors(req, res)) return;

  const clientId = envValue("STRAVA_CLIENT_ID");
  if (!clientId) {
    res.status(500).json({ error: "STRAVA_CLIENT_ID not configured." });
    return;
  }

  // Build callback URL. On Vercel this uses the deployment URL; locally use localhost.
  const host = Array.isArray(req.headers.host) ? req.headers.host[0] : req.headers.host;
  const protocol = host?.includes("localhost") ? "http" : "https";
  const redirectUri = `${protocol}://${host}/api/integrations/strava/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    approval_prompt: "auto",
    scope: "read,activity:read_all",
  });

  res.status(302).setHeader("Location", `https://www.strava.com/oauth/authorize?${params.toString()}`);
  res.end();
}
