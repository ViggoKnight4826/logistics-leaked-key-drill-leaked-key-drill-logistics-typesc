import { createServer } from "node:http";
import { ZodError } from "zod";
import { InfraiClient, InfraiError } from "./infrai_client.js";
import { runLeakedKeyDrill } from "./leaked_key_drill.js";

const port = Number(process.env.PORT ?? 3000);
const api = InfraiClient.fromEnvironment();

function sendJson(response: import("node:http").ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(value));
}

async function readJson(request: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/drills/leaked-key") {
    sendJson(response, 404, { error: "route_not_found" });
    return;
  }

  try {
    const result = await runLeakedKeyDrill(api, await readJson(request));
    sendJson(response, 200, result);
  } catch (error) {
    if (error instanceof ZodError) {
      sendJson(response, 400, { error: "invalid_request", issues: error.issues });
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      sendJson(response, status, { error: error.code, message: error.message });
      return;
    }
    sendJson(response, 500, { error: "drill_failed" });
  }
});

server.listen(port, () => {
  console.log(`Logistics drill service listening on http://localhost:${port}`);
});
