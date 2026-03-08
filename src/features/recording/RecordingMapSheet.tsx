import { useEffect, useRef } from "react";
import type { Feature, LineString } from "geojson";
import type { GeoJSONSource, Map as MapboxMap, Marker as MapboxMarker } from "mapbox-gl";
import type { RecordingPoint } from "../../types";
import { EmptyState } from "../../ui/EmptyState";

interface RecordingMapSheetProps {
  open: boolean;
  token: string;
  points: RecordingPoint[];
  onClose: () => void;
  onReady: (ready: boolean) => void;
}

let mapCssPromise: Promise<unknown> | null = null;

export function RecordingMapSheet({ open, token, points, onClose, onReady }: RecordingMapSheetProps) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<MapboxMap | null>(null);
  const markerRef = useRef<MapboxMarker | null>(null);
  const mapboxRef = useRef<null | typeof import("mapbox-gl")>(null);

  const routeData: Feature<LineString> = {
    type: "Feature",
    properties: {},
    geometry: {
      type: "LineString",
      coordinates: points.map((point) => [point.lng, point.lat]),
    },
  };

  useEffect(() => {
    if (!open || !mapRef.current || !token) return;
    let active = true;

    void (async () => {
      mapCssPromise ??= import("mapbox-gl/dist/mapbox-gl.css");
      const [{ default: mapboxgl }] = await Promise.all([import("mapbox-gl"), mapCssPromise]);
      mapboxRef.current = mapboxgl as unknown as typeof mapboxRef.current;
      mapboxgl.accessToken = token;
      if (!active || !mapRef.current) return;
      const mapInstance = new mapboxgl.Map({
        container: mapRef.current,
        style: "mapbox://styles/mapbox/dark-v11",
        center: points.length ? [points[0].lng, points[0].lat] : [-122.24, 37.77],
        zoom: 14,
        attributionControl: false,
      });
      mapInstanceRef.current = mapInstance;
      mapInstance.on?.("load", () => {
        if (!mapInstance.getSource("route")) {
          mapInstance.addSource("route", {
            type: "geojson",
            data: routeData,
          });
        }
        mapInstance.addLayer({
          id: "route",
          type: "line",
          source: "route",
          paint: { "line-color": "#5ae6de", "line-width": 3.5, "line-opacity": 0.9 },
        });
        onReady(true);
      });
    })();

    return () => {
      active = false;
      onReady(false);
      markerRef.current?.remove();
      markerRef.current = null;
      mapInstanceRef.current?.remove();
      mapInstanceRef.current = null;
    };
  }, [open, onReady, token]);

  useEffect(() => {
    if (!open || !mapInstanceRef.current) return;
      const map = mapInstanceRef.current;
    const source = map.getSource("route") as GeoJSONSource | undefined;
    if (source) {
      source.setData(routeData);
    }
    const last = points[points.length - 1];
    if (!last) return;
    if (!markerRef.current && mapboxRef.current?.Marker) {
      const marker = new mapboxRef.current.Marker({ color: "#5ae6de" });
      markerRef.current = marker.setLngLat([last.lng, last.lat]).addTo(map);
    } else {
      markerRef.current?.setLngLat([last.lng, last.lat]);
    }
    map.easeTo({ center: [last.lng, last.lat], zoom: 15, duration: 700 });
  }, [open, points, routeData]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "rgba(4,5,6,0.97)" }}>
      <div className="flex items-center justify-between px-5 pb-4 pt-6">
        <div style={{ fontFamily: "var(--font-sharp)", textTransform: "uppercase", letterSpacing: "0.12em", fontSize: "0.74rem", color: "var(--color-text-dim)" }}>
          Live Map
        </div>
        <button onClick={onClose} style={{ color: "var(--color-text-soft)" }}>
          Close
        </button>
      </div>
      {!token ? (
        <div className="px-5">
          <EmptyState title="Map token missing" detail="Add your Mapbox token in Settings to open the live route sheet." />
        </div>
      ) : points.length < 2 ? (
        <div className="px-5">
          <EmptyState title="Waiting for route." detail="As soon as GPS settles and points begin streaming, the map will lock on and follow the session." />
        </div>
      ) : (
        <div ref={mapRef} className="mx-4 mb-4 flex-1 overflow-hidden rounded-[32px]" />
      )}
    </div>
  );
}
