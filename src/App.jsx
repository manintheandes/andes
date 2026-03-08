import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import mapboxgl from "mapbox-gl";

// ─── Constants ───────────────────────────────────────────────────────────────

const MILE = 1609.34;
const ACTIVITY_TYPES = ["Run", "Ride", "Walk", "Yoga", "Hike"];

const STATS_CONFIG = {
  Run: { row1: ["time", "distance", "pace"], row2: ["elevation", "cadence", "calories"] },
  "Trail Run": { row1: ["time", "distance", "pace"], row2: ["elevation", "cadence", "calories"] },
  Ride: { row1: ["time", "distance", "speed"], row2: ["elevation", "avgSpeed", "calories"] },
  Walk: { row1: ["time", "distance", "pace"], row2: ["elevation", "calories"] },
  Hike: { row1: ["time", "distance", "pace"], row2: ["elevation", "calories"] },
  Yoga: { row1: ["time"], row2: ["calories"] },
};

const API_BASE = "";

// ─── Utilities ───────────────────────────────────────────────────────────────

function uuid() {
  return crypto.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatPace(metersPerSecond) {
  if (!metersPerSecond || metersPerSecond <= 0) return "--";
  const secPerMile = MILE / metersPerSecond;
  const m = Math.floor(secPerMile / 60);
  const s = Math.floor(secPerMile % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatSpeed(metersPerSecond) {
  if (!metersPerSecond || metersPerSecond <= 0) return "--";
  return (metersPerSecond * 2.23694).toFixed(1);
}

function formatDistance(meters) {
  if (!meters) return "0";
  return (meters / MILE).toFixed(2);
}

function formatElevation(meters) {
  if (!meters) return "0";
  return Math.round(meters * 3.28084).toLocaleString();
}

function formatTime(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function formatDateShort(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatDateFull(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function dateKey(d) {
  const dt = d instanceof Date ? d : new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function today() {
  return dateKey(new Date());
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return dateKey(d);
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Google polyline encoding
function encodePolyline(coords) {
  let result = "";
  let prevLat = 0;
  let prevLng = 0;
  for (const [lat, lng] of coords) {
    const dLat = Math.round(lat * 1e5) - prevLat;
    const dLng = Math.round(lng * 1e5) - prevLng;
    prevLat += dLat;
    prevLng += dLng;
    for (let v of [dLat, dLng]) {
      v = v < 0 ? ~(v << 1) : v << 1;
      while (v >= 0x20) {
        result += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
        v >>= 5;
      }
      result += String.fromCharCode(v + 63);
    }
  }
  return result;
}

function decodePolyline(str) {
  const coords = [];
  let i = 0;
  let lat = 0;
  let lng = 0;
  while (i < str.length) {
    for (const target of ["lat", "lng"]) {
      let shift = 0;
      let result = 0;
      let byte;
      do {
        byte = str.charCodeAt(i++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (target === "lat") lat += delta;
      else lng += delta;
    }
    coords.push([lat / 1e5, lng / 1e5]);
  }
  return coords;
}

// ─── KV Helpers ──────────────────────────────────────────────────────────────

async function kvGet(key) {
  const resp = await fetch(`${API_BASE}/api/get-data?key=${key}`);
  const data = await resp.json();
  return data.value;
}

async function kvSet(key, value) {
  await fetch(`${API_BASE}/api/update-data`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value }),
  });
}

// ─── Oura Helper ─────────────────────────────────────────────────────────────

async function fetchOura(token, start, end) {
  const resp = await fetch(`${API_BASE}/api/oura-proxy?start=${start}&end=${end}`, {
    headers: { "x-oura-token": token },
  });
  return resp.json();
}

// ─── Sub Components ──────────────────────────────────────────────────────────

function Sparkline({ data, width = 200, height = 40, color = "#5ae6de" }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StatBox({ value, label, large }) {
  return (
    <div className="text-center">
      <div className={`font-semibold tabular-nums ${large ? "text-3xl" : "text-xl"}`} style={{ color: "#e8e8e8" }}>
        {value}
      </div>
      <div className="text-xs mt-0.5" style={{ color: "#666" }}>
        {label}
      </div>
    </div>
  );
}

function StaticMap({ polyline, token, width = 400, height = 200 }) {
  if (!polyline || !token) return <div className="rounded-lg" style={{ background: "#1a1a1a", height }} />;
  const encoded = encodeURIComponent(polyline);
  const src = `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/path-2+5ae6de-0.8(${encoded})/auto/${width}x${height}@2x?access_token=${token}&padding=30&logo=false&attribution=false`;
  return <img src={src} alt="" className="w-full rounded-lg" style={{ height }} loading="lazy" />;
}

function ActivityCard({ activity, token, onClick }) {
  const hasGPS = !!activity.summary_polyline && (activity.distance || 0) > 160;
  const hasHR = !!activity.average_heartrate;
  const isRide = activity.type === "Ride" || activity.sport_type === "Ride";
  const isYoga = activity.type === "Yoga" || activity.sport_type === "Yoga";

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl p-3 mb-3 border transition-colors"
      style={{ background: "#1a1a1a", borderColor: "#2a2a2a" }}
    >
      <div className="flex justify-between items-center mb-2">
        <span className="font-medium" style={{ color: "#e8e8e8" }}>
          {activity.name}
        </span>
        <span className="text-xs" style={{ color: "#666" }}>
          {formatTime(activity.start_date_local)}
        </span>
      </div>
      {hasGPS && <StaticMap polyline={activity.summary_polyline} token={token} height={140} />}
      <div className="flex gap-4 mt-2 text-sm tabular-nums" style={{ color: "#e8e8e8" }}>
        {!isYoga && activity.distance > 0 && <span>{formatDistance(activity.distance)} mi</span>}
        <span>{formatDuration(activity.moving_time)}</span>
        {!isYoga && activity.distance > 0 && (
          <span>
            {isRide
              ? `${formatSpeed(activity.average_speed)} mph`
              : `${formatPace(activity.average_speed)}/mi`}
          </span>
        )}
        {hasHR && (
          <span style={{ color: "#5ae6de" }}>{Math.round(activity.average_heartrate)} bpm</span>
        )}
      </div>
    </button>
  );
}

function BodyState({ daily }) {
  if (!daily) return null;
  const { sleep_score, readiness_score, hrv, rhr, contributors } = daily;
  if (!sleep_score && !readiness_score) return null;

  const bars = [
    { label: "RHR", value: rhr, unit: "bpm", pct: rhr ? Math.min(100, (rhr / 80) * 100) : 0 },
    {
      label: "HRV bal.",
      value: contributors?.hrv_balance ? ["Low", "Fair", "Good", "Optimal"][Math.min(3, Math.floor(contributors.hrv_balance / 25))] : null,
      pct: contributors?.hrv_balance || 0,
    },
    {
      label: "Recovery",
      value: contributors?.recovery_index ? ["Low", "Fair", "Good", "Optimal"][Math.min(3, Math.floor(contributors.recovery_index / 25))] : null,
      pct: contributors?.recovery_index || 0,
    },
    {
      label: "Sleep bal.",
      value: contributors?.total_sleep ? ["Attn", "Fair", "Good", "Optimal"][Math.min(3, Math.floor(contributors.total_sleep / 25))] : null,
      pct: contributors?.total_sleep || 0,
    },
  ];

  return (
    <div className="mt-6">
      <div className="text-xs font-medium tracking-widest mb-3" style={{ color: "#666" }}>
        BODY
      </div>
      <div className="flex gap-6 mb-4">
        {sleep_score && (
          <div>
            <span className="text-sm" style={{ color: "#666" }}>Sleep </span>
            <span className="font-semibold tabular-nums" style={{ color: "#e8e8e8" }}>{sleep_score}</span>
          </div>
        )}
        {readiness_score && (
          <div>
            <span className="text-sm" style={{ color: "#666" }}>Readiness </span>
            <span className="font-semibold tabular-nums" style={{ color: "#e8e8e8" }}>{readiness_score}</span>
          </div>
        )}
        {hrv && (
          <div>
            <span className="text-sm" style={{ color: "#666" }}>HRV </span>
            <span className="font-semibold tabular-nums" style={{ color: "#e8e8e8" }}>{hrv}</span>
          </div>
        )}
      </div>
      <div className="space-y-2">
        {bars.map(
          (b) =>
            b.value && (
              <div key={b.label} className="flex items-center gap-3">
                <span className="text-xs w-16 shrink-0" style={{ color: "#666" }}>
                  {b.label}
                </span>
                <span className="text-sm w-16 shrink-0 tabular-nums" style={{ color: "#e8e8e8" }}>
                  {b.value} {b.unit || ""}
                </span>
                <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "#2a2a2a" }}>
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.min(100, b.pct)}%`, background: "#5ae6de" }}
                  />
                </div>
              </div>
            )
        )}
      </div>
    </div>
  );
}

function WeekChart({ activities }) {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = daysAgo(i);
    const dayActivities = Object.values(activities).filter(
      (a) => dateKey(a.start_date_local) === d
    );
    const minutes = dayActivities.reduce((sum, a) => sum + (a.moving_time || 0) / 60, 0);
    days.push({ date: d, minutes, label: new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "narrow" }) });
  }

  const maxMin = Math.max(...days.map((d) => d.minutes), 30);
  const totalMin = days.reduce((s, d) => s + d.minutes, 0);
  const totalH = Math.floor(totalMin / 60);
  const totalM = Math.round(totalMin % 60);

  const typeCounts = {};
  const weekActivities = Object.values(activities).filter(
    (a) => dateKey(a.start_date_local) >= daysAgo(6)
  );
  weekActivities.forEach((a) => {
    const t = a.type || "Other";
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  });

  // Streak: consecutive days with at least one activity
  let streak = 0;
  for (let i = 0; ; i++) {
    const d = daysAgo(i);
    const has = Object.values(activities).some((a) => dateKey(a.start_date_local) === d);
    if (has) streak++;
    else break;
  }

  return (
    <div className="mt-6">
      <div className="text-xs font-medium tracking-widest mb-3" style={{ color: "#666" }}>
        THIS WEEK
      </div>
      <div className="flex items-end gap-1.5 h-16 mb-2">
        {days.map((d) => (
          <div key={d.date} className="flex-1 flex flex-col items-center">
            <div
              className="w-full rounded-sm"
              style={{
                height: `${Math.max(2, (d.minutes / maxMin) * 56)}px`,
                background: d.minutes > 0 ? "#5ae6de" : "#2a2a2a",
              }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-1.5 mb-3">
        {days.map((d) => (
          <div key={d.date} className="flex-1 text-center text-xs" style={{ color: "#666" }}>
            {d.label}
          </div>
        ))}
      </div>
      <div className="text-sm" style={{ color: "#666" }}>
        {totalH}h {totalM}m
        {Object.entries(typeCounts).map(([type, count]) => (
          <span key={type}>
            {" "} · {count} {type.toLowerCase()}{count > 1 ? "s" : ""}
          </span>
        ))}
      </div>
      {streak > 1 && (
        <div className="text-sm mt-1" style={{ color: "#5ae6de" }}>
          {streak} consecutive days active
        </div>
      )}
    </div>
  );
}

// ─── Detail Overlay ──────────────────────────────────────────────────────────

function DetailOverlay({ activity, detail, daily, token, onClose }) {
  if (!activity) return null;

  const isRide = activity.type === "Ride" || activity.sport_type === "Ride";
  const isYoga = activity.type === "Yoga" || activity.sport_type === "Yoga";
  const hasGPS = !!activity.summary_polyline;
  const hasHR = !!activity.average_heartrate;
  const splits = detail?.splits || [];
  const hrStream = detail?.points?.map((p) => p.hr).filter(Boolean) || [];
  const paceStream = detail?.points
    ? detail.points.reduce((acc, p, i) => {
        if (i === 0) return acc;
        const prev = detail.points[i - 1];
        const dist = haversine(prev.lat, prev.lng, p.lat, p.lng);
        const dt = (p.time - prev.time) / 1000;
        if (dt > 0 && dist > 0) acc.push(dist / dt);
        return acc;
      }, [])
    : [];

  const locationName = activity.start_latlng ? "" : "";

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      style={{ background: "#0a0a0a" }}
    >
      <div className="max-w-lg mx-auto px-4 pb-8" style={{ paddingTop: "env(safe-area-inset-top, 16px)" }}>
        <div className="flex justify-end py-3">
          <button onClick={onClose} className="text-2xl leading-none px-2" style={{ color: "#666" }}>
            x
          </button>
        </div>

        <h2 className="text-xl font-semibold mb-1" style={{ color: "#e8e8e8" }}>
          {activity.name}
        </h2>
        <div className="text-sm mb-4" style={{ color: "#666" }}>
          {formatDateFull(activity.start_date_local)} · {formatTime(activity.start_date_local)}
        </div>

        {hasGPS && (
          <div className="mb-6">
            <StaticMap polyline={activity.summary_polyline} token={token} height={200} />
          </div>
        )}

        <div className={`grid gap-4 mb-6 ${isYoga ? "grid-cols-1" : "grid-cols-2"}`}>
          {!isYoga && activity.distance > 0 && (
            <>
              <div>
                <div className="text-xs mb-1" style={{ color: "#666" }}>Distance</div>
                <div className="text-lg font-semibold tabular-nums">{formatDistance(activity.distance)} mi</div>
              </div>
              <div>
                <div className="text-xs mb-1" style={{ color: "#666" }}>{isRide ? "Avg Speed" : "Avg Pace"}</div>
                <div className="text-lg font-semibold tabular-nums">
                  {isRide ? `${formatSpeed(activity.average_speed)} mph` : `${formatPace(activity.average_speed)} /mi`}
                </div>
              </div>
            </>
          )}
          <div>
            <div className="text-xs mb-1" style={{ color: "#666" }}>Moving Time</div>
            <div className="text-lg font-semibold tabular-nums">{formatDuration(activity.moving_time)}</div>
          </div>
          {!isYoga && activity.total_elevation_gain > 0 && (
            <div>
              <div className="text-xs mb-1" style={{ color: "#666" }}>Elevation</div>
              <div className="text-lg font-semibold tabular-nums">{formatElevation(activity.total_elevation_gain)} ft</div>
            </div>
          )}
          {hasHR && (
            <>
              <div>
                <div className="text-xs mb-1" style={{ color: "#666" }}>Avg HR</div>
                <div className="text-lg font-semibold tabular-nums" style={{ color: "#5ae6de" }}>
                  {Math.round(activity.average_heartrate)} bpm
                </div>
              </div>
              <div>
                <div className="text-xs mb-1" style={{ color: "#666" }}>Max HR</div>
                <div className="text-lg font-semibold tabular-nums" style={{ color: "#5ae6de" }}>
                  {Math.round(activity.max_heartrate)} bpm
                </div>
              </div>
            </>
          )}
          {activity.calories > 0 && (
            <div>
              <div className="text-xs mb-1" style={{ color: "#666" }}>Calories</div>
              <div className="text-lg font-semibold tabular-nums">{Math.round(activity.calories)}</div>
            </div>
          )}
        </div>

        {splits.length > 0 && (
          <div className="mb-6">
            <div className="text-xs font-medium tracking-widest mb-3" style={{ color: "#666" }}>
              SPLITS
            </div>
            <div className="space-y-1">
              {splits.map((s, i) => (
                <div key={i} className="flex items-center gap-4 text-sm tabular-nums py-1">
                  <span className="w-6 text-right" style={{ color: "#666" }}>{i + 1}</span>
                  <span style={{ color: "#e8e8e8" }}>
                    {isRide ? `${formatSpeed(s.distance / s.time)} mph` : formatPace(s.distance / s.time)}
                  </span>
                  {s.avgHR && <span style={{ color: "#5ae6de" }}>{Math.round(s.avgHR)} bpm</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {hrStream.length > 10 && (
          <div className="mb-6">
            <div className="text-xs font-medium tracking-widest mb-3" style={{ color: "#666" }}>
              HR
            </div>
            <Sparkline data={hrStream} width={360} height={50} color="#5ae6de" />
          </div>
        )}

        {paceStream.length > 10 && (
          <div className="mb-6">
            <div className="text-xs font-medium tracking-widest mb-3" style={{ color: "#666" }}>
              PACE
            </div>
            <Sparkline data={paceStream} width={360} height={50} color="#5ae6de" />
          </div>
        )}

        {daily && (daily.sleep_score || daily.readiness_score) && (
          <div className="mb-6">
            <div className="text-xs font-medium tracking-widest mb-3" style={{ color: "#666" }}>
              BODY THAT DAY
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              {daily.sleep_score && (
                <span>
                  <span style={{ color: "#666" }}>Sleep </span>
                  <span className="tabular-nums" style={{ color: "#e8e8e8" }}>{daily.sleep_score}</span>
                </span>
              )}
              {daily.readiness_score && (
                <span>
                  <span style={{ color: "#666" }}>Readiness </span>
                  <span className="tabular-nums" style={{ color: "#e8e8e8" }}>{daily.readiness_score}</span>
                </span>
              )}
              {daily.hrv && (
                <span>
                  <span style={{ color: "#666" }}>HRV </span>
                  <span className="tabular-nums" style={{ color: "#e8e8e8" }}>{daily.hrv}</span>
                </span>
              )}
              {daily.rhr && (
                <span>
                  <span style={{ color: "#666" }}>RHR </span>
                  <span className="tabular-nums" style={{ color: "#e8e8e8" }}>{daily.rhr} bpm</span>
                </span>
              )}
              {daily.total_sleep && (
                <span>
                  <span style={{ color: "#666" }}>Total </span>
                  <span className="tabular-nums" style={{ color: "#e8e8e8" }}>
                    {formatDuration(daily.total_sleep)}
                  </span>
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Recording View ──────────────────────────────────────────────────────────

function RecordingView({ rec, onPause, onResume, onStop, mapContainerRef }) {
  const isRide = rec.type === "Ride";
  const isYoga = rec.type === "Yoga";
  const elapsed = rec.isPaused
    ? rec.pausedAt - rec.startTime - rec.pausedTime
    : (Date.now() - rec.startTime - rec.pausedTime) / 1000;
  const avgSpeed = elapsed > 0 ? rec.distance / elapsed : 0;

  const config = STATS_CONFIG[rec.type] || STATS_CONFIG.Run;

  function statValue(key) {
    switch (key) {
      case "time": return formatDuration(elapsed);
      case "distance": return formatDistance(rec.distance);
      case "pace": return formatPace(avgSpeed);
      case "speed": return formatSpeed(avgSpeed);
      case "avgSpeed": return formatSpeed(avgSpeed);
      case "elevation": return formatElevation(rec.elevGain);
      case "cadence": return rec.cadence || "--";
      case "calories": return rec.calories || "--";
      default: return "--";
    }
  }

  function statLabel(key) {
    switch (key) {
      case "time": return "time";
      case "distance": return "mi";
      case "pace": return "/mi";
      case "speed": return "mph";
      case "avgSpeed": return "avg mph";
      case "elevation": return "elev";
      case "cadence": return "cadence";
      case "calories": return "cal";
      default: return key;
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "#0a0a0a" }}>
      {!isYoga && (
        <div ref={mapContainerRef} className="flex-1 min-h-0" style={{ minHeight: "40vh" }} />
      )}
      {isYoga && <div className="flex-1" />}

      <div className="px-4 pb-6" style={{ paddingBottom: "max(env(safe-area-inset-bottom, 24px), 24px)" }}>
        <div className="flex justify-between items-center mb-4">
          <span className="font-medium" style={{ color: "#e8e8e8" }}>
            {rec.type === "Run" && rec.elevGain > 50 ? "Trail Run" : rec.type}
          </span>
          {rec.currentHR && (
            <span className="text-lg font-semibold tabular-nums" style={{ color: "#5ae6de" }}>
              {rec.currentHR}
            </span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-4 mb-4">
          {config.row1.map((key) => (
            <StatBox key={key} value={statValue(key)} label={statLabel(key)} large />
          ))}
        </div>
        {config.row2.length > 0 && (
          <div className={`grid gap-4 mb-6 ${config.row2.length === 3 ? "grid-cols-3" : config.row2.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
            {config.row2.map((key) => (
              <StatBox key={key} value={statValue(key)} label={statLabel(key)} />
            ))}
          </div>
        )}

        {rec.isPaused ? (
          <div className="flex gap-3">
            <button
              onClick={onResume}
              className="flex-1 py-4 rounded-xl text-lg font-semibold"
              style={{ background: "#5ae6de", color: "#0a0a0a" }}
            >
              Resume
            </button>
            <button
              onClick={onStop}
              className="flex-1 py-4 rounded-xl text-lg font-semibold border"
              style={{ borderColor: "#2a2a2a", color: "#e8e8e8" }}
            >
              Stop
            </button>
          </div>
        ) : (
          <button
            onClick={onPause}
            className="w-full py-4 rounded-xl text-lg font-semibold"
            style={{ background: "#5ae6de", color: "#0a0a0a" }}
          >
            Pause
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Settings View ───────────────────────────────────────────────────────────

function SettingsView({ settings, onSave, onImportStrava }) {
  const [mapboxToken, setMapboxToken] = useState(settings?.mapboxToken || "");
  const [ouraToken, setOuraToken] = useState(settings?.ouraToken || "");
  const [stravaClientId, setStravaClientId] = useState(settings?.stravaClientId || "");
  const [stravaClientSecret, setStravaClientSecret] = useState(settings?.stravaClientSecret || "");
  const [stravaRefreshToken, setStravaRefreshToken] = useState(settings?.stravaRefreshToken || "");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  const handleSave = () => {
    onSave({ mapboxToken, ouraToken, stravaClientId, stravaClientSecret, stravaRefreshToken });
  };

  const handleImport = async () => {
    setImporting(true);
    setImportResult(null);
    try {
      const result = await onImportStrava({ stravaClientId, stravaClientSecret, stravaRefreshToken });
      setImportResult(`Imported ${result.count} activities`);
    } catch (err) {
      setImportResult(`Error: ${err.message}`);
    }
    setImporting(false);
  };

  const inputClass = "w-full px-3 py-2 rounded-lg text-sm border focus:outline-none focus:border-[#5ae6de]";
  const inputStyle = { background: "#1a1a1a", borderColor: "#2a2a2a", color: "#e8e8e8" };

  return (
    <div className="space-y-6">
      <div>
        <label className="text-xs font-medium tracking-widest block mb-2" style={{ color: "#666" }}>
          MAPBOX TOKEN
        </label>
        <input
          type="text"
          value={mapboxToken}
          onChange={(e) => setMapboxToken(e.target.value)}
          placeholder="pk.eyJ1..."
          className={inputClass}
          style={inputStyle}
        />
      </div>

      <div>
        <label className="text-xs font-medium tracking-widest block mb-2" style={{ color: "#666" }}>
          OURA TOKEN
        </label>
        <input
          type="text"
          value={ouraToken}
          onChange={(e) => setOuraToken(e.target.value)}
          placeholder="Personal access token"
          className={inputClass}
          style={inputStyle}
        />
      </div>

      <div className="pt-2 border-t" style={{ borderColor: "#2a2a2a" }}>
        <div className="text-xs font-medium tracking-widest mb-2" style={{ color: "#666" }}>
          STRAVA IMPORT
        </div>
        <div className="space-y-2">
          <input
            type="text"
            value={stravaClientId}
            onChange={(e) => setStravaClientId(e.target.value)}
            placeholder="Client ID"
            className={inputClass}
            style={inputStyle}
          />
          <input
            type="password"
            value={stravaClientSecret}
            onChange={(e) => setStravaClientSecret(e.target.value)}
            placeholder="Client Secret"
            className={inputClass}
            style={inputStyle}
          />
          <input
            type="text"
            value={stravaRefreshToken}
            onChange={(e) => setStravaRefreshToken(e.target.value)}
            placeholder="Refresh Token"
            className={inputClass}
            style={inputStyle}
          />
          <button
            onClick={handleImport}
            disabled={importing || !stravaClientId || !stravaClientSecret || !stravaRefreshToken}
            className="w-full py-2 rounded-lg text-sm font-medium disabled:opacity-40"
            style={{ background: "#2a2a2a", color: "#e8e8e8" }}
          >
            {importing ? "Importing..." : "Import All Activities"}
          </button>
          {importResult && (
            <div className="text-sm" style={{ color: importResult.startsWith("Error") ? "#ff6b6b" : "#5ae6de" }}>
              {importResult}
            </div>
          )}
        </div>
      </div>

      <button
        onClick={handleSave}
        className="w-full py-3 rounded-xl text-sm font-semibold"
        style={{ background: "#5ae6de", color: "#0a0a0a" }}
      >
        Save Settings
      </button>
    </div>
  );
}

// ─── Type Selection ──────────────────────────────────────────────────────────

function TypeSelect({ onSelect, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "#0a0a0aee" }}>
      <div className="text-center">
        <div className="text-lg font-medium mb-6" style={{ color: "#e8e8e8" }}>
          What are you doing?
        </div>
        <div className="flex flex-wrap justify-center gap-3 mb-6">
          {ACTIVITY_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => onSelect(type)}
              className="px-6 py-3 rounded-xl text-sm font-medium border transition-colors"
              style={{ borderColor: "#2a2a2a", color: "#e8e8e8", background: "#1a1a1a" }}
            >
              {type}
            </button>
          ))}
        </div>
        <button onClick={onCancel} className="text-sm" style={{ color: "#666" }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Main App ────────────────────────────────────────────────────────────────

export default function App() {
  const [view, setView] = useState("today");
  const [settings, setSettings] = useState(null);
  const [activities, setActivities] = useState({});
  const [daily, setDaily] = useState({});
  const [detailId, setDetailId] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [recording, setRecording] = useState(null);
  const [typeSelect, setTypeSelect] = useState(false);
  const [historyFilter, setHistoryFilter] = useState("All");
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const watchIdRef = useRef(null);
  const markerRef = useRef(null);
  const routeRef = useRef([]);

  // Tick for recording timer
  useEffect(() => {
    if (!recording || recording.isPaused) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [recording?.isPaused, !!recording]);

  // Load settings + data on mount
  useEffect(() => {
    (async () => {
      try {
        const s = await kvGet("an_settings");
        if (s) setSettings(s);

        const acts = await kvGet("an_activities");
        if (acts) setActivities(acts);

        // Load today's body data
        if (s?.ouraToken) {
          const d = today();
          const oura = await fetchOura(s.ouraToken, d, d);
          if (oura.daily_sleep?.length || oura.daily_readiness?.length) {
            const sleep = oura.daily_sleep[0];
            const readiness = oura.daily_readiness[0];
            const session = oura.sleep?.[0];
            setDaily((prev) => ({
              ...prev,
              [d]: {
                sleep_score: sleep?.score,
                readiness_score: readiness?.score,
                hrv: session?.average_hrv ? Math.round(session.average_hrv) : null,
                rhr: session?.average_heart_rate ? Math.round(session.average_heart_rate) : null,
                total_sleep: session?.total_sleep_duration,
                contributors: readiness?.contributors,
              },
            }));
          }
        }
      } catch (e) {
        console.error("Load failed:", e);
      }
      setLoading(false);
    })();
  }, []);

  // Initialize map when recording starts
  useEffect(() => {
    if (!recording || recording.type === "Yoga" || !mapContainerRef.current || !settings?.mapboxToken) return;
    if (mapRef.current) return;

    mapboxgl.accessToken = settings.mapboxToken;
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [-122.24, 37.77],
      zoom: 15,
      attributionControl: false,
    });

    map.on("load", () => {
      map.addSource("route", {
        type: "geojson",
        data: { type: "Feature", geometry: { type: "LineString", coordinates: [] } },
      });
      map.addLayer({
        id: "route",
        type: "line",
        source: "route",
        paint: { "line-color": "#5ae6de", "line-width": 3, "line-opacity": 0.8 },
      });
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [recording, settings?.mapboxToken]);

  // GPS tracking
  const addPoint = useCallback(
    (pos) => {
      setRecording((prev) => {
        if (!prev || prev.isPaused) return prev;

        const point = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          alt: pos.coords.altitude || 0,
          time: pos.timestamp,
          hr: prev.currentHR,
        };

        const newPoints = [...prev.points, point];
        let newDist = prev.distance;
        let newElev = prev.elevGain;
        const newSplits = [...prev.splits];

        if (newPoints.length > 1) {
          const last = newPoints[newPoints.length - 2];
          const dist = haversine(last.lat, last.lng, point.lat, point.lng);

          // Filter out GPS jumps (>100m between samples is noise)
          if (dist > 100) return prev;

          newDist += dist;
          if (point.alt > last.alt) newElev += point.alt - last.alt;

          // Check for new mile split
          const prevMiles = Math.floor((newDist - dist) / MILE);
          const curMiles = Math.floor(newDist / MILE);
          if (curMiles > prevMiles) {
            const splitStart = newSplits.length > 0 ? newSplits[newSplits.length - 1].endIdx : 0;
            const splitPoints = newPoints.slice(splitStart);
            const splitHRs = splitPoints.map((p) => p.hr).filter(Boolean);
            newSplits.push({
              distance: MILE,
              time: (point.time - newPoints[splitStart].time) / 1000,
              avgHR: splitHRs.length ? splitHRs.reduce((a, b) => a + b, 0) / splitHRs.length : null,
              endIdx: newPoints.length,
            });
          }
        }

        // Update map
        if (mapRef.current) {
          const coords = newPoints.map((p) => [p.lng, p.lat]);
          const src = mapRef.current.getSource("route");
          if (src) {
            src.setData({
              type: "Feature",
              geometry: { type: "LineString", coordinates: coords },
            });
          }
          mapRef.current.easeTo({ center: [point.lng, point.lat], duration: 500 });

          // Position dot
          if (!markerRef.current) {
            const el = document.createElement("div");
            el.style.cssText = "width:12px;height:12px;background:#5ae6de;border-radius:50%;border:2px solid #0a0a0a;box-shadow:0 0 8px #5ae6de80";
            markerRef.current = new mapboxgl.Marker(el).setLngLat([point.lng, point.lat]).addTo(mapRef.current);
          } else {
            markerRef.current.setLngLat([point.lng, point.lat]);
          }
        }

        return { ...prev, points: newPoints, distance: newDist, elevGain: newElev, splits: newSplits };
      });
    },
    []
  );

  const startRecording = useCallback(
    (type) => {
      setTypeSelect(false);
      const newRec = {
        type,
        points: [],
        startTime: Date.now(),
        pausedTime: 0,
        isPaused: false,
        pausedAt: null,
        distance: 0,
        elevGain: 0,
        currentHR: null,
        cadence: null,
        calories: null,
        splits: [],
      };
      setRecording(newRec);
      routeRef.current = [];

      if (type !== "Yoga") {
        const id = navigator.geolocation.watchPosition(addPoint, (err) => console.error("GPS:", err), {
          enableHighAccuracy: true,
          maximumAge: 2000,
          timeout: 10000,
        });
        watchIdRef.current = id;
      }
    },
    [addPoint]
  );

  const pauseRecording = useCallback(() => {
    setRecording((prev) => {
      if (!prev) return prev;
      return { ...prev, isPaused: true, pausedAt: (Date.now() - prev.startTime - prev.pausedTime * 1000) / 1000 };
    });
  }, []);

  const resumeRecording = useCallback(() => {
    setRecording((prev) => {
      if (!prev) return prev;
      const pauseDuration = (Date.now() - prev.startTime) / 1000 - prev.pausedAt;
      return { ...prev, isPaused: false, pausedAt: null, pausedTime: prev.pausedTime + pauseDuration * 1000 };
    });
  }, []);

  const stopRecording = useCallback(async () => {
    if (!recording) return;

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }

    const elapsed = recording.isPaused
      ? recording.pausedAt
      : (Date.now() - recording.startTime - recording.pausedTime) / 1000;

    const id = uuid();
    const coords = recording.points.map((p) => [p.lat, p.lng]);
    const polyline = coords.length > 1 ? encodePolyline(coords) : null;

    const summary = {
      id,
      source: "andes",
      name: (() => {
        const hour = new Date(recording.startTime).getHours();
        const prefix = hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";
        const trail = recording.type === "Run" && recording.elevGain > 50 ? "Trail " : "";
        return `${prefix} ${trail}${recording.type}`;
      })(),
      type: recording.type,
      sport_type: recording.type,
      start_date_local: new Date(recording.startTime).toISOString(),
      moving_time: Math.round(elapsed),
      elapsed_time: Math.round((Date.now() - recording.startTime) / 1000),
      distance: Math.round(recording.distance),
      total_elevation_gain: Math.round(recording.elevGain),
      average_speed: elapsed > 0 ? recording.distance / elapsed : 0,
      max_speed: 0,
      average_heartrate: null,
      max_heartrate: null,
      average_cadence: null,
      calories: null,
      summary_polyline: polyline,
      start_latlng: recording.points.length > 0 ? [recording.points[0].lat, recording.points[0].lng] : null,
    };

    // Compute HR stats if available
    const hrs = recording.points.map((p) => p.hr).filter(Boolean);
    if (hrs.length > 0) {
      summary.average_heartrate = hrs.reduce((a, b) => a + b, 0) / hrs.length;
      summary.max_heartrate = Math.max(...hrs);
    }

    // Save
    const newActivities = { ...activities, [id]: summary };
    setActivities(newActivities);
    await kvSet("an_activities", newActivities);

    // Save detail
    const detail = {
      points: recording.points,
      splits: recording.splits,
    };
    await kvSet(`an_activity_${id}`, detail);

    setRecording(null);
  }, [recording, activities]);

  // Open detail
  const openDetail = useCallback(
    async (id) => {
      setDetailId(id);
      try {
        const d = await kvGet(`an_activity_${id}`);
        setDetailData(d);
      } catch {
        setDetailData(null);
      }
      // Load body data for that day
      const activity = activities[id];
      if (activity && settings?.ouraToken) {
        const d = dateKey(activity.start_date_local);
        if (!daily[d]) {
          try {
            const oura = await fetchOura(settings.ouraToken, d, d);
            const sleep = oura.daily_sleep?.[0];
            const readiness = oura.daily_readiness?.[0];
            const session = oura.sleep?.[0];
            if (sleep || readiness) {
              setDaily((prev) => ({
                ...prev,
                [d]: {
                  sleep_score: sleep?.score,
                  readiness_score: readiness?.score,
                  hrv: session?.average_hrv ? Math.round(session.average_hrv) : null,
                  rhr: session?.average_heart_rate ? Math.round(session.average_heart_rate) : null,
                  total_sleep: session?.total_sleep_duration,
                  contributors: readiness?.contributors,
                },
              }));
            }
          } catch {}
        }
      }
    },
    [activities, settings, daily]
  );

  // Save settings
  const saveSettings = useCallback(async (newSettings) => {
    setSettings(newSettings);
    await kvSet("an_settings", newSettings);
  }, []);

  // Strava import
  const importStrava = useCallback(
    async ({ stravaClientId, stravaClientSecret, stravaRefreshToken }) => {
      const resp = await fetch(`${API_BASE}/api/strava-sync`, {
        headers: {
          "x-strava-client-id": stravaClientId,
          "x-strava-client-secret": stravaClientSecret,
          "x-strava-refresh-token": stravaRefreshToken,
        },
      });
      if (!resp.ok) throw new Error("Strava sync failed");
      const data = await resp.json();

      const merged = { ...activities, ...data.activities };
      setActivities(merged);
      await kvSet("an_activities", merged);

      if (data.newRefreshToken && data.newRefreshToken !== stravaRefreshToken) {
        const updated = { ...settings, stravaRefreshToken: data.newRefreshToken };
        setSettings(updated);
        await kvSet("an_settings", updated);
      }

      return data;
    },
    [activities, settings]
  );

  // ─── Derived ─────────────────────────────────────────────────────────────

  const todaysActivities = useMemo(() => {
    const d = today();
    return Object.values(activities)
      .filter((a) => dateKey(a.start_date_local) === d)
      .sort((a, b) => new Date(b.start_date_local) - new Date(a.start_date_local));
  }, [activities]);

  const filteredActivities = useMemo(() => {
    let list = Object.values(activities);
    if (historyFilter !== "All") {
      list = list.filter((a) => a.type === historyFilter || a.sport_type === historyFilter);
    }
    return list.sort((a, b) => new Date(b.start_date_local) - new Date(a.start_date_local));
  }, [activities, historyFilter]);

  const groupedByMonth = useMemo(() => {
    const groups = {};
    for (const a of filteredActivities) {
      const d = new Date(a.start_date_local);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("en-US", { month: "long", year: "numeric" }).toUpperCase();
      if (!groups[key]) groups[key] = { label, activities: [], totalDist: 0, totalTime: 0, count: 0 };
      groups[key].activities.push(a);
      groups[key].totalDist += a.distance || 0;
      groups[key].totalTime += a.moving_time || 0;
      groups[key].count++;
    }
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }, [filteredActivities]);

  const historyTypes = useMemo(() => {
    const types = new Set();
    Object.values(activities).forEach((a) => types.add(a.type));
    return ["All", ...Array.from(types)];
  }, [activities]);

  // ─── Recording state? ───────────────────────────────────────────────────

  if (recording) {
    return (
      <RecordingView
        rec={recording}
        onPause={pauseRecording}
        onResume={resumeRecording}
        onStop={stopRecording}
        mapContainerRef={mapContainerRef}
      />
    );
  }

  // ─── Loading ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0a0a0a" }}>
        <div className="text-sm" style={{ color: "#666" }}>Loading...</div>
      </div>
    );
  }

  // ─── Main Layout ─────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen" style={{ background: "#0a0a0a", paddingTop: "env(safe-area-inset-top, 0px)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <span className="text-sm font-semibold tracking-widest" style={{ color: "#e8e8e8" }}>
          Andes
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => setTypeSelect(true)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{ background: "#5ae6de", color: "#0a0a0a" }}
          >
            record
          </button>
          <button
            onClick={() => setView(view === "settings" ? "today" : "settings")}
            className="px-2 py-1.5 rounded-lg text-xs"
            style={{ color: view === "settings" ? "#5ae6de" : "#666" }}
          >
            {view === "settings" ? "done" : "gear"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      {view !== "settings" && (
        <div className="flex gap-4 px-4 mb-4">
          {["today", "history"].map((tab) => (
            <button
              key={tab}
              onClick={() => setView(tab)}
              className="text-sm font-medium pb-1 border-b-2 transition-colors"
              style={{
                borderColor: view === tab ? "#5ae6de" : "transparent",
                color: view === tab ? "#e8e8e8" : "#666",
              }}
            >
              {tab.toUpperCase()}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="px-4 pb-8">
        {view === "today" && (
          <>
            {todaysActivities.length === 0 && (
              <div className="text-sm py-12 text-center" style={{ color: "#666" }}>
                No activities today
              </div>
            )}
            {todaysActivities.map((a) => (
              <ActivityCard
                key={a.id}
                activity={a}
                token={settings?.mapboxToken}
                onClick={() => openDetail(a.id)}
              />
            ))}

            <BodyState daily={daily[today()]} />
            <WeekChart activities={activities} />
          </>
        )}

        {view === "history" && (
          <>
            <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
              {historyTypes.map((type) => (
                <button
                  key={type}
                  onClick={() => setHistoryFilter(type)}
                  className="px-3 py-1 rounded-full text-xs font-medium shrink-0 border"
                  style={{
                    borderColor: historyFilter === type ? "#5ae6de" : "#2a2a2a",
                    color: historyFilter === type ? "#5ae6de" : "#666",
                    background: historyFilter === type ? "#5ae6de15" : "transparent",
                  }}
                >
                  {type}
                </button>
              ))}
            </div>

            {groupedByMonth.map(([key, group]) => (
              <div key={key} className="mb-6">
                <div className="text-xs font-medium tracking-widest mb-3" style={{ color: "#666" }}>
                  {group.label}
                </div>
                {group.activities.map((a) => {
                  const isRide = a.type === "Ride";
                  const isYoga = a.type === "Yoga";
                  const day = new Date(a.start_date_local).getDate();
                  return (
                    <button
                      key={a.id}
                      onClick={() => openDetail(a.id)}
                      className="w-full flex items-center gap-3 py-2 text-left border-b"
                      style={{ borderColor: "#1a1a1a" }}
                    >
                      <span className="w-6 text-right text-sm tabular-nums" style={{ color: "#666" }}>
                        {day}
                      </span>
                      <span className="flex-1 text-sm truncate" style={{ color: "#e8e8e8" }}>
                        {a.name}
                      </span>
                      {!isYoga && a.distance > 0 && (
                        <span className="text-sm tabular-nums" style={{ color: "#e8e8e8" }}>
                          {formatDistance(a.distance)} mi
                        </span>
                      )}
                      <span className="text-sm tabular-nums" style={{ color: "#666" }}>
                        {formatDuration(a.moving_time)}
                      </span>
                      {a.average_heartrate && (
                        <span className="text-sm tabular-nums" style={{ color: "#5ae6de" }}>
                          {Math.round(a.average_heartrate)} bpm
                        </span>
                      )}
                    </button>
                  );
                })}
                <div className="text-xs mt-2" style={{ color: "#666" }}>
                  {group.totalDist > 0 && `${formatDistance(group.totalDist)} mi · `}
                  {formatDuration(group.totalTime)} · {group.count} activit{group.count === 1 ? "y" : "ies"}
                </div>
              </div>
            ))}
          </>
        )}

        {view === "settings" && (
          <SettingsView settings={settings} onSave={saveSettings} onImportStrava={importStrava} />
        )}
      </div>

      {/* Detail Overlay */}
      {detailId && activities[detailId] && (
        <DetailOverlay
          activity={activities[detailId]}
          detail={detailData}
          daily={daily[dateKey(activities[detailId].start_date_local)]}
          token={settings?.mapboxToken}
          onClose={() => {
            setDetailId(null);
            setDetailData(null);
          }}
        />
      )}

      {/* Type Selection */}
      {typeSelect && <TypeSelect onSelect={startRecording} onCancel={() => setTypeSelect(false)} />}
    </div>
  );
}
