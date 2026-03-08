import { allowCors, type ApiRequest, type ApiResponse } from "../_lib/http.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (allowCors(req, res)) return;
  res.status(200).json({ ok: true });
}
