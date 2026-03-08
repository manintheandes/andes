import { useEffect, useRef } from "react";
import type { RecordingDraft } from "../../types";
import { formatDistance, formatDuration, formatPace, formatSpeed } from "../../lib/utils/format";
import { BottomActionBar } from "../../ui/BottomActionBar";
import { AlpacaIcon, MapIcon, GpsIcon, HeartIcon, TrailDivider, PauseIcon, PlayIcon, StopIcon, CheckIcon, CloseIcon, SettingsIcon } from "../home/HomeScreen";

interface RecordingScreenProps {
  draft: RecordingDraft;
  elapsedSeconds: number;
  mapboxToken: string;
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
        const m = new mapboxgl.Marker({ color: "#5ae6de", scale: 0.6 }).setLngLat([points[points.length - 1].lng, points[points.length - 1].lat]).addTo(map);
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

export function RecordingScreen({ draft, elapsedSeconds, mapboxToken, onPause, onResume, onStop, onDiscard, onOpenMap, onOpenLocationSettings }: RecordingScreenProps) {
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
        {/* Top bar: alpaca icon left, Map icon center, sensor icon right */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <AlpacaIcon size={24} />
          <button
            onClick={onOpenMap}
            className="transition-opacity active:opacity-50"
          >
            <MapIcon size={22} color={mapActive ? "#5ae6de" : "rgba(90,230,222,0.3)"} />
          </button>
          <div className="inline-flex items-center gap-1.5">
            {isHrMode ? (
              <HeartIcon size={20} color={sensorColor} />
            ) : (
              <GpsIcon size={20} color={sensorColor} />
            )}
            <span
              aria-hidden="true"
              style={{
                width: "0.38rem",
                height: "0.38rem",
                borderRadius: "999px",
                background: sensorActive ? "var(--color-accent)" : "transparent",
              }}
            />
          </div>
        </div>

        {/* HR display if available */}
        {draft.currentHR ? (
          <div className="text-right px-5" style={{ color: "var(--color-accent)", fontSize: "1.2rem", fontWeight: 200 }}>
            {draft.currentHR} <span style={{ fontSize: "0.55rem", color: "rgba(90,230,222,0.5)", letterSpacing: "0.06em", textTransform: "uppercase" }}>bpm</span>
          </div>
        ) : null}

        {/* Status icon */}
        {isPausedState ? (
          <div className="flex justify-center px-5 pt-4">
            {isRecovery ? <PlayIcon size={32} color="rgba(90,230,222,0.5)" /> : <PauseIcon size={32} color="rgba(90,230,222,0.5)" />}
          </div>
        ) : draft.status === "starting" ? (
          <div className="flex justify-center px-5 pt-4">
            <GpsIcon size={32} color={draft.sensorStatus.gps === "ready" ? "#5ae6de" : "rgba(90,230,222,0.3)"} />
          </div>
        ) : null}

        {/* Primary stat grid: time, distance, pace */}
        <div className="px-5 pt-8">
          <div className="grid grid-cols-3 gap-4 text-center" style={dimStyle}>
            <div>
              <div className="tabular-nums" style={{ fontSize: "1.6rem", fontWeight: 200, letterSpacing: "-0.04em", color: "var(--color-text)" }}>
                {formatDuration(elapsedSeconds)}
              </div>
              <div style={{ fontSize: "0.55rem", color: "#444", letterSpacing: "0.06em", textTransform: "uppercase", marginTop: 2 }}>time</div>
            </div>
            <div>
              <div className="tabular-nums" style={{ fontSize: "1.6rem", fontWeight: 200, letterSpacing: "-0.04em", color: "var(--color-text)" }}>
                {moving ? formatDistance(draft.liveDistance || draft.distance) : "--"}
              </div>
              <div style={{ fontSize: "0.55rem", color: "#444", letterSpacing: "0.06em", textTransform: "uppercase", marginTop: 2 }}>mi</div>
            </div>
            <div>
              <div className="tabular-nums" style={{ fontSize: "1.6rem", fontWeight: 200, letterSpacing: "-0.04em", color: "var(--color-text)" }}>
                {moving ? paceSpeed : "--"}
              </div>
              <div style={{ fontSize: "0.55rem", color: "#444", letterSpacing: "0.06em", textTransform: "uppercase", marginTop: 2 }}>{paceUnit}</div>
            </div>
          </div>
        </div>

        {/* Trail divider */}
        <div className="px-5 py-4">
          <TrailDivider />
        </div>

        {/* Secondary stats: heart, elev, confidence */}
        <div className="px-5">
          <div className="grid grid-cols-3 gap-4 text-center" style={dimStyle}>
            <div>
              <div className="tabular-nums" style={{ fontSize: "1.1rem", fontWeight: 200, letterSpacing: "-0.04em", color: draft.currentHR ? "var(--color-accent)" : "var(--color-text-soft)" }}>
                {draft.currentHR ?? "--"}
              </div>
              <div style={{ fontSize: "0.55rem", color: "#444", letterSpacing: "0.06em", textTransform: "uppercase", marginTop: 2 }}>bpm</div>
            </div>
            <div>
              <div className="tabular-nums" style={{ fontSize: "1.1rem", fontWeight: 200, letterSpacing: "-0.04em", color: "var(--color-text-soft)" }}>
                {Math.round(draft.elevGain)}
              </div>
              <div style={{ fontSize: "0.55rem", color: "#444", letterSpacing: "0.06em", textTransform: "uppercase", marginTop: 2 }}>ft</div>
            </div>
            <div>
              <div className="tabular-nums" style={{ fontSize: "1.1rem", fontWeight: 200, letterSpacing: "-0.04em", color: "var(--color-text-soft)" }}>
                {draft.points.length}
              </div>
              <div style={{ fontSize: "0.55rem", color: "#444", letterSpacing: "0.06em", textTransform: "uppercase", marginTop: 2 }}>pts</div>
            </div>
          </div>
        </div>

        {/* Inline map */}
        {moving && mapboxToken ? <InlineMap token={mapboxToken} points={draft.points} /> : null}
      </div>

      {/* Bottom actions */}
      <div className="shrink-0 px-5 pb-[max(var(--safe-bottom),16px)] pt-4 relative z-[1]">
        {draft.error ? <div className="text-center mb-3" style={{ color: "var(--color-text-soft)", fontSize: "0.85rem" }}>{draft.error}</div> : null}
        <BottomActionBar
          actions={
            draft.locationBlocked
              ? [
                  { label: "Settings", icon: <SettingsIcon size={24} color="#081314" />, onPress: onOpenLocationSettings, tone: "primary" },
                  { label: "Discard", icon: <CloseIcon size={18} color="var(--color-text-soft)" />, onPress: onDiscard, tone: "ghost" },
                ]
              : isRecovery
              ? [
                  { label: "Resume", icon: <PlayIcon size={24} color="#081314" />, onPress: onResume, tone: "primary" },
                  { label: "Save", icon: <CheckIcon size={22} color="var(--color-text)" />, onPress: onStop, tone: "secondary" },
                  { label: "Discard", icon: <CloseIcon size={18} color="var(--color-text-soft)" />, onPress: onDiscard, tone: "ghost" },
                ]
              : draft.status === "paused"
              ? [
                  { label: "Resume", icon: <PlayIcon size={24} color="#081314" />, onPress: onResume, tone: "primary" },
                  { label: "Save", icon: <CheckIcon size={22} color="var(--color-text)" />, onPress: onStop, tone: "secondary" },
                  { label: "Discard", icon: <CloseIcon size={18} color="var(--color-text-soft)" />, onPress: onDiscard, tone: "ghost" },
                ]
              : [
                  { label: "Pause", icon: <PauseIcon size={22} color="var(--color-text)" />, onPress: onPause, tone: "secondary" },
                  { label: "Stop", icon: <StopIcon size={24} color="#081314" />, onPress: onStop, tone: "primary", disabled: draft.status === "saving" },
                ]
          }
        />
      </div>
    </div>
  );
}
