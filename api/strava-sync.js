export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-strava-client-id, x-strava-client-secret, x-strava-refresh-token");
  if (req.method === "OPTIONS") return res.status(200).end();

  const clientId = req.headers["x-strava-client-id"];
  const clientSecret = req.headers["x-strava-client-secret"];
  const refreshToken = req.headers["x-strava-refresh-token"];

  if (!clientId || !clientSecret || !refreshToken) {
    return res.status(401).json({ error: "Strava credentials required" });
  }

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

    if (!tokenResp.ok) return res.status(401).json({ error: "Token refresh failed" });
    const tokenData = await tokenResp.json();
    const accessToken = tokenData.access_token;

    let allActivities = [];
    let page = 1;
    const perPage = 200;

    while (true) {
      const resp = await fetch(
        `https://www.strava.com/api/v3/athlete/activities?page=${page}&per_page=${perPage}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!resp.ok) break;
      const batch = await resp.json();
      if (!batch.length) break;

      allActivities = allActivities.concat(batch);
      page++;
      if (page > 50) break;
    }

    const mapped = {};
    for (const a of allActivities) {
      mapped[String(a.id)] = {
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
      };
    }

    return res.status(200).json({
      count: Object.keys(mapped).length,
      activities: mapped,
      newRefreshToken: tokenData.refresh_token,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
