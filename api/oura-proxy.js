export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-oura-token");
  if (req.method === "OPTIONS") return res.status(200).end();

  const token = req.headers["x-oura-token"];
  if (!token) return res.status(401).json({ error: "Oura token required" });

  const { start, end } = req.query;
  if (!start || !end) return res.status(400).json({ error: "start and end dates required" });

  const headers = { Authorization: `Bearer ${token}` };
  const base = "https://api.ouraring.com/v2/usercollection";

  try {
    const [sleepResp, readinessResp, sessionsResp, hrResp] = await Promise.all([
      fetch(`${base}/daily_sleep?start_date=${start}&end_date=${end}`, { headers }),
      fetch(`${base}/daily_readiness?start_date=${start}&end_date=${end}`, { headers }),
      fetch(`${base}/sleep?start_date=${start}&end_date=${end}`, { headers }),
      fetch(`${base}/heartrate?start_datetime=${start}T00:00:00-08:00&end_datetime=${end}T23:59:59-08:00`, { headers }),
    ]);

    const daily_sleep = sleepResp.ok ? (await sleepResp.json()).data : [];
    const daily_readiness = readinessResp.ok ? (await readinessResp.json()).data : [];
    const sleep = sessionsResp.ok ? (await sessionsResp.json()).data : [];
    const heartrate = hrResp.ok ? (await hrResp.json()).data : [];

    return res.status(200).json({ daily_sleep, daily_readiness, sleep, heartrate });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
