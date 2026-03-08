import { createSessionToken, validatePassword } from "../_lib/auth.js";
import { allowCors, readBody, type ApiRequest, type ApiResponse } from "../_lib/http.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (allowCors(req, res)) return;
  const body = readBody<{ password?: string }>(req);
  if (!validatePassword(body.password || "")) {
    res.status(401).json({ error: "Invalid password" });
    return;
  }
  res.status(200).json(createSessionToken());
}
