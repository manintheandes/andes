export const MILE = 1609.34;

export function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const radius = 6371000;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function encodePolyline(coords: Array<[number, number]>): string {
  let result = "";
  let previousLat = 0;
  let previousLng = 0;
  for (const [lat, lng] of coords) {
    const deltaLat = Math.round(lat * 1e5) - previousLat;
    const deltaLng = Math.round(lng * 1e5) - previousLng;
    previousLat += deltaLat;
    previousLng += deltaLng;
    for (let value of [deltaLat, deltaLng]) {
      value = value < 0 ? ~(value << 1) : value << 1;
      while (value >= 0x20) {
        result += String.fromCharCode((0x20 | (value & 0x1f)) + 63);
        value >>= 5;
      }
      result += String.fromCharCode(value + 63);
    }
  }
  return result;
}
