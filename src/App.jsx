import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { BleClient } from "@capacitor-community/bluetooth-le";
import { KeepAwake } from "@capacitor-community/keep-awake";
import { registerPlugin } from "@capacitor/core";

const BackgroundGeolocation = registerPlugin("BackgroundGeolocation");
const isNative = typeof window !== "undefined" && window.Capacitor?.isNativePlatform?.();

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

const API_BASE = isNative ? "https://andes-black.vercel.app" : "";

const HR_SERVICE = "0000180d-0000-1000-8000-00805f9b34fb";
const HR_CHARACTERISTIC = "00002a37-0000-1000-8000-00805f9b34fb";

function parseHeartRate(dataView) {
  const flags = dataView.getUint8(0);
  return flags & 0x01 ? dataView.getUint16(1, true) : dataView.getUint8(1);
}

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

function toLocalISO(date) {
  const d = date instanceof Date ? date : new Date(date);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
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
  try {
    const resp = await fetch(`${API_BASE}/api/get-data?key=${key}`);
    if (!resp.ok) {
      console.error(`kvGet(${key}) HTTP ${resp.status}`);
      return null;
    }
    const data = await resp.json();
    return data.value;
  } catch (err) {
    console.error(`kvGet(${key}) failed:`, err);
    return null;
  }
}

async function kvSet(key, value) {
  try {
    const resp = await fetch(`${API_BASE}/api/update-data`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
    if (!resp.ok) {
      console.error(`kvSet(${key}) HTTP ${resp.status}`);
    }
  } catch (err) {
    console.error(`kvSet(${key}) failed:`, err);
  }
}

// ─── Oura Helper ─────────────────────────────────────────────────────────────

async function fetchOura(token, start, end) {
  try {
    const resp = await fetch(`${API_BASE}/api/oura-proxy?start=${start}&end=${end}`, {
      headers: { "x-oura-token": token },
    });
    if (!resp.ok) {
      console.error(`fetchOura HTTP ${resp.status}`);
      return { daily_sleep: [], daily_readiness: [], sleep: [], heartrate: [] };
    }
    return resp.json();
  } catch (err) {
    console.error("fetchOura failed:", err);
    return { daily_sleep: [], daily_readiness: [], sleep: [], heartrate: [] };
  }
}

// ─── Topo Visual Components ─────────────────────────────────────────────────

function TopoGridDividers() {
  return (
    <svg viewBox="0 0 280 300" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
      <path d="M 0,148 C 45,140 95,158 140,146 C 185,134 235,160 280,148" stroke="rgba(255,255,255,0.04)" strokeWidth="1" fill="none" />
      <path d="M 0,153 C 50,161 100,143 140,155 C 180,167 230,141 280,153" stroke="rgba(255,255,255,0.025)" strokeWidth="1" fill="none" />
      <path d="M 138,0 C 130,45 150,95 136,150 C 122,205 152,255 138,300" stroke="rgba(255,255,255,0.04)" strokeWidth="1" fill="none" />
      <path d="M 143,0 C 151,50 131,100 145,150 C 159,200 129,250 143,300" stroke="rgba(255,255,255,0.025)" strokeWidth="1" fill="none" />
    </svg>
  );
}

function TopoBackground({ tint }) {
  const baseColor = tint ? "rgba(90,230,222," : "rgba(255,255,255,";
  const opA = tint ? "0.025)" : "0.02)";
  const opB = tint ? "0.018)" : "0.015)";
  return (
    <svg viewBox="0 0 400 800" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 0 }}>
      {/* Pair 1 */}
      <path d="M 0,80 C 60,72 140,90 200,78 C 260,66 340,88 400,80" stroke={baseColor + opA} strokeWidth="1" fill="none" />
      <path d="M 0,86 C 70,94 130,76 200,88 C 270,100 330,74 400,86" stroke={baseColor + opB} strokeWidth="1" fill="none" />
      {/* Pair 2 */}
      <path d="M 0,220 C 80,210 160,235 240,218 C 320,201 360,230 400,220" stroke={baseColor + opA} strokeWidth="1" fill="none" />
      <path d="M 0,226 C 90,236 150,214 240,228 C 330,242 370,216 400,226" stroke={baseColor + opB} strokeWidth="1" fill="none" />
      {/* Pair 3 */}
      <path d="M 0,380 C 50,370 120,395 200,376 C 280,357 350,390 400,380" stroke={baseColor + opA} strokeWidth="1" fill="none" />
      <path d="M 0,386 C 60,396 110,374 200,390 C 290,406 340,372 400,386" stroke={baseColor + opB} strokeWidth="1" fill="none" />
      {/* Pair 4 */}
      <path d="M 0,520 C 70,512 150,530 220,516 C 290,502 360,528 400,520" stroke={baseColor + opA} strokeWidth="1" fill="none" />
      <path d="M 0,526 C 80,534 140,512 220,528 C 300,544 350,510 400,526" stroke={baseColor + opB} strokeWidth="1" fill="none" />
      {/* Pair 5 */}
      <path d="M 0,660 C 55,650 130,675 210,656 C 290,637 360,668 400,660" stroke={baseColor + opA} strokeWidth="1" fill="none" />
      <path d="M 0,666 C 65,676 120,652 210,670 C 300,688 350,654 400,666" stroke={baseColor + opB} strokeWidth="1" fill="none" />
      {/* Pair 6 */}
      <path d="M 0,760 C 60,752 140,770 200,758 C 260,746 340,768 400,760" stroke={baseColor + opA} strokeWidth="1" fill="none" />
      <path d="M 0,766 C 70,774 130,756 200,768 C 270,780 330,754 400,766" stroke={baseColor + opB} strokeWidth="1" fill="none" />
    </svg>
  );
}

