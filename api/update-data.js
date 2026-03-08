export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { key, value } = req.body;
  if (!key || value === undefined) return res.status(400).json({ error: "key and value required" });

  const UPSTASH_URL = process.env.KV_REST_API_URL;
  const UPSTASH_TOKEN = process.env.KV_REST_API_TOKEN;

  try {
    const resp = await fetch(`${UPSTASH_URL}/set/${key}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${UPSTASH_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(value),
    });
    const data = await resp.json();
    return res.status(200).json({ ok: true, result: data.result });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
