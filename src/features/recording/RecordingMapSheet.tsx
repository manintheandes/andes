import { useEffect, useRef } from "react";
import type { Feature, LineString } from "geojson";
import type { GeoJSONSource, Map as MapboxMap, Marker as MapboxMarker } from "mapbox-gl";
import type { RecordingPoint } from "../../types";
import { EmptyState } from "../../ui/EmptyState";

import { MapIcon, CloseIcon } from "../home/HomeScreen";

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
      const el = document.createElement("div");
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 40 40");
      svg.setAttribute("width", "32");
      svg.setAttribute("height", "32");
      svg.setAttribute("fill", "none");
      for (const d of ["M 10,2 C 8,6 7,12 8,16 C 16,12 26,12 32,16", "M 12,16 C 10,24 8,30 6,36", "M 26,14 C 28,22 30,28 31,36"]) {
        const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
        p.setAttribute("d", d);
        p.setAttribute("stroke", "#5ae6de");
        p.setAttribute("stroke-width", "0.6");
        p.setAttribute("stroke-linecap", "round");
        p.setAttribute("fill", "none");
        svg.appendChild(p);
      }
      const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c.setAttribute("cx", "8.5"); c.setAttribute("cy", "6"); c.setAttribute("r", "0.5"); c.setAttribute("fill", "#5ae6de");
      svg.appendChild(c);
      el.appendChild(svg);
      const marker = new mapboxRef.current.Marker({ element: el, anchor: "bottom" });
      markerRef.current = marker.setLngLat([last.lng, last.lat]).addTo(map);
    } else {
      markerRef.current?.setLngLat([last.lng, last.lat]);
    }
    map.easeTo({ center: [last.lng, last.lat], zoom: 15, duration: 700 });
  }, [open, points, routeData]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "var(--color-bg)" }}>
      <div className="flex items-center justify-between px-5 pb-4 pt-6">
        <MapIcon size={22} />
        <button onClick={onClose} className="transition-opacity active:opacity-50" aria-label="Close">
          <CloseIcon size={20} />
        </button>
      </div>
      {!token ? (
        <div className="relative z-[1] px-5">
          <EmptyState title="No map token." />
        </div>
      ) : points.length < 2 ? (
        <div className="relative z-[1] px-5">
          <EmptyState title="Waiting for GPS." />
        </div>
      ) : (
        <div ref={mapRef} className="relative z-[1] mx-4 mb-4 flex-1 overflow-hidden rounded-[32px]" />
      )}
    </div>
  );
}
