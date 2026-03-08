export function dateKey(value: Date | string | number): string {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function todayKey(): string {
  return dateKey(new Date());
}

export function daysAgoKey(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return dateKey(date);
}

export function localIso(value: Date | string | number): string {
  const date = value instanceof Date ? value : new Date(value);
  const pad = (input: number) => String(input).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function formatClock(value: string): string {
  const date = new Date(value);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const suffix = hours >= 12 ? "PM" : "AM";
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

export function formatDateFull(value: string): string {
  const date = new Date(value);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function getDayBounds(day: string, timeZone: string): { start: string; end: string; timeZone: string } {
  const anchor = new Date(`${day}T12:00:00`);
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(formatter.formatToParts(anchor).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  const dayPrefix = `${parts.year}-${parts.month}-${parts.day}`;
  return {
    start: `${dayPrefix}T00:00:00`,
    end: `${dayPrefix}T23:59:59`,
    timeZone,
  };
}
