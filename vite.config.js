import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const apiRoutes = new Map([
  ["/api/auth/login", "/api/auth/login.ts"],
  ["/api/auth/logout", "/api/auth/logout.ts"],
  ["/api/bootstrap", "/api/bootstrap.ts"],
  ["/api/activity", "/api/activity/index.ts"],
  ["/api/activity/save", "/api/activity/save.ts"],
  ["/api/activity/delete", "/api/activity/delete.ts"],
  ["/api/activity/comment", "/api/activity/comment.ts"],
  ["/api/activity/comment/backfill", "/api/activity/comment/backfill.ts"],
  ["/api/library/repair", "/api/library/repair.ts"],
  ["/api/integrations/oura/refresh", "/api/integrations/oura/refresh.ts"],
  ["/api/integrations/oura/backfill", "/api/integrations/oura/backfill.ts"],
  ["/api/integrations/strava/import", "/api/integrations/strava/import.ts"],
  ["/api/integrations/strava/connect", "/api/integrations/strava/connect.ts"],
  ["/api/integrations/strava/callback", "/api/integrations/strava/callback.ts"],
  ["/api/settings/import-legacy", "/api/settings/import-legacy.ts"],
]);

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  if (chunks.length === 0) {
    return undefined;
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  const contentType = req.headers["content-type"] || "";
  if (contentType.includes("application/json")) {
    return JSON.parse(raw);
  }
  return raw;
}

function toQueryRecord(searchParams) {
  const query = {};
  for (const [key, value] of searchParams.entries()) {
    if (key in query) {
      const current = query[key];
      query[key] = Array.isArray(current) ? [...current, value] : [current, value];
    } else {
      query[key] = value;
    }
  }
  return query;
}

function localApiPlugin() {
  return {
    name: "andes-local-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || "/", "http://localhost");
        const route = apiRoutes.get(url.pathname);
        if (!route) {
          next();
          return;
        }

        try {
          const mod = await server.ssrLoadModule(path.join(__dirname, route));
          const handler = mod.default;
          if (typeof handler !== "function") {
            throw new Error(`Route ${route} does not export a default handler.`);
          }

          const body = await readBody(req);
          let statusCode = 200;

          const apiRes = {
            status(code) {
              statusCode = code;
              res.statusCode = code;
              return apiRes;
            },
            json(payload) {
              if (!res.headersSent) {
                res.statusCode = statusCode;
                res.setHeader("Content-Type", "application/json; charset=utf-8");
              }
              res.end(JSON.stringify(payload));
            },
            end(payload = "") {
              if (!res.headersSent) {
                res.statusCode = statusCode;
              }
              res.end(payload);
            },
            setHeader(key, value) {
              res.setHeader(key, value);
            },
          };

          await handler(
            {
              method: req.method,
              headers: req.headers,
              query: toQueryRecord(url.searchParams),
              body,
            },
            apiRes
          );
        } catch (error) {
          server.ssrFixStacktrace(error);
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify({
            error: error instanceof Error ? error.message : "Local API request failed.",
          }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));

  return {
    plugins: [react(), tailwindcss(), localApiPlugin()],
  };
});
