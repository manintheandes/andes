import { useEffect, useRef } from "react";
import type { RecordingDraft } from "../../types";
import { formatDistance, formatDuration, formatPace, formatSpeed } from "../../lib/utils/format";
import { BottomActionBar } from "../../ui/BottomActionBar";
import { AlpacaIcon, BackIcon, MapIcon, GpsIcon, HeartIcon, TrailDivider, PauseIcon, PlayIcon, StopIcon, RecordIcon, CheckIcon, CloseIcon, SettingsIcon } from "../home/HomeScreen";

interface RecordingScreenProps {
  draft: RecordingDraft | null;
  elapsedSeconds: number;
  mapboxToken: string;
  gpsCallbackCount?: number;
  nativeStatus?: { nativeCount: number; jsCount: number; savedCallExists: boolean } | null;
  onStart?: () => void;
  onCancel?: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onDiscard: () => void;
  onOpenMap: () => void;
  onOpenLocationSettings: () => void;
}

function InlineMap({ token, points }: { token: string; points: { lat: number; lng: number }[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  const markerRef = useRef<unknown>(null);

  useEffect(() => {
    if (!token || points.length < 2 || !containerRef.current || mapRef.current) return;
    let active = true;
    void (async () => {
      const { default: mapboxgl } = await import("mapbox-gl");
      await import("mapbox-gl/dist/mapbox-gl.css");
      if (!active || !containerRef.current) return;
      mapboxgl.accessToken = token;
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/dark-v11",
        center: [points[0].lng, points[0].lat],
        zoom: 15,
        attributionControl: false,
        interactive: false,
      });
      mapRef.current = map;
      map.on("load", () => {
        map.addSource("route", {
          type: "geojson",
          data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: points.map((p) => [p.lng, p.lat]) } },
        });
        map.addLayer({ id: "route", type: "line", source: "route", paint: { "line-color": "#5ae6de", "line-width": 3, "line-opacity": 0.9 } });
        const el = document.createElement("div");
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", "0 0 40 40");
        svg.setAttribute("width", "28");
        svg.setAttribute("height", "28");
        svg.setAttribute("fill", "none");
        const paths = [
          "M 10,2 C 8,6 7,12 8,16 C 16,12 26,12 32,16",
          "M 12,16 C 10,24 8,30 6,36",
          "M 26,14 C 28,22 30,28 31,36",
        ];
        for (const d of paths) {
          const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
          p.setAttribute("d", d);
          p.setAttribute("stroke", "#5ae6de");
          p.setAttribute("stroke-width", "0.6");
          p.setAttribute("stroke-linecap", "round");
          p.setAttribute("fill", "none");
          svg.appendChild(p);
        }
        const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        c.setAttribute("cx", "8.5");
        c.setAttribute("cy", "6");
        c.setAttribute("r", "0.5");
        c.setAttribute("fill", "#5ae6de");
        svg.appendChild(c);
        el.appendChild(svg);
        const m = new mapboxgl.Marker({ element: el, anchor: "bottom" }).setLngLat([points[points.length - 1].lng, points[points.length - 1].lat]).addTo(map);
        markerRef.current = m;
      });
    })();
    return () => { active = false; };
  }, [token, points.length >= 2]);

  useEffect(() => {
    if (!mapRef.current || points.length < 2) return;
    const map = mapRef.current as import("mapbox-gl").Map;
    const source = map.getSource("route") as import("mapbox-gl").GeoJSONSource | undefined;
    if (source) {
      source.setData({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: points.map((p) => [p.lng, p.lat]) } });
    }
    const last = points[points.length - 1];
    if (markerRef.current) {
      (markerRef.current as import("mapbox-gl").Marker).setLngLat([last.lng, last.lat]);
    }
    map.easeTo({ center: [last.lng, last.lat], duration: 500 });
  }, [points]);

  if (points.length < 2) return null;
  return <div ref={containerRef} className="mx-4 mt-4 flex-1 min-h-[180px] overflow-hidden rounded-2xl" style={{ opacity: 0.85 }} />;
}

