import type { ActivitySummary, RecordingPoint } from "../../types";

/**
 * Generate a GPX 1.1 XML string from an activity's track points.
 * Includes lat, lng, elevation, time, heart rate (as Garmin TrackPointExtension),
 * and speed as a custom extension.
 */
export function buildGpx(summary: ActivitySummary, points: RecordingPoint[]): string {
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    '<gpx version="1.1" creator="Alpaca" xmlns="http://www.topografix.com/GPX/1/1"' +
    ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"' +
    ' xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"' +
    ' xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">'
  );

  // Metadata
  lines.push("  <metadata>");
  lines.push(`    <name>${escapeXml(summary.name)}</name>`);
  lines.push(`    <time>${new Date(summary.start_date_local).toISOString()}</time>`);
  lines.push("  </metadata>");

  // Track
  lines.push("  <trk>");
  lines.push(`    <name>${escapeXml(summary.name)}</name>`);
  lines.push(`    <type>${escapeXml(summary.type)}</type>`);
  lines.push("    <trkseg>");

  for (const point of points) {
    lines.push(`      <trkpt lat="${point.lat.toFixed(7)}" lon="${point.lng.toFixed(7)}">`);
    lines.push(`        <ele>${point.alt.toFixed(1)}</ele>`);
    lines.push(`        <time>${new Date(point.time).toISOString()}</time>`);

    // Extensions: heart rate, speed
    const hasExtensions = point.hr != null || (point.speed != null && point.speed > 0);
    if (hasExtensions) {
      lines.push("        <extensions>");
      if (point.hr != null) {
        lines.push("          <gpxtpx:TrackPointExtension>");
        lines.push(`            <gpxtpx:hr>${point.hr}</gpxtpx:hr>`);
        lines.push("          </gpxtpx:TrackPointExtension>");
      }
      if (point.speed != null && point.speed > 0) {
        lines.push(`          <speed>${point.speed.toFixed(2)}</speed>`);
      }
      lines.push("        </extensions>");
    }

    lines.push("      </trkpt>");
  }

  lines.push("    </trkseg>");
  lines.push("  </trk>");
  lines.push("</gpx>");

  return lines.join("\n");
}

/**
 * Generate a filename for the GPX export.
 */
export function gpxFilename(summary: ActivitySummary): string {
  const date = summary.start_date_local.replace(/[T:]/g, "-").slice(0, 16);
  const sport = summary.type.toLowerCase();
  return `alpaca-${sport}-${date}.gpx`;
}

/**
 * Trigger a file download in the browser / web view.
 */
export function downloadGpx(xml: string, filename: string): void {
  const blob = new Blob([xml], { type: "application/gpx+xml" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  // Clean up after a tick
  setTimeout(() => {
    URL.revokeObjectURL(url);
    anchor.remove();
  }, 100);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
