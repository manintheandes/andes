const MILE = 1609.34;

export function formatDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.round(totalSeconds || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = Math.floor(safeSeconds % 60);
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatDistance(meters: number): string {
  return (Math.max(0, meters || 0) / MILE).toFixed(2);
}

export function formatPace(metersPerSecond: number): string {
  if (!metersPerSecond || metersPerSecond <= 0) return "--";
  const secondsPerMile = MILE / metersPerSecond;
  const minutes = Math.floor(secondsPerMile / 60);
  const seconds = Math.floor(secondsPerMile % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatSpeed(metersPerSecond: number): string {
  if (!metersPerSecond || metersPerSecond <= 0) return "--";
  return (metersPerSecond * 2.23694).toFixed(1);
}

export function formatElevation(meters: number): string {
  return Math.round(Math.max(0, meters || 0) * 3.28084).toLocaleString();
}

export function formatBodyDuration(seconds: number | null): string {
  if (!seconds) return "--";
  return formatDuration(seconds);
}
