export interface ApiRequest {
  method?: string;
  query: Record<string, string | string[] | undefined>;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

export interface ApiResponse {
  status: (code: number) => ApiResponse;
  json: (payload: unknown) => void;
  end: (body?: string) => void;
  setHeader: (key: string, value: string) => void;
}

export function header(req: ApiRequest, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

export function allowCors(req: ApiRequest, res: ApiResponse): boolean {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-oura-token, x-strava-client-id, x-strava-client-secret, x-strava-refresh-token, x-andes-day, x-andes-timezone",
  );
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return true;
  }
  return false;
}

export function readBody<T>(req: ApiRequest): T {
  if (!req.body) return {} as T;
  if (typeof req.body === "string") {
    return JSON.parse(req.body) as T;
  }
  return req.body as T;
}
