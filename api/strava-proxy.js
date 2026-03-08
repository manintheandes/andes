export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-strava-client-id, x-strava-client-secret, x-strava-refresh-token");
  if (req.method === "OPTIONS") return res.status(200).end();

  const clientId = req.headers["x-strava-client-id"];
  const clientSecret = req.headers["x-strava-client-secret"];
  const refreshToken = req.headers["x-strava-refresh-token"];

  if (!clientId || !clientSecret || !refreshToken) {
    return res.status(401).json({ error: "Strava credentials required" });
  }

  const { start, end } = req.query;
  if (!start || !end) return res.status(400).json({ error: "start and end dates required" });

  try {
    const tokenResp = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!tokenResp.ok) {
      const err = await tokenResp.text();
      return res.status(401).json({ error: "Token refresh failed", detail: err });
    }

    const tokenData = await tokenResp.json();
    const accessToken = tokenData.access_token;

    const after = Math.floor(new Date(start).getTime() / 1000);
    const before = Math.floor(new Date(end + "T23:59:59").getTime() / 1000);

    const activitiesResp = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?after=${after}&before=${before}&per_page=200`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!activitiesResp.ok) {
      return res.status(activitiesResp.status).json({ error: "Failed to fetch activities" });
    }

    const activities = await activitiesResp.json();
    const mapped = activities.map((a) => ({
      id: String(a.id),
      source: "strava",
      name: a.name,
      type: a.type,
      sport_type: a.sport_type,
      start_date_local: a.start_date_local,
      moving_time: a.moving_time,
      elapsed_time: a.elapsed_time,
      distance: a.distance,
      total_elevation_gain: a.total_elevation_gain,
      average_speed: a.average_speed,
      max_speed: a.max_speed,
      average_heartrate: a.average_heartrate,
      max_heartrate: a.max_heartrate,
      average_cadence: a.average_cadence,
      calories: a.calories || a.kilojoules,
      summary_polyline: a.map?.summary_polyline || null,
      start_latlng: a.start_latlng,
    }));

    return res.status(200).json({ activities: mapped, newRefreshToken: tokenData.refresh_token });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
