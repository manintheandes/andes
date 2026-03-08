export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { key } = req.query;
  if (!key) return res.status(400).json({ error: "key required" });

  const UPSTASH_URL = process.env.KV_REST_API_URL;
  const UPSTASH_TOKEN = process.env.KV_REST_API_TOKEN;

  try {
    const resp = await fetch(`${UPSTASH_URL}/get/${key}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    });
    const data = await resp.json();
    const value = data.result ? JSON.parse(data.result) : null;
    return res.status(200).json({ value });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
