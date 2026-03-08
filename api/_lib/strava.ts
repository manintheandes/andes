import type { ActivitySummary } from "../../src/types";

function mapType(input: string): ActivitySummary["type"] {
  if (input === "Ride") return "Ride";
  if (input === "Walk") return "Walk";
  if (input === "Hike") return "Hike";
  if (input === "Yoga") return "Yoga";
  return "Run";
}

export async function importStravaActivities(clientId: string, clientSecret: string, refreshToken: string): Promise<Record<string, ActivitySummary>> {
  const tokenResponse = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!tokenResponse.ok) {
    throw new Error("Unable to refresh Strava token.");
  }
  const tokenData = (await tokenResponse.json()) as { access_token: string };
  const mapped: Record<string, ActivitySummary> = {};
  let page = 1;
  while (true) {
    const response = await fetch(`https://www.strava.com/api/v3/athlete/activities?page=${page}&per_page=200`, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (!response.ok) break;
    const batch = (await response.json()) as Array<Record<string, unknown>>;
    if (!batch.length) break;
    batch.forEach((activity) => {
      const id = String(activity.id);
      const type = mapType(String(activity.type || activity.sport_type || "Run"));
      mapped[id] = {
        id,
        source: "strava",
        name: String(activity.name || "Strava Activity"),
        type,
        sport_type: type,
        start_date_local: String(activity.start_date_local),
        moving_time: Number(activity.moving_time || 0),
        elapsed_time: Number(activity.elapsed_time || activity.moving_time || 0),
        distance: Number(activity.distance || 0),
        total_elevation_gain: Number(activity.total_elevation_gain || 0),
        average_speed: Number(activity.average_speed || 0),
        max_speed: Number(activity.max_speed || 0),
        average_heartrate: activity.average_heartrate ? Number(activity.average_heartrate) : null,
        max_heartrate: activity.max_heartrate ? Number(activity.max_heartrate) : null,
        average_cadence: activity.average_cadence ? Number(activity.average_cadence) : null,
        calories: activity.calories ? Number(activity.calories) : activity.kilojoules ? Number(activity.kilojoules) : null,
        summary_polyline: (activity.map as { summary_polyline?: string } | undefined)?.summary_polyline ?? null,
        start_latlng: Array.isArray(activity.start_latlng) && activity.start_latlng.length === 2 ? [Number(activity.start_latlng[0]), Number(activity.start_latlng[1])] : null,
        save_status: "synced",
        comment_status: "idle",
        comment_prompt_version: null,
        comment_headline: null,
        comment_preview: null,
        sensor_flags: {
          gps: Boolean((activity.map as { summary_polyline?: string } | undefined)?.summary_polyline),
          hr: Boolean(activity.average_heartrate),
          body: false,
          healthkit: false,
        },
        body_snapshot_status: "missing_data",
        healthkit_export_status: "unsupported",
      };
    });
    page += 1;
    if (page > 25) break;
  }
  return mapped;
}