function TrailDivider({ className = "" }) {
  return (
    <svg viewBox="0 0 400 12" preserveAspectRatio="none" className={className} style={{ width: "100%", height: "8px", display: "block", overflow: "visible" }}>
      <path d="M 0,5 C 60,2 140,8 200,4 C 260,0 340,9 400,5" stroke="rgba(255,255,255,0.04)" strokeWidth="1" fill="none" />
      <path d="M 0,8 C 70,11 130,4 200,9 C 270,14 330,3 400,8" stroke="rgba(255,255,255,0.025)" strokeWidth="1" fill="none" />
    </svg>
  );
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
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="block">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StatBox({ value, label, large }) {
  return (
    <div className="text-center">
      <div
        className={`tabular-nums ${large ? "text-3xl" : "text-xl"}`}
        style={{
          color: "var(--color-text)",
          fontFamily: "var(--font-haas)",
          fontWeight: large ? 200 : 300,
          letterSpacing: "-0.04em",
        }}
      >
        {value}
      </div>
      {label && (
        <div className="mt-0.5" style={{ fontSize: "0.55rem", color: "#444", letterSpacing: "0.06em", textTransform: "uppercase" }}>
          {label}
        </div>
      )}
    </div>
  );
}

function StaticMap({ polyline, token, width = 400, height = 200 }) {
  if (!polyline || !token) return <div style={{ background: "var(--color-bg-mid)", height, borderRadius: "8px" }} />;
  const encoded = encodeURIComponent(polyline);
  const src = `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/path-2+5ae6de-0.8(${encoded})/auto/${width}x${height}@2x?access_token=${token}&padding=30&logo=false&attribution=false`;
  return <img src={src} alt="" className="w-full" style={{ height, borderRadius: "8px" }} loading="lazy" />;
}

function ActivityCard({ activity, token, onClick }) {
  const hasGPS = !!activity.summary_polyline && (activity.distance || 0) > 160;
  const hasHR = !!activity.average_heartrate;
  const isRide = activity.type === "Ride" || activity.sport_type === "Ride";
  const isYoga = activity.type === "Yoga" || activity.sport_type === "Yoga";

  return (
    <button
      onClick={onClick}
      className="w-full text-left mb-4 transition-colors"
      style={{ background: "transparent" }}
    >
      <div className="flex justify-between items-center mb-2">
        <span className="text-label tabular-nums">{formatTime(activity.start_date_local)}</span>
      </div>
      {hasGPS && <StaticMap polyline={activity.summary_polyline} token={token} height={140} />}
      <div className="flex gap-4 mt-2 text-sm tabular-nums" style={{ color: "var(--color-text-soft)" }}>
        {!isYoga && activity.distance > 0 && <span>{formatDistance(activity.distance)}</span>}
        <span>{formatDuration(activity.moving_time)}</span>
        {!isYoga && activity.distance > 0 && (
          <span>{isRide ? formatSpeed(activity.average_speed) : formatPace(activity.average_speed)}</span>
        )}
        {hasHR && (
          <span style={{ color: "var(--color-accent)" }}>{Math.round(activity.average_heartrate)}</span>
        )}
      </div>
      <TrailDivider className="mt-4" />
    </button>
  );
}

// ─── Inner Screen Shell ──────────────────────────────────────────────────────

function InnerScreen({ icon, onBack, tint, children }) {
  return (
    <div className="fixed inset-0 z-40 overflow-y-auto" style={{ background: "var(--color-bg)" }}>
      <div style={{ position: "relative", minHeight: "100%" }}>
        <TopoBackground tint={tint} />
        <div className="relative z-10 max-w-lg mx-auto px-5 pb-8" style={{ paddingTop: "env(safe-area-inset-top, 16px)" }}>
          {/* Icon nav */}
          <div className="flex items-center justify-between py-4">
            <div style={{ width: "32px", height: "32px" }}>
              {icon}
            </div>
            <button
              onClick={onBack}
              style={{ color: "var(--color-text-dim)", minWidth: "44px", minHeight: "44px", display: "flex", alignItems: "center", justifyContent: "flex-end", background: "transparent" }}
            >
              <svg width="20" height="20" viewBox="0 0 40 40" fill="none">
                <path d="M 10,2 C 8,6 7,12 8,16 C 16,12 26,12 32,16" stroke="currentColor" strokeWidth="0.6" strokeLinecap="round" fill="none"/>
                <path d="M 12,16 C 10,24 8,30 6,36" stroke="currentColor" strokeWidth="0.6" strokeLinecap="round" fill="none"/>
                <path d="M 26,14 C 28,22 30,28 31,36" stroke="currentColor" strokeWidth="0.6" strokeLinecap="round" fill="none"/>
                <circle cx="8.5" cy="6" r="0.5" fill="currentColor"/>
              </svg>
            </button>
          </div>
          <TrailDivider className="mb-6" />
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── Sleep Screen ────────────────────────────────────────────────────────────

function SleepScreen({ daily, onBack }) {
  const d = daily || {};
  const { sleep_score, readiness_score, hrv, rhr, contributors, total_sleep } = d;
  const hasData = sleep_score || readiness_score;

  // Score ring SVG
  const ScoreRing = ({ score, label, size = 100 }) => {
    if (!score) return null;
    const radius = (size - 10) / 2;
    const circumference = 2 * Math.PI * radius;
    const progress = (score / 100) * circumference;
    return (
      <div className="flex flex-col items-center">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* Topo-style concentric background rings */}
          {[0.7, 0.5, 0.3].map((scale, i) => (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={radius * scale}
              fill="none"
              stroke="rgba(255,255,255,0.02)"
              strokeWidth="0.5"
            />
          ))}
          {/* Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.04)"
            strokeWidth="2"
          />
          {/* Progress */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="2"
            strokeDasharray={`${progress} ${circumference - progress}`}
            strokeDashoffset={circumference * 0.25}
            strokeLinecap="round"
            style={{ transition: "stroke-dasharray 0.6s ease" }}
          />
          <text
            x={size / 2}
            y={size / 2}
            textAnchor="middle"
            dominantBaseline="central"
            fill="var(--color-text)"
            style={{ fontFamily: "var(--font-haas)", fontSize: `${size * 0.28}px`, fontWeight: 200, letterSpacing: "-0.04em" }}
          >
            {score}
          </text>
        </svg>
        {label && (
          <div className="mt-1" style={{ fontSize: "0.55rem", color: "#444", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            {label}
          </div>
        )}
      </div>
    );
  };

  const bars = [
    { label: "rhr", value: rhr, pct: rhr ? Math.min(100, (rhr / 80) * 100) : 0 },
    { label: "hrv", value: contributors?.hrv_balance || null, pct: contributors?.hrv_balance || 0 },
    { label: "temp", value: contributors?.recovery_index || null, pct: contributors?.recovery_index || 0 },
    { label: "sleep", value: contributors?.total_sleep || null, pct: contributors?.total_sleep || 0 },
  ];

  return (
    <InnerScreen icon={<svg width="32" height="32" viewBox="0 0 40 40" fill="none"><path d="M 22,6 C 14,8 10,14 10,22 C 10,28 16,34 24,34 C 28,34 31,32 33,29 C 28,32 20,30 16,24 C 12,18 14,10 22,6" stroke="rgba(245,247,248,0.3)" strokeWidth="0.6" strokeLinecap="round" fill="none"/></svg>} onBack={onBack}>
      {!hasData ? (
        <div className="py-16 text-center" style={{ color: "var(--color-text-dim)", opacity: 0.3 }}>
          <svg width="48" height="48" viewBox="0 0 40 40" fill="none" style={{ margin: "0 auto" }}>
            <path d="M 22,6 C 14,8 10,14 10,22 C 10,28 16,34 24,34 C 28,34 31,32 33,29 C 28,32 20,30 16,24 C 12,18 14,10 22,6" stroke="currentColor" strokeWidth="0.6" strokeLinecap="round" fill="none"/>
          </svg>
        </div>
      ) : (
        <>
          {/* Score rings */}
          <div className="flex justify-center gap-8 mb-8">
            <ScoreRing score={sleep_score} label="sleep" size={120} />
            <ScoreRing score={readiness_score} label="readiness" size={120} />
          </div>

          <TrailDivider className="mb-6" />

          {/* Key metrics */}
          <div className="flex justify-center gap-10 mb-6">
            {hrv && (
              <div className="text-center">
                <div className="text-display text-2xl" style={{ color: "var(--color-text)" }}>{hrv}</div>
                <div className="mt-0.5" style={{ fontSize: "0.55rem", color: "#444", letterSpacing: "0.06em", textTransform: "uppercase" }}>hrv</div>
              </div>
            )}
            {rhr && (
              <div className="text-center">
                <div className="text-display text-2xl" style={{ color: "var(--color-text)" }}>{rhr}</div>
                <div className="mt-0.5" style={{ fontSize: "0.55rem", color: "#444", letterSpacing: "0.06em", textTransform: "uppercase" }}>rhr</div>
              </div>
            )}
            {total_sleep && (
              <div className="text-center">
                <div className="text-display text-2xl" style={{ color: "var(--color-text)" }}>{formatDuration(total_sleep)}</div>
                <div className="mt-0.5" style={{ fontSize: "0.55rem", color: "#444", letterSpacing: "0.06em", textTransform: "uppercase" }}>hrs</div>
              </div>
            )}
          </div>

          <TrailDivider className="mb-6" />

          {/* Contributors */}
          <div className="space-y-4">
            {bars.map(
              (b, i) =>
                b.value && (
                  <div key={i} className="flex items-center gap-3">
                    <span
                      className="shrink-0 text-right"
                      style={{ width: "3.5rem", fontSize: "0.55rem", color: "#555", letterSpacing: "0.04em", textTransform: "uppercase" }}
                    >
                      {b.label}
                    </span>
                    <span
                      className="text-sm w-10 shrink-0 tabular-nums text-right"
                      style={{ color: "var(--color-text-soft)", fontFamily: "var(--font-haas)", fontWeight: 300 }}
                    >
                      {b.value}
                    </span>
                    <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}>
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, b.pct)}%`,
                          background: "var(--color-accent)",
                          transition: "width 0.6s ease",
                        }}
                      />
                    </div>
                  </div>
                )
            )}
          </div>
        </>
      )}
    </InnerScreen>
  );
}

// ─── Coach Screen ────────────────────────────────────────────────────────────

function CoachScreen({ activities, onBack }) {
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

  // Monthly totals (last 4 months)
  const monthlyData = useMemo(() => {
    const months = [];
    for (let i = 0; i < 4; i++) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const year = d.getFullYear();
      const month = d.getMonth();
      const key = `${year}-${String(month + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("en-US", { month: "short" });
      const acts = Object.values(activities).filter((a) => {
        const ad = new Date(a.start_date_local);
        return ad.getFullYear() === year && ad.getMonth() === month;
      });
      const totalMins = acts.reduce((s, a) => s + (a.moving_time || 0) / 60, 0);
      const totalDist = acts.reduce((s, a) => s + (a.distance || 0), 0);
      months.push({ key, label, count: acts.length, minutes: totalMins, distance: totalDist });
    }
    return months.reverse();
  }, [activities]);

  return (
    <InnerScreen icon={<svg width="32" height="32" viewBox="0 0 40 40" fill="none"><path d="M 10,28 L 20,12 L 30,28" stroke="rgba(245,247,248,0.3)" strokeWidth="0.6" strokeLinecap="round" strokeLinejoin="round" fill="none"/><path d="M 17,28 C 18,22 20,18 20,16" stroke="rgba(245,247,248,0.3)" strokeWidth="0.4" strokeLinecap="round" fill="none" opacity="0.5"/><path d="M 23,28 C 22,22 20,18 20,16" stroke="rgba(245,247,248,0.3)" strokeWidth="0.4" strokeLinecap="round" fill="none" opacity="0.5"/><path d="M 4,28 C 12,27 28,27 36,28" stroke="rgba(245,247,248,0.3)" strokeWidth="0.5" strokeLinecap="round" fill="none" opacity="0.3"/></svg>} onBack={onBack}>
      {/* This week */}
      <div className="mt-0.5 mb-3" style={{ fontSize: "0.55rem", color: "#444", letterSpacing: "0.06em", textTransform: "uppercase" }}>this week</div>

      {/* Week bar chart */}
      <div className="flex items-end gap-2 mb-1" style={{ height: "72px" }}>
        {days.map((d) => (
          <div key={d.date} className="flex-1 flex flex-col items-center justify-end h-full">
            <div
              className="w-full rounded-sm"
              style={{
                height: `${Math.max(2, (d.minutes / maxMin) * 64)}px`,
                background: d.minutes > 0 ? "var(--color-accent)" : "rgba(255,255,255,0.04)",
                opacity: d.minutes > 0 ? 0.7 : 1,
                transition: "height 0.4s ease",
              }}
            />
          </div>
        ))}
      </div>
      {/* Day labels */}
      <div className="flex gap-2 mb-3">
        {days.map((d) => (
          <div key={d.date} className="flex-1 text-center" style={{ fontSize: "0.55rem", color: "#444", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            {d.label}
          </div>
        ))}
      </div>
      {/* Week summary */}
      <div className="flex items-baseline gap-6 mb-2">
        <span>
          <span className="text-display text-2xl" style={{ color: "var(--color-text)" }}>
            {totalH}:{String(totalM).padStart(2, "0")}
          </span>
          <span className="ml-1" style={{ fontSize: "0.55rem", color: "#444", letterSpacing: "0.06em", textTransform: "uppercase" }}>hrs</span>
        </span>
        <span>
          <span className="text-display text-base" style={{ color: "var(--color-accent)" }}>{weekActivities.length}</span>
          <span className="ml-1" style={{ fontSize: "0.55rem", color: "#444", letterSpacing: "0.06em", textTransform: "uppercase" }}>runs</span>
        </span>
      </div>

      {streak > 1 && (
        <div className="text-sm mb-4 tabular-nums" style={{ color: "var(--color-accent)", fontFamily: "var(--font-haas)", fontWeight: 300 }}>
          {streak} <span style={{ fontSize: "0.55rem", color: "#444", letterSpacing: "0.06em", textTransform: "uppercase" }}>day streak</span>
        </div>
      )}

      <TrailDivider className="my-6" />

      {/* Monthly overview */}
      <div className="mb-3" style={{ fontSize: "0.55rem", color: "#444", letterSpacing: "0.06em", textTransform: "uppercase" }}>monthly</div>
      <div className="grid grid-cols-4 gap-3">
        {monthlyData.map((m) => (
          <div key={m.key} className="text-center">
            <div className="mb-1" style={{ fontSize: "0.55rem", color: "#444", letterSpacing: "0.06em", textTransform: "uppercase" }}>{m.label}</div>
            <div className="text-display text-lg" style={{ color: "var(--color-text)" }}>{m.count}</div>
            <div className="mt-0.5" style={{ fontSize: "0.55rem", color: "#444", letterSpacing: "0.06em", textTransform: "uppercase" }}>runs</div>
            {m.distance > 0 && (
              <div className="text-label mt-1 tabular-nums" style={{ color: "var(--color-text-dim)" }}>
                {formatDistance(m.distance)} mi
              </div>
            )}
          </div>
        ))}
      </div>
    </InnerScreen>
  );
}

// ─── History Screen ──────────────────────────────────────────────────────────

function HistoryScreen({ activities, historyFilter, setHistoryFilter, historyTypes, groupedByMonth, onOpenDetail, onBack }) {
  return (
    <InnerScreen icon={<svg width="32" height="32" viewBox="0 0 40 40" fill="none"><path d="M 8,10 C 12,9 20,10 32,11" stroke="rgba(245,247,248,0.3)" strokeWidth="0.7" strokeLinecap="round" fill="none"/><path d="M 8,20 C 14,19 24,21 32,20" stroke="rgba(245,247,248,0.3)" strokeWidth="0.5" strokeLinecap="round" fill="none" opacity="0.6"/><path d="M 8,30 C 16,29 22,31 32,30" stroke="rgba(245,247,248,0.3)" strokeWidth="0.4" strokeLinecap="round" fill="none" opacity="0.3"/></svg>} onBack={onBack}>
      {/* Filter dots */}
      <div className="flex gap-3 mb-6 overflow-x-auto pb-1">
        {historyTypes.map((type) => (
          <button
            key={type}
            onClick={() => setHistoryFilter(type)}
            className="shrink-0 transition-colors"
            style={{
              width: type === "All" ? "28px" : "20px",
              height: type === "All" ? "28px" : "20px",
              borderRadius: "50%",
              border: "1px solid",
              borderColor: historyFilter === type ? "var(--color-accent)" : "var(--color-border)",
              background: historyFilter === type ? "rgba(90,230,222,0.15)" : "transparent",
            }}
          />
        ))}
      </div>

      {groupedByMonth.map(([key, group]) => (
        <div key={key} className="mb-8">
          <TrailDivider className="mb-4" />
          {group.activities.map((a) => {
            const isRide = a.type === "Ride";
            const isYoga = a.type === "Yoga";
            const day = new Date(a.start_date_local).getDate();
            return (
              <div key={a.id}>
                <button
                  onClick={() => onOpenDetail(a.id)}
                  className="w-full flex items-center gap-3 py-3 text-left"
                  style={{ minHeight: "44px" }}
                >
                  <span
                    className="w-7 text-right tabular-nums"
                    style={{ color: "var(--color-text-dim)", fontFamily: "var(--font-haas)", fontWeight: 300, fontSize: "0.85rem" }}
                  >
                    {day}
                  </span>
                  <span className="flex-1" />
                  {!isYoga && a.distance > 0 && (
                    <span className="text-sm tabular-nums" style={{ color: "var(--color-text-soft)" }}>
                      {formatDistance(a.distance)}
                    </span>
                  )}
                  <span className="text-sm tabular-nums" style={{ color: "var(--color-text-dim)" }}>
                    {formatDuration(a.moving_time)}
                  </span>
                  {a.average_heartrate && (
                    <span className="text-sm tabular-nums" style={{ color: "var(--color-accent)" }}>
                      {Math.round(a.average_heartrate)}
                    </span>
                  )}
                </button>
                <TrailDivider />
              </div>
            );
          })}
          <div className="mt-3 tabular-nums" style={{ color: "var(--color-text-dim)", fontFamily: "var(--font-haas)", fontWeight: 300, fontSize: "0.8rem" }}>
            {group.totalDist > 0 && `${formatDistance(group.totalDist)}  ·  `}
            {formatDuration(group.totalTime)}  ·  {group.count}
          </div>
        </div>
      ))}
    </InnerScreen>
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

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: "var(--color-bg)" }}>
      <div style={{ position: "relative", minHeight: "100%" }}>
        <TopoBackground />
        <div className="relative z-10 max-w-lg mx-auto px-5 pb-8" style={{ paddingTop: "env(safe-area-inset-top, 16px)" }}>
          <div className="flex justify-end py-3">
            <button
              onClick={onClose}
              style={{ color: "var(--color-text-dim)", minWidth: "44px", minHeight: "44px", display: "flex", alignItems: "center", justifyContent: "center", background: "transparent" }}
            >
              <svg width="20" height="20" viewBox="0 0 40 40" fill="none">
                <path d="M 10,2 C 8,6 7,12 8,16 C 16,12 26,12 32,16" stroke="currentColor" strokeWidth="0.6" strokeLinecap="round" fill="none"/>
                <path d="M 12,16 C 10,24 8,30 6,36" stroke="currentColor" strokeWidth="0.6" strokeLinecap="round" fill="none"/>
                <path d="M 26,14 C 28,22 30,28 31,36" stroke="currentColor" strokeWidth="0.6" strokeLinecap="round" fill="none"/>
                <circle cx="8.5" cy="6" r="0.5" fill="currentColor"/>
              </svg>
            </button>
          </div>

          <div className="text-label-lg mb-5 tabular-nums">
            {formatTime(activity.start_date_local)}
          </div>

          {hasGPS && (
            <div className="mb-6">
              <StaticMap polyline={activity.summary_polyline} token={token} height={200} />
            </div>
          )}

          <div className={`grid gap-6 mb-6 ${isYoga ? "grid-cols-1" : "grid-cols-2"}`}>
            {!isYoga && activity.distance > 0 && (
              <>
                <div>
                  <div className="text-display text-xl tabular-nums">{formatDistance(activity.distance)}</div>
                  <div className="mt-0.5" style={{ fontSize: "0.55rem", color: "#444", letterSpacing: "0.06em", textTransform: "uppercase" }}>mi</div>
                </div>
                <div>
                  <div className="text-display text-xl tabular-nums">
                    {isRide ? formatSpeed(activity.average_speed) : formatPace(activity.average_speed)}
                  </div>
                  <div className="mt-0.5" style={{ fontSize: "0.55rem", color: "#444", letterSpacing: "0.06em", textTransform: "uppercase" }}>{isRide ? "mph" : "/mi"}</div>
                </div>
              </>
            )}
            <div>
              <div className="text-display text-xl tabular-nums">{formatDuration(activity.moving_time)}</div>
              <div className="mt-0.5" style={{ fontSize: "0.55rem", color: "#444", letterSpacing: "0.06em", textTransform: "uppercase" }}>time</div>
            </div>
            {!isYoga && activity.total_elevation_gain > 0 && (
              <div>
                <div className="text-display text-xl tabular-nums">{formatElevation(activity.total_elevation_gain)}</div>
                <div className="mt-0.5" style={{ fontSize: "0.55rem", color: "#444", letterSpacing: "0.06em", textTransform: "uppercase" }}>ft gain</div>
              </div>
            )}
            {hasHR && (
              <>
                <div>
                  <div className="text-display text-xl tabular-nums" style={{ color: "var(--color-accent)" }}>
                    {Math.round(activity.average_heartrate)}
                  </div>
                  <div className="mt-0.5" style={{ fontSize: "0.55rem", color: "#444", letterSpacing: "0.06em", textTransform: "uppercase" }}>avg bpm</div>
                </div>
                <div>
                  <div className="text-display text-xl tabular-nums" style={{ color: "var(--color-accent)" }}>
                    {Math.round(activity.max_heartrate)}
                  </div>
                  <div className="mt-0.5" style={{ fontSize: "0.55rem", color: "#444", letterSpacing: "0.06em", textTransform: "uppercase" }}>max bpm</div>
                </div>
              </>
            )}
            {activity.calories > 0 && (
              <div>
                <div className="text-display text-xl tabular-nums">{Math.round(activity.calories)}</div>
                <div className="mt-0.5" style={{ fontSize: "0.55rem", color: "#444", letterSpacing: "0.06em", textTransform: "uppercase" }}>cal</div>
              </div>
            )}
          </div>

          {splits.length > 0 && (
            <>
              <TrailDivider className="mb-5" />
              <div className="mb-6">
                <TrailDivider className="mb-4" />
                <div className="space-y-1">
                  {splits.map((s, i) => (
                    <div key={i} className="flex items-center gap-4 py-1.5 tabular-nums">
                      <span className="w-6 text-right text-label">{i + 1}</span>
                      <span style={{ color: "var(--color-text-soft)", fontFamily: "var(--font-haas)", fontWeight: 300, fontSize: "0.9rem" }}>
                        {s.time > 0
                          ? (isRide ? formatSpeed(s.distance / s.time) : formatPace(s.distance / s.time))
                          : "--"}
                      </span>
                      {s.avgHR && <span style={{ color: "var(--color-accent)", fontSize: "0.85rem" }}>{Math.round(s.avgHR)}</span>}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {hrStream.length > 10 && (
            <>
              <TrailDivider className="mb-5" />
              <div className="mb-6">
                <TrailDivider className="mb-4" />
                <Sparkline data={hrStream} width={360} height={50} color="#5ae6de" />
              </div>
            </>
          )}

          {paceStream.length > 10 && (
            <>
              <TrailDivider className="mb-5" />
              <div className="mb-6">
                <TrailDivider className="mb-4" />
                <Sparkline data={paceStream} width={360} height={50} color="#5ae6de" />
              </div>
            </>
          )}

          {daily && (daily.sleep_score || daily.readiness_score) && (
            <>
              <TrailDivider className="mb-5" />
              <div className="mb-6">
                {/* Body data for this day */}
                <div className="flex items-center gap-2 mb-3">
                  <svg width="16" height="16" viewBox="0 0 40 40" fill="none"><path d="M 22,6 C 14,8 10,14 10,22 C 10,28 16,34 24,34 C 28,34 31,32 33,29 C 28,32 20,30 16,24 C 12,18 14,10 22,6" stroke="rgba(245,247,248,0.2)" strokeWidth="0.6" strokeLinecap="round" fill="none"/></svg>
                  <span style={{ fontSize: "0.55rem", color: "#444", letterSpacing: "0.06em", textTransform: "uppercase" }}>body that day</span>
                </div>
                <div className="flex flex-wrap gap-6">
                  {daily.sleep_score && (
                    <div>
                      <div className="text-display text-lg tabular-nums">{daily.sleep_score}</div>
                      <div className="mt-0.5" style={{ fontSize: "0.55rem", color: "#444", letterSpacing: "0.06em", textTransform: "uppercase" }}>sleep</div>
                    </div>
                  )}
                  {daily.readiness_score && (
                    <div>
                      <div className="text-display text-lg tabular-nums">{daily.readiness_score}</div>
                      <div className="mt-0.5" style={{ fontSize: "0.55rem", color: "#444", letterSpacing: "0.06em", textTransform: "uppercase" }}>ready</div>
                    </div>
                  )}
                  {daily.hrv && (
                    <div>
                      <div className="text-display text-lg tabular-nums">{daily.hrv}</div>
                      <div className="mt-0.5" style={{ fontSize: "0.55rem", color: "#444", letterSpacing: "0.06em", textTransform: "uppercase" }}>hrv</div>
                    </div>
                  )}
                  {daily.rhr && (
                    <div>
                      <div className="text-display text-lg tabular-nums">{daily.rhr}</div>
                      <div className="mt-0.5" style={{ fontSize: "0.55rem", color: "#444", letterSpacing: "0.06em", textTransform: "uppercase" }}>rhr</div>
                    </div>
                  )}
                  {daily.total_sleep && (
                    <div>
                      <div className="text-display text-lg tabular-nums">{formatDuration(daily.total_sleep)}</div>
                      <div className="mt-0.5" style={{ fontSize: "0.55rem", color: "#444", letterSpacing: "0.06em", textTransform: "uppercase" }}>hrs</div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Recording View ──────────────────────────────────────────────────────────

function RecordingView({ rec, onPause, onResume, onStop, mapContainerRef }) {
  const isRide = rec.type === "Ride";
  const isYoga = rec.type === "Yoga";
  const elapsed = rec.isPaused
    ? (rec.pausedAt - rec.startTime - rec.pausedTime) / 1000
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
      case "avgHR": return rec.avgHR || "--";
      case "maxHR": return rec.maxHR || "--";
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
      case "elevation": return "ft";
      case "cadence": return "rpm";
      case "calories": return "cal";
      case "avgHR": return "avg bpm";
      case "maxHR": return "max bpm";
      default: return "";
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "var(--color-bg)" }}>
      {/* Topo background behind everything */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0 }}>
        <TopoBackground tint={!rec.isPaused} />
      </div>

      {!isYoga && (
        <div ref={mapContainerRef} className="flex-1 min-h-0 relative z-10" style={{ minHeight: "40vh" }} />
      )}
      {isYoga && <div className="flex-1 relative z-10" />}

      <div className="px-5 pb-6 relative z-10" style={{ paddingBottom: "max(env(safe-area-inset-bottom, 24px), 24px)" }}>
        <div className="flex justify-between items-center mb-4">
          {/* Breath alpaca as recording indicator */}
          <svg width="24" height="24" viewBox="0 0 40 40" fill="none" style={{ opacity: 0.4 }}>
            <path d="M 10,2 C 8,6 7,12 8,16 C 16,12 26,12 32,16" stroke="var(--color-warm)" strokeWidth="0.6" strokeLinecap="round" fill="none"/>
            <path d="M 12,16 C 10,24 8,30 6,36" stroke="var(--color-warm)" strokeWidth="0.6" strokeLinecap="round" fill="none"/>
            <path d="M 26,14 C 28,22 30,28 31,36" stroke="var(--color-warm)" strokeWidth="0.6" strokeLinecap="round" fill="none"/>
            <circle cx="8.5" cy="6" r="0.5" fill="var(--color-warm)"/>
          </svg>
          {rec.currentHR && (
            <span
              className="tabular-nums"
              style={{ color: "var(--color-accent)", fontFamily: "var(--font-haas)", fontWeight: 200, fontSize: "1.25rem" }}
            >
              {rec.currentHR} <span style={{ fontSize: "0.55rem", color: "rgba(90,230,222,0.5)", letterSpacing: "0.06em", textTransform: "uppercase" }}>bpm</span>
            </span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-4 mb-3">
          {config.row1.map((key) => (
            <StatBox key={key} value={statValue(key)} label={statLabel(key)} large />
          ))}
        </div>

        <TrailDivider className="my-3" />

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
              className="flex-1 py-4 rounded-xl flex items-center justify-center"
              style={{ background: "var(--color-accent)" }}
            >
              {/* Play - sumi-e triangle */}
              <svg width="24" height="24" viewBox="0 0 40 40" fill="none">
                <path d="M 12,6 C 12,14 12,26 12,34" stroke="var(--color-bg)" strokeWidth="0.8" strokeLinecap="round" fill="none"/>
                <path d="M 12,6 C 20,10 26,14 32,20" stroke="var(--color-bg)" strokeWidth="0.8" strokeLinecap="round" fill="none"/>
                <path d="M 32,20 C 26,26 20,30 12,34" stroke="var(--color-bg)" strokeWidth="0.8" strokeLinecap="round" fill="none"/>
              </svg>
            </button>
            <button
              onClick={onStop}
              className="flex-1 py-4 rounded-xl flex items-center justify-center"
              style={{ border: "1px solid var(--color-border-strong)", background: "transparent" }}
            >
              {/* Stop - sumi-e square */}
              <svg width="20" height="20" viewBox="0 0 40 40" fill="none">
                <path d="M 10,10 C 16,10 24,10 30,10" stroke="var(--color-text-soft)" strokeWidth="0.7" strokeLinecap="round" fill="none"/>
                <path d="M 30,10 C 30,16 30,24 30,30" stroke="var(--color-text-soft)" strokeWidth="0.7" strokeLinecap="round" fill="none"/>
                <path d="M 30,30 C 24,30 16,30 10,30" stroke="var(--color-text-soft)" strokeWidth="0.6" strokeLinecap="round" fill="none" opacity="0.7"/>
                <path d="M 10,30 C 10,24 10,16 10,10" stroke="var(--color-text-soft)" strokeWidth="0.6" strokeLinecap="round" fill="none" opacity="0.7"/>
              </svg>
            </button>
          </div>
        ) : (
          <button
            onClick={onPause}
            className="w-full py-4 rounded-xl flex items-center justify-center"
            style={{ background: "var(--color-accent)" }}
          >
            {/* Pause - sumi-e bars */}
            <svg width="24" height="24" viewBox="0 0 40 40" fill="none">
              <path d="M 14,8 C 14,14 14,26 14,32" stroke="var(--color-bg)" strokeWidth="0.8" strokeLinecap="round" fill="none"/>
              <path d="M 26,8 C 26,14 26,26 26,32" stroke="var(--color-bg)" strokeWidth="0.8" strokeLinecap="round" fill="none"/>
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Settings View ───────────────────────────────────────────────────────────

function SettingsView({ settings, onSave, onImportStrava, onBack }) {
  const [mapboxToken, setMapboxToken] = useState(settings?.mapboxToken || "");
  const [ouraToken, setOuraToken] = useState(settings?.ouraToken || "");
  const [stravaClientId, setStravaClientId] = useState(settings?.stravaClientId || "");
  const [stravaClientSecret, setStravaClientSecret] = useState(settings?.stravaClientSecret || "");
  const [stravaRefreshToken, setStravaRefreshToken] = useState(settings?.stravaRefreshToken || "");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [bleDevices, setBleDevices] = useState([]);
  const [bleStatus, setBleStatus] = useState(null);

  const handleSave = () => {
    onSave({ mapboxToken, ouraToken, stravaClientId, stravaClientSecret, stravaRefreshToken, hrDeviceId: settings?.hrDeviceId, hrDeviceName: settings?.hrDeviceName });
  };

  const scanForHR = async () => {
    setScanning(true);
    setBleDevices([]);
    setBleStatus("Scanning...");
    try {
      await BleClient.initialize();
      await BleClient.requestLEScan({ services: [HR_SERVICE] }, (result) => {
        setBleDevices((prev) => {
          if (prev.some((d) => d.device.deviceId === result.device.deviceId)) return prev;
          return [...prev, result];
        });
      });
      setTimeout(async () => {
        try { await BleClient.stopLEScan(); } catch {}
        setScanning(false);
        setBleStatus(null);
      }, 10000);
    } catch (err) {
      setBleStatus(`Error: ${err.message}`);
      setScanning(false);
    }
  };

  const pairDevice = async (device) => {
    try {
      await BleClient.stopLEScan();
    } catch {}
    setScanning(false);
    setBleDevices([]);
    setBleStatus(`Paired: ${device.name || device.deviceId}`);
    onSave({ ...settings, mapboxToken, ouraToken, stravaClientId, stravaClientSecret, stravaRefreshToken, hrDeviceId: device.deviceId, hrDeviceName: device.name || "HR Monitor" });
  };

  const unpairDevice = () => {
    const { hrDeviceId, hrDeviceName, ...rest } = settings || {};
    onSave({ ...rest, mapboxToken, ouraToken, stravaClientId, stravaClientSecret, stravaRefreshToken });
    setBleStatus(null);
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

  const inputStyle = {
    background: "var(--color-bg-mid)",
    borderColor: "var(--color-border)",
    color: "var(--color-text)",
    fontFamily: "var(--font-haas)",
    fontWeight: 300,
  };

  return (
    <InnerScreen icon={<svg width="32" height="32" viewBox="0 0 40 40" fill="none"><circle cx="20" cy="20" r="6" stroke="rgba(245,247,248,0.3)" strokeWidth="0.6" fill="none"/><path d="M 20,4 C 20,8 20,12 20,14" stroke="rgba(245,247,248,0.3)" strokeWidth="0.5" strokeLinecap="round" fill="none"/><path d="M 20,26 C 20,28 20,32 20,36" stroke="rgba(245,247,248,0.3)" strokeWidth="0.5" strokeLinecap="round" fill="none"/><path d="M 4,20 C 8,20 12,20 14,20" stroke="rgba(245,247,248,0.3)" strokeWidth="0.5" strokeLinecap="round" fill="none"/><path d="M 26,20 C 28,20 32,20 36,20" stroke="rgba(245,247,248,0.3)" strokeWidth="0.5" strokeLinecap="round" fill="none"/><path d="M 8.6,8.6 C 10.4,10.4 12,12 13.2,13.2" stroke="rgba(245,247,248,0.3)" strokeWidth="0.4" strokeLinecap="round" fill="none" opacity="0.5"/><path d="M 26.8,26.8 C 28.6,28.6 30.2,30.2 31.4,31.4" stroke="rgba(245,247,248,0.3)" strokeWidth="0.4" strokeLinecap="round" fill="none" opacity="0.5"/><path d="M 31.4,8.6 C 29.6,10.4 28,12 26.8,13.2" stroke="rgba(245,247,248,0.3)" strokeWidth="0.4" strokeLinecap="round" fill="none" opacity="0.5"/><path d="M 13.2,26.8 C 11.4,28.6 9.8,30.2 8.6,31.4" stroke="rgba(245,247,248,0.3)" strokeWidth="0.4" strokeLinecap="round" fill="none" opacity="0.5"/></svg>} onBack={onBack}>
      <div className="space-y-6">
        <div>
          {/* mapbox */}
          <input
            type="text"
            value={mapboxToken}
            onChange={(e) => setMapboxToken(e.target.value)}
            placeholder="pk.eyJ1..."
            className="w-full px-3 py-3 rounded-lg text-sm border focus:outline-none"
            style={inputStyle}
          />
        </div>

        <div>
          {/* oura */}
          <input
            type="text"
            value={ouraToken}
            onChange={(e) => setOuraToken(e.target.value)}
            placeholder="Personal access token"
            className="w-full px-3 py-3 rounded-lg text-sm border focus:outline-none"
            style={inputStyle}
          />
        </div>

        <TrailDivider className="my-2" />

        <div>
          <TrailDivider className="mb-3" />
          <div className="space-y-2">
            <input
              type="text"
              value={stravaClientId}
              onChange={(e) => setStravaClientId(e.target.value)}
              placeholder="Client ID"
              className="w-full px-3 py-3 rounded-lg text-sm border focus:outline-none"
              style={inputStyle}
            />
            <input
              type="password"
              value={stravaClientSecret}
              onChange={(e) => setStravaClientSecret(e.target.value)}
              placeholder="Client Secret"
              className="w-full px-3 py-3 rounded-lg text-sm border focus:outline-none"
              style={inputStyle}
            />
            <input
              type="text"
              value={stravaRefreshToken}
              onChange={(e) => setStravaRefreshToken(e.target.value)}
              placeholder="Refresh Token"
              className="w-full px-3 py-3 rounded-lg text-sm border focus:outline-none"
              style={inputStyle}
            />
            <button
              onClick={handleImport}
              disabled={importing || !stravaClientId || !stravaClientSecret || !stravaRefreshToken}
              className="w-full py-3 rounded-lg text-sm disabled:opacity-40"
              style={{
                background: "rgba(255,255,255,0.04)",
                color: "var(--color-text-soft)",
                fontFamily: "var(--font-sharp)",
                fontWeight: 400,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                minHeight: "44px",
              }}
            >
              {importing ? "..." : <svg width="20" height="20" viewBox="0 0 40 40" fill="none" style={{ margin: "0 auto" }}><path d="M 6,20 C 12,20 24,20 34,20" stroke="currentColor" strokeWidth="0.6" strokeLinecap="round" fill="none"/><path d="M 28,14 C 30,16 33,19 34,20 C 33,21 30,24 28,26" stroke="currentColor" strokeWidth="0.5" strokeLinecap="round" fill="none" opacity="0.6"/></svg>}
            </button>
            {importResult && (
              <div className="text-sm" style={{
                color: importResult.startsWith("Error") ? "#ff6b6b" : "var(--color-accent)",
                fontFamily: "var(--font-haas)",
                fontWeight: 300,
              }}>
                {importResult}
              </div>
            )}
          </div>
        </div>

        <TrailDivider className="my-2" />

        <div>
          <TrailDivider className="mb-3" />
          {settings?.hrDeviceId ? (
            <div className="flex items-center justify-between py-2">
              <div>
                <div style={{ color: "var(--color-text-soft)", fontFamily: "var(--font-haas)", fontWeight: 300, fontSize: "0.9rem" }}>
                  {settings.hrDeviceId.slice(0, 8)}
                </div>
                <div className="text-label mt-1">{settings.hrDeviceId.slice(0, 12)}...</div>
              </div>
              <button
                onClick={unpairDevice}
                className="px-3 py-1.5 rounded-lg text-label-lg"
                style={{ background: "rgba(255,255,255,0.04)", color: "var(--color-text-dim)" }}
              >
                <svg width="16" height="16" viewBox="0 0 40 40" fill="none"><path d="M 10,10 C 16,16 24,24 30,30" stroke="currentColor" strokeWidth="0.6" strokeLinecap="round" fill="none"/><path d="M 30,10 C 24,16 16,24 10,30" stroke="currentColor" strokeWidth="0.6" strokeLinecap="round" fill="none"/></svg>
              </button>
            </div>
          ) : (
            <button
              onClick={scanForHR}
              disabled={scanning}
              className="w-full py-2 rounded-lg text-sm disabled:opacity-40"
              style={{
                background: "rgba(255,255,255,0.04)",
                color: "var(--color-text-soft)",
                fontFamily: "var(--font-sharp)",
                fontWeight: 400,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              {scanning ? "..." : <svg width="20" height="20" viewBox="0 0 40 40" fill="none" style={{ margin: "0 auto" }}><path d="M 20,34 C 16,30 8,24 6,18 C 4,12 6,6 12,6 C 16,6 18,8 20,12 C 22,8 24,6 28,6 C 34,6 36,12 34,18 C 32,24 24,30 20,34" stroke="currentColor" strokeWidth="0.6" strokeLinecap="round" fill="none"/></svg>}
            </button>
          )}
          {bleDevices.length > 0 && (
            <div className="mt-2 space-y-1">
              {bleDevices.map((r) => (
                <button
                  key={r.device.deviceId}
                  onClick={() => pairDevice(r.device)}
                  className="w-full flex items-center justify-between py-2 px-3 rounded-lg"
                  style={{
                    background: "var(--color-bg-mid)",
                    color: "var(--color-text-soft)",
                    fontFamily: "var(--font-haas)",
                    fontWeight: 300,
                    fontSize: "0.9rem",
                  }}
                >
                  <span>{r.device.name || r.device.deviceId}</span>
                  <span style={{ color: "var(--color-accent)" }}>+</span>
                </button>
              ))}
            </div>
          )}
          {bleStatus && (
            <div className="text-label mt-2" style={{ color: bleStatus.startsWith("Error") ? "#ff6b6b" : "var(--color-accent)" }}>
              {bleStatus}
            </div>
          )}
        </div>

        <button
          onClick={handleSave}
          className="w-full py-3.5 rounded-xl text-sm"
          style={{
            background: "var(--color-accent)",
            color: "var(--color-bg)",
            fontFamily: "var(--font-sharp)",
            fontWeight: 500,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          <svg width="24" height="24" viewBox="0 0 40 40" fill="none"><path d="M 8,22 C 12,26 14,28 16,30 C 20,22 26,14 34,8" stroke="#0a0a0a" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
        </button>
      </div>
    </InnerScreen>
  );
}

// ─── Type Selection ──────────────────────────────────────────────────────────

// Sumi-e activity type icons
const TYPE_ICONS = {
  Run: (
    <svg width="48" height="48" viewBox="0 0 40 40" fill="none">
      <path d="M 10,2 C 8,6 7,12 8,16 C 16,12 26,12 32,16" stroke="rgba(245,247,248,0.4)" strokeWidth="0.6" strokeLinecap="round" fill="none"/>
      <path d="M 12,16 C 10,24 8,30 6,36" stroke="rgba(245,247,248,0.4)" strokeWidth="0.6" strokeLinecap="round" fill="none"/>
      <path d="M 26,14 C 28,22 30,28 31,36" stroke="rgba(245,247,248,0.4)" strokeWidth="0.6" strokeLinecap="round" fill="none"/>
      <circle cx="8.5" cy="6" r="0.5" fill="rgba(245,247,248,0.4)"/>
    </svg>
  ),
  Ride: (
    <svg width="48" height="48" viewBox="0 0 40 40" fill="none">
      <path d="M 6,28 C 4,22 8,16 14,16 C 18,16 20,20 18,26 C 16,30 8,32 6,28" stroke="rgba(245,247,248,0.4)" strokeWidth="0.5" strokeLinecap="round" fill="none"/>
      <path d="M 22,28 C 20,22 24,16 30,16 C 34,16 36,20 34,26 C 32,30 24,32 22,28" stroke="rgba(245,247,248,0.4)" strokeWidth="0.5" strokeLinecap="round" fill="none"/>
      <path d="M 14,16 C 18,10 24,8 30,10" stroke="rgba(245,247,248,0.4)" strokeWidth="0.4" strokeLinecap="round" fill="none" opacity="0.6"/>
      <path d="M 14,22 C 18,18 24,18 30,22" stroke="rgba(245,247,248,0.4)" strokeWidth="0.3" strokeLinecap="round" fill="none" opacity="0.3"/>
    </svg>
  ),
  Walk: (
    <svg width="48" height="48" viewBox="0 0 40 40" fill="none">
      {/* Footprints */}
      <path d="M 14,30 C 14,28 16,26 18,28 C 18,30 16,32 14,30" stroke="rgba(245,247,248,0.4)" strokeWidth="0.5" strokeLinecap="round" fill="none"/>
      <path d="M 22,22 C 22,20 24,18 26,20 C 26,22 24,24 22,22" stroke="rgba(245,247,248,0.4)" strokeWidth="0.5" strokeLinecap="round" fill="none"/>
      <path d="M 14,14 C 14,12 16,10 18,12 C 18,14 16,16 14,14" stroke="rgba(245,247,248,0.4)" strokeWidth="0.5" strokeLinecap="round" fill="none"/>
    </svg>
  ),
  Yoga: (
    <svg width="48" height="48" viewBox="0 0 40 40" fill="none">
      {/* Seated figure - simple triangle + head */}
      <path d="M 20,10 C 20,14 20,18 20,24" stroke="rgba(245,247,248,0.4)" strokeWidth="0.5" strokeLinecap="round" fill="none"/>
      <path d="M 10,28 C 14,24 20,24 20,24 C 20,24 26,24 30,28" stroke="rgba(245,247,248,0.4)" strokeWidth="0.5" strokeLinecap="round" fill="none"/>
      <circle cx="20" cy="8" r="2" stroke="rgba(245,247,248,0.4)" strokeWidth="0.5" fill="none"/>
    </svg>
  ),
  Hike: (
    <svg width="48" height="48" viewBox="0 0 40 40" fill="none">
      {/* Mountain with path */}
      <path d="M 4,34 C 10,26 16,14 20,6 C 24,14 30,26 36,34" stroke="rgba(245,247,248,0.4)" strokeWidth="0.5" strokeLinecap="round" fill="none"/>
      <path d="M 14,34 C 16,28 18,20 20,14" stroke="rgba(245,247,248,0.4)" strokeWidth="0.4" strokeLinecap="round" fill="none" opacity="0.4"/>
    </svg>
  ),
};

function TypeSelect({ onSelect, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(2,3,4,0.95)" }}>
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        <TopoBackground />
      </div>
      <div className="text-center relative z-10">
        <div className="flex flex-wrap justify-center gap-6 mb-10">
          {ACTIVITY_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => onSelect(type)}
              className="flex items-center justify-center transition-colors"
              style={{
                width: "72px",
                height: "72px",
                borderRadius: "20px",
                border: "1px solid var(--color-border-strong)",
                background: "transparent",
              }}
            >
              {TYPE_ICONS[type]}
            </button>
          ))}
        </div>
        <button
          onClick={onCancel}
          className="px-6 py-3"
          style={{ color: "var(--color-text-dim)", minHeight: "44px", background: "transparent" }}
        >
          <svg width="20" height="20" viewBox="0 0 40 40" fill="none"><path d="M 10,10 C 16,16 24,24 30,30" stroke="currentColor" strokeWidth="0.6" strokeLinecap="round" fill="none"/><path d="M 30,10 C 24,16 16,24 10,30" stroke="currentColor" strokeWidth="0.6" strokeLinecap="round" fill="none"/></svg>
        </button>
      </div>
    </div>
  );
}

// ─── Home Screen ─────────────────────────────────────────────────────────────

function HomeScreen({ onNavigate, todaysActivities, daily, activities, settings, onOpenDetail, onStartRecord }) {
  const todayDaily = daily[today()];
  const sleepScore = todayDaily?.sleep_score;
  const readinessScore = todayDaily?.readiness_score;

  // Week summary for coach preview
  const weekActivities = Object.values(activities).filter(
    (a) => dateKey(a.start_date_local) >= daysAgo(6)
  );
  const weekMinutes = weekActivities.reduce((sum, a) => sum + (a.moving_time || 0) / 60, 0);
  const weekH = Math.floor(weekMinutes / 60);
  const weekM = Math.round(weekMinutes % 60);

  // Streak
  let streak = 0;
  for (let i = 0; ; i++) {
    const d = daysAgo(i);
    const has = Object.values(activities).some((a) => dateKey(a.start_date_local) === d);
    if (has) streak++;
    else break;
  }

  return (
    <div
      className="min-h-screen"
      style={{
        background: "var(--color-bg)",
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {/* Top bar with settings gear */}
      <div style={{ position: "relative", padding: "16px 16px 0" }}>
        <div className="flex justify-end">
          <button
            onClick={() => onNavigate("settings")}
            style={{
              color: "var(--color-text-dim)",
              minWidth: "44px",
              minHeight: "44px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 40 40" fill="none">
              <circle cx="20" cy="20" r="6" stroke="currentColor" strokeWidth="0.6" fill="none"/>
              <path d="M 20,4 C 20,8 20,12 20,14" stroke="currentColor" strokeWidth="0.5" strokeLinecap="round" fill="none"/>
              <path d="M 20,26 C 20,28 20,32 20,36" stroke="currentColor" strokeWidth="0.5" strokeLinecap="round" fill="none"/>
              <path d="M 4,20 C 8,20 12,20 14,20" stroke="currentColor" strokeWidth="0.5" strokeLinecap="round" fill="none"/>
              <path d="M 26,20 C 28,20 32,20 36,20" stroke="currentColor" strokeWidth="0.5" strokeLinecap="round" fill="none"/>
              <path d="M 8.6,8.6 C 10.4,10.4 12,12 13.2,13.2" stroke="currentColor" strokeWidth="0.4" strokeLinecap="round" fill="none" opacity="0.5"/>
              <path d="M 26.8,26.8 C 28.6,28.6 30.2,30.2 31.4,31.4" stroke="currentColor" strokeWidth="0.4" strokeLinecap="round" fill="none" opacity="0.5"/>
              <path d="M 31.4,8.6 C 29.6,10.4 28,12 26.8,13.2" stroke="currentColor" strokeWidth="0.4" strokeLinecap="round" fill="none" opacity="0.5"/>
              <path d="M 13.2,26.8 C 11.4,28.6 9.8,30.2 8.6,31.4" stroke="currentColor" strokeWidth="0.4" strokeLinecap="round" fill="none" opacity="0.5"/>
            </svg>
          </button>
        </div>
      </div>

      {/* 2x2 Grid with topo dividers */}
      <div style={{ position: "relative", padding: "0 20px" }}>
        <div
          style={{
            position: "relative",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gridTemplateRows: "1fr 1fr",
            minHeight: "280px",
            aspectRatio: "1 / 1.05",
          }}
        >
          {/* Topo dividers */}
          <TopoGridDividers />

          {/* Record (top-left) - breath alpaca */}
          <button
            onClick={onStartRecord}
            className="relative z-10 flex items-center justify-center"
            style={{ background: "transparent" }}
          >
            <svg width="56" height="56" viewBox="0 0 40 40" fill="none">
              <path d="M 10,2 C 8,6 7,12 8,16 C 16,12 26,12 32,16" stroke="var(--color-warm)" strokeWidth="0.6" strokeLinecap="round" fill="none"/>
              <path d="M 12,16 C 10,24 8,30 6,36" stroke="var(--color-warm)" strokeWidth="0.6" strokeLinecap="round" fill="none"/>
              <path d="M 26,14 C 28,22 30,28 31,36" stroke="var(--color-warm)" strokeWidth="0.6" strokeLinecap="round" fill="none"/>
              <circle cx="8.5" cy="6" r="0.5" fill="var(--color-warm)"/>
            </svg>
          </button>

          {/* History (top-right) - brushmarks */}
          <button
            onClick={() => onNavigate("history")}
            className="relative z-10 flex items-center justify-center"
            style={{ background: "transparent" }}
          >
            <svg width="56" height="56" viewBox="0 0 40 40" fill="none">
              <path d="M 8,10 C 12,9 20,10 32,11" stroke="rgba(245,247,248,0.3)" strokeWidth="0.7" strokeLinecap="round" fill="none"/>
              <path d="M 8,20 C 14,19 24,21 32,20" stroke="rgba(245,247,248,0.3)" strokeWidth="0.5" strokeLinecap="round" fill="none" opacity="0.6"/>
              <path d="M 8,30 C 16,29 22,31 32,30" stroke="rgba(245,247,248,0.3)" strokeWidth="0.4" strokeLinecap="round" fill="none" opacity="0.3"/>
            </svg>
          </button>

          {/* Sleep (bottom-left) - moon crescent */}
          <button
            onClick={() => onNavigate("sleep")}
            className="relative z-10 flex items-center justify-center"
            style={{ background: "transparent" }}
          >
            <svg width="56" height="56" viewBox="0 0 40 40" fill="none">
              <path d="M 22,6 C 14,8 10,14 10,22 C 10,28 16,34 24,34 C 28,34 31,32 33,29 C 28,32 20,30 16,24 C 12,18 14,10 22,6" stroke="rgba(245,247,248,0.3)" strokeWidth="0.6" strokeLinecap="round" fill="none"/>
            </svg>
          </button>

          {/* Coach (bottom-right) - basecamp tent */}
          <button
            onClick={() => onNavigate("coach")}
            className="relative z-10 flex items-center justify-center"
            style={{ background: "transparent" }}
          >
            <svg width="56" height="56" viewBox="0 0 40 40" fill="none">
              <path d="M 10,28 L 20,12 L 30,28" stroke="rgba(245,247,248,0.3)" strokeWidth="0.6" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              <path d="M 17,28 C 18,22 20,18 20,16" stroke="rgba(245,247,248,0.3)" strokeWidth="0.4" strokeLinecap="round" fill="none" opacity="0.5"/>
              <path d="M 23,28 C 22,22 20,18 20,16" stroke="rgba(245,247,248,0.3)" strokeWidth="0.4" strokeLinecap="round" fill="none" opacity="0.5"/>
              <path d="M 4,28 C 12,27 28,27 36,28" stroke="rgba(245,247,248,0.3)" strokeWidth="0.5" strokeLinecap="round" fill="none" opacity="0.3"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Today's activities below the grid */}
      {todaysActivities.length > 0 && (
        <div className="px-5 mt-6">
          <TrailDivider className="mb-5" />
          <TrailDivider />
          {todaysActivities.map((a) => (
            <ActivityCard
              key={a.id}
              activity={a}
              token={settings?.mapboxToken}
              onClick={() => onOpenDetail(a.id)}
            />
          ))}
        </div>
      )}

      {/* Streak */}
      {streak > 1 && (
        <div className="px-5 pb-8">
          <div className="text-sm" style={{ color: "var(--color-accent)", fontFamily: "var(--font-haas)", fontWeight: 300, opacity: 0.8 }}>
            {streak}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main App ────────────────────────────────────────────────────────────────

export default function App() {
  const [view, setView] = useState("home");
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
  const bleConnectedRef = useRef(null);

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

        // Load today's body data (fetch yesterday too, since sleep sessions are keyed to the night they started)
        if (s?.ouraToken) {
          const d = today();
          const yesterday = daysAgo(1);
          const oura = await fetchOura(s.ouraToken, yesterday, d);
          const todaySleep = oura.daily_sleep?.find((x) => x.day === d);
          const todayReadiness = oura.daily_readiness?.find((x) => x.day === d);
          // Sleep session: prefer today's, fall back to yesterday's (last night's sleep)
          const session = oura.sleep?.find((x) => x.day === d) || oura.sleep?.find((x) => x.day === yesterday);
          if (todaySleep || todayReadiness || session) {
            setDaily((prev) => ({
              ...prev,
              [d]: {
                sleep_score: todaySleep?.score,
                readiness_score: todayReadiness?.score,
                hrv: session?.average_hrv ? Math.round(session.average_hrv) : null,
                rhr: session?.average_heart_rate ? Math.round(session.average_heart_rate) : null,
                total_sleep: session?.total_sleep_duration,
                contributors: todayReadiness?.contributors,
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

      // Center on user's position immediately
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { longitude, latitude } = pos.coords;
          map.flyTo({ center: [longitude, latitude], zoom: 16, duration: 1000 });
          if (!markerRef.current) {
            const el = document.createElement("div");
            el.style.cssText = "width:12px;height:12px;background:#5ae6de;border-radius:50%;border:2px solid #020304;box-shadow:0 0 8px #5ae6de80";
            markerRef.current = new mapboxgl.Marker(el).setLngLat([longitude, latitude]).addTo(map);
          }
        },
        () => {},
        { enableHighAccuracy: true, timeout: 5000 }
      );
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
            el.style.cssText = "width:12px;height:12px;background:#5ae6de;border-radius:50%;border:2px solid #020304;box-shadow:0 0 8px #5ae6de80";
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

  // BLE HR connection
  const connectHR = useCallback(async (deviceId) => {
    try {
      await BleClient.initialize();
      await BleClient.connect(deviceId, () => {
        bleConnectedRef.current = null;
      });
      bleConnectedRef.current = deviceId;
      await BleClient.startNotifications(deviceId, HR_SERVICE, HR_CHARACTERISTIC, (dataView) => {
        const hr = parseHeartRate(dataView);
        if (hr > 0 && hr < 250) {
          setRecording((prev) => {
            if (!prev) return prev;
            const hrSamples = [...(prev.hrSamples || []), hr];
            return {
              ...prev,
              currentHR: hr,
              avgHR: Math.round(hrSamples.reduce((a, b) => a + b, 0) / hrSamples.length),
              maxHR: Math.max(prev.maxHR || 0, hr),
              hrSamples,
            };
          });
        }
      });
    } catch (err) {
      console.error("BLE HR connect failed:", err);
      bleConnectedRef.current = null;
    }
  }, []);

  const disconnectHR = useCallback(async () => {
    const deviceId = bleConnectedRef.current;
    if (!deviceId) return;
    try {
      await BleClient.stopNotifications(deviceId, HR_SERVICE, HR_CHARACTERISTIC);
      await BleClient.disconnect(deviceId);
    } catch (err) {
      console.error("BLE HR disconnect:", err);
    }
    bleConnectedRef.current = null;
  }, []);

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
        avgHR: null,
        maxHR: null,
        hrSamples: [],
        cadence: null,
        calories: null,
        splits: [],
      };
      setRecording(newRec);
      routeRef.current = [];

      // Keep screen on during recording
      KeepAwake.keepAwake().catch(() => {});

      if (type !== "Yoga") {
        if (isNative) {
          BackgroundGeolocation.addWatcher(
            {
              backgroundMessage: "Andes is recording your activity",
              backgroundTitle: "Andes",
              requestPermissions: true,
              stale: false,
              distanceFilter: 5,
            },
            (position, error) => {
              if (error) {
                console.error("GPS:", error);
                return;
              }
              if (position) {
                addPoint({
                  coords: {
                    latitude: position.latitude,
                    longitude: position.longitude,
                    altitude: position.altitude,
                  },
                  timestamp: position.time || Date.now(),
                });
              }
            }
          ).then((id) => {
            watchIdRef.current = id;
          });
        } else {
          const id = navigator.geolocation.watchPosition(addPoint, (err) => console.error("GPS:", err), {
            enableHighAccuracy: true,
            maximumAge: 2000,
            timeout: 10000,
          });
          watchIdRef.current = id;
        }
      }

      // Auto-connect BLE HR monitor if paired
      if (settings?.hrDeviceId) {
        connectHR(settings.hrDeviceId);
      }
    },
    [addPoint, settings?.hrDeviceId, connectHR]
  );

  const pauseRecording = useCallback(() => {
    setRecording((prev) => {
      if (!prev) return prev;
      return { ...prev, isPaused: true, pausedAt: Date.now() };
    });
  }, []);

  const resumeRecording = useCallback(() => {
    setRecording((prev) => {
      if (!prev) return prev;
      const pauseDuration = Date.now() - prev.pausedAt;
      return { ...prev, isPaused: false, pausedAt: null, pausedTime: prev.pausedTime + pauseDuration };
    });
  }, []);

  const stopRecording = useCallback(async () => {
    if (!recording) return;

    // Allow screen to sleep again
    KeepAwake.allowSleep().catch(() => {});

    // Disconnect BLE HR
    await disconnectHR();

    if (watchIdRef.current !== null) {
      if (isNative) {
        BackgroundGeolocation.removeWatcher({ id: watchIdRef.current });
      } else {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      watchIdRef.current = null;
    }

    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }

    const elapsed = recording.isPaused
      ? (recording.pausedAt - recording.startTime - recording.pausedTime) / 1000
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
      start_date_local: toLocalISO(new Date(recording.startTime)),
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
  }, [recording, activities, disconnectHR]);

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
      // Load body data for that day (include day before for sleep session)
      const activity = activities[id];
      if (activity && settings?.ouraToken) {
        const d = dateKey(activity.start_date_local);
        if (!daily[d]) {
          try {
            const prevDay = dateKey(new Date(new Date(d + "T12:00:00").getTime() - 86400000));
            const oura = await fetchOura(settings.ouraToken, prevDay, d);
            const sleep = oura.daily_sleep?.find((x) => x.day === d);
            const readiness = oura.daily_readiness?.find((x) => x.day === d);
            const session = oura.sleep?.find((x) => x.day === d) || oura.sleep?.find((x) => x.day === prevDay);
            if (sleep || readiness || session) {
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
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--color-bg)" }}>
        <div className="text-label-lg" style={{ color: "var(--color-text-dim)" }}>Loading...</div>
      </div>
    );
  }

  // ─── Views ──────────────────────────────────────────────────────────────

  return (
    <>
      {/* Home screen is always rendered as base */}
      <HomeScreen
        onNavigate={setView}
        todaysActivities={todaysActivities}
        daily={daily}
        activities={activities}
        settings={settings}
        onOpenDetail={openDetail}
        onStartRecord={() => setTypeSelect(true)}
      />

      {/* Inner screens overlay on top */}
      {view === "history" && (
        <HistoryScreen
          activities={activities}
          historyFilter={historyFilter}
          setHistoryFilter={setHistoryFilter}
          historyTypes={historyTypes}
          groupedByMonth={groupedByMonth}
          onOpenDetail={openDetail}
          onBack={() => setView("home")}
        />
      )}

      {view === "sleep" && (
        <SleepScreen
          daily={daily[today()]}
          onBack={() => setView("home")}
        />
      )}

      {view === "coach" && (
        <CoachScreen
          activities={activities}
          onBack={() => setView("home")}
        />
      )}

      {view === "settings" && (
        <SettingsView
          settings={settings}
          onSave={saveSettings}
          onImportStrava={importStrava}
          onBack={() => setView("home")}
        />
      )}

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
    </>
  );
}