export function RecordingScreen({ draft, elapsedSeconds, mapboxToken, gpsCallbackCount = 0, nativeStatus, onStart, onCancel, onPause, onResume, onStop, onDiscard, onOpenMap, onOpenLocationSettings }: RecordingScreenProps) {
  // Pre-recording ready state: user sees the screen but hasn't tapped Record yet
  if (!draft) {
    return (
      <div className="fixed inset-0 z-40 flex flex-col" style={{ background: "var(--color-bg)" }}>
        <svg style={{ position: "absolute", inset: 0, pointerEvents: "none" }} viewBox="0 0 320 600" preserveAspectRatio="none">
          <path d="M 0,400 C 80,390 160,410 240,398 C 300,388 320,402 320,400" stroke="rgba(255,255,255,0.08)" strokeWidth="1" fill="none" />
        </svg>
        <div className="flex-1 min-h-0 relative z-[1]">
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <button onClick={onCancel} className="transition-opacity active:opacity-50" aria-label="Back">
              <BackIcon size={24} />
            </button>
          </div>
          <div className="px-5 pt-6" style={{ opacity: 0.3 }}>
            <div className="flex items-baseline justify-between">
              <div className="tabular-nums" style={{ fontSize: "4rem", fontWeight: 200, letterSpacing: "-0.04em", lineHeight: 0.95, color: "var(--color-text)" }}>0:00</div>
              <div style={{ fontSize: "0.7rem", color: "#444", letterSpacing: "0.12em", textTransform: "uppercase" }}>time</div>
            </div>
            <TrailDivider variant="peak" />
            <div className="flex items-baseline justify-between">
              <div className="tabular-nums" style={{ fontSize: "4rem", fontWeight: 200, letterSpacing: "-0.04em", lineHeight: 0.95, color: "var(--color-text)" }}>--</div>
              <div style={{ fontSize: "0.7rem", color: "#444", letterSpacing: "0.12em", textTransform: "uppercase" }}>mi</div>
            </div>
            <TrailDivider variant="peak" />
            <div className="flex items-baseline justify-between">
              <div className="tabular-nums" style={{ fontSize: "4rem", fontWeight: 200, letterSpacing: "-0.04em", lineHeight: 0.95, color: "var(--color-text)" }}>--</div>
              <div style={{ fontSize: "0.7rem", color: "#444", letterSpacing: "0.12em", textTransform: "uppercase" }}>/mi</div>
            </div>
            <TrailDivider variant="peak" />
            <div className="flex items-baseline justify-between">
              <div className="tabular-nums" style={{ fontSize: "4rem", fontWeight: 200, letterSpacing: "-0.04em", lineHeight: 0.95, color: "var(--color-text-soft)" }}>--</div>
              <div style={{ fontSize: "0.7rem", color: "#444", letterSpacing: "0.12em", textTransform: "uppercase" }}>bpm</div>
            </div>
          </div>
        </div>
        <div className="shrink-0 px-5 pb-[max(var(--safe-bottom),16px)] pt-4 relative z-[1]">
          <BottomActionBar actions={[
            { label: "Record", icon: <RecordIcon size={28} color="#081314" />, onPress: onStart ?? (() => {}), tone: "primary" },
          ]} />
        </div>
      </div>
    );
  }

  const moving = draft.type !== "Yoga";
  const isRecovery = draft.status === "recovery";
  const isPausedState = draft.status === "paused" || isRecovery;
  const displayMovementSpeed = draft.currentPaceMps ?? draft.averagePaceMps;
  const paceSpeed =
    draft.type === "Ride"
      ? displayMovementSpeed
        ? `${formatSpeed(displayMovementSpeed)}`
        : "--"
      : displayMovementSpeed
        ? `${formatPace(displayMovementSpeed)}`
        : "--";
  const paceUnit = draft.type === "Ride" ? "mph" : "/mi";

  const isHrMode = draft.sensorStatus.coros === "live" || draft.sensorStatus.coros === "reconnecting" || draft.sensorStatus.coros === "connecting";
  const sensorActive = isHrMode ? draft.sensorStatus.coros === "live" : draft.sensorStatus.gps === "ready";
  const sensorColor = sensorActive ? "#5ae6de" : "rgba(90,230,222,0.3)";
  const mapActive = draft.sensorStatus.mapReady;

  const dimStyle = isPausedState ? { opacity: 0.5 } : {};

  return (
    <div className="fixed inset-0 z-40 flex flex-col" style={{ background: "var(--color-bg)" }}>
      {/* Topo background */}
      <svg
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        viewBox="0 0 320 600"
        preserveAspectRatio="none"
      >
        <path d="M 0,400 C 80,390 160,410 240,398 C 300,388 320,402 320,400" stroke="rgba(255,255,255,0.08)" strokeWidth="1" fill="none" />
      </svg>

      <div className="flex-1 min-h-0 overflow-y-auto relative z-[1]">
        {/* Top bar: alpaca left, map right */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <AlpacaIcon size={24} />
          <button
            onClick={onOpenMap}
            className="transition-opacity active:opacity-50"
          >
            <MapIcon size={22} color={mapActive ? "#5ae6de" : "rgba(90,230,222,0.3)"} />
          </button>
        </div>

        {/* Stats: time, miles, heart rate — stacked rows with topo dividers */}
        <div className="px-5 pt-6" style={dimStyle}>
          <div className="flex items-baseline justify-between">
            <div className="tabular-nums" style={{ fontSize: "4rem", fontWeight: 200, letterSpacing: "-0.04em", lineHeight: 0.95, color: "var(--color-text)" }}>
              {formatDuration(elapsedSeconds)}
            </div>
            <div style={{ fontSize: "0.7rem", color: "#444", letterSpacing: "0.12em", textTransform: "uppercase" }}>time</div>
          </div>
          <TrailDivider variant="peak" />
          <div className="flex items-baseline justify-between">
            <div className="tabular-nums" style={{ fontSize: "4rem", fontWeight: 200, letterSpacing: "-0.04em", lineHeight: 0.95, color: "var(--color-text)" }}>
              {moving ? formatDistance(draft.liveDistance || draft.distance) : "--"}
            </div>
            <div style={{ fontSize: "0.7rem", color: "#444", letterSpacing: "0.12em", textTransform: "uppercase" }}>mi</div>
          </div>
          <TrailDivider variant="peak" />
          <div className="flex items-baseline justify-between">
            <div className="tabular-nums" style={{ fontSize: "4rem", fontWeight: 200, letterSpacing: "-0.04em", lineHeight: 0.95, color: "var(--color-text)" }}>
              {moving ? paceSpeed : "--"}
            </div>
            <div style={{ fontSize: "0.7rem", color: "#444", letterSpacing: "0.12em", textTransform: "uppercase" }}>{paceUnit}</div>
          </div>
          <TrailDivider variant="peak" />
          <div className="flex items-baseline justify-between">
            <div className="tabular-nums" style={{ fontSize: "4rem", fontWeight: 200, letterSpacing: "-0.04em", lineHeight: 0.95, color: draft.currentHR ? "var(--color-accent)" : "var(--color-text-soft)" }}>
              {draft.currentHR ?? "--"}
            </div>
            <div style={{ fontSize: "0.7rem", color: "#444", letterSpacing: "0.12em", textTransform: "uppercase" }}>bpm</div>
          </div>
        </div>

        {/* Inline map */}
        {moving && mapboxToken ? <InlineMap token={mapboxToken} points={draft.points} /> : null}
      </div>

      {/* Bottom actions */}
      <div className="shrink-0 px-5 pb-[max(var(--safe-bottom),16px)] pt-4 relative z-[1]">
        {draft.error ? <div className="text-center mb-3" style={{ color: "var(--color-text-soft)", fontSize: "0.85rem" }}>{draft.error}</div> : null}
        <div className="text-center mb-2" style={{ color: "#444", fontSize: "0.65rem", fontFamily: "monospace" }}>
          cb:{gpsCallbackCount} pts:{draft.points.length} d:{Math.round(draft.distance)}m spd:{(draft.currentPaceMps ?? 0).toFixed(1)} status:{draft.status}
        </div>
        {nativeStatus ? (
          <div className="text-center mb-2" style={{ color: nativeStatus.savedCallExists ? "#5ae6de" : "#f44", fontSize: "0.65rem", fontFamily: "monospace" }}>
            native:{nativeStatus.nativeCount} js:{nativeStatus.jsCount} saved:{nativeStatus.savedCallExists ? "Y" : "N"}
          </div>
        ) : null}
        <BottomActionBar
          actions={
            draft.locationBlocked
              ? [
                  { label: "Settings", icon: <SettingsIcon size={24} color="#081314" />, onPress: onOpenLocationSettings, tone: "primary" },
                ]
              : isPausedState
              ? [
                  { label: "Record", icon: <RecordIcon size={28} color="#081314" />, onPress: onResume, tone: "primary" },
                  { label: "Stop", icon: <StopIcon size={26} color="#081314" />, onPress: onStop, tone: "primary" },
                ]
              : [
                  { label: "Record", icon: <RecordIcon size={28} color="#081314" />, onPress: onPause, tone: "primary" },
                  { label: "Stop", icon: <StopIcon size={26} color="#081314" />, onPress: onStop, tone: "primary", disabled: draft.status === "saving" },
                ]
          }
        />
      </div>
    </div>
  );
}
