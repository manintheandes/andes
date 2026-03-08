import { encodePolyline } from "../lib/utils/geo";
import type { RecordingPoint } from "../types";

interface StaticMapProps {
  polyline?: string | null;
  points?: RecordingPoint[];
  token: string;
  height?: number;
}

export function StaticMap({ polyline, points, token, height = 220 }: StaticMapProps) {
  const encoded = polyline || (points && points.length > 1 ? encodePolyline(points.map((point) => [point.lat, point.lng] as [number, number])) : null);
  if (!token || !encoded) {
    return (
      <div
        className="flex items-center justify-center rounded-[24px]"
        style={{ height, background: "rgba(255,255,255,0.015)", border: "1px solid var(--color-border)" }}
      >
        <div
          style={{
            color: token ? "var(--color-text-dim)" : "var(--color-accent)",
            fontFamily: "var(--font-sharp)",
            textTransform: "uppercase",
            letterSpacing: "0.14em",
            fontSize: "0.72rem",
          }}
        >
          {token ? "Route pending" : "Map token needed"}
        </div>
      </div>
    );
  }
  const src = `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/path-3+5ae6de-0.9(${encodeURIComponent(encoded)})/auto/900x${Math.round(height * 2)}@2x?access_token=${token}&padding=40&logo=false&attribution=false`;
  return <img src={src} alt="" className="w-full rounded-[24px] object-cover" style={{ height }} />;
}
