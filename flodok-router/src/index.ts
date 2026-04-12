import type { Env, OrgConfig } from "./types";
import { verifyWebhookSignature, parseWebhookPayload } from "./webhook";
import { processWebhook } from "./processor";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health" && request.method === "GET") {
      return Response.json({ status: "ok", timestamp: new Date().toISOString() });
    }

    if (url.pathname === "/webhook/fireflies" && request.method === "POST") {
      return handleFirefliesWebhook(request, env, ctx);
    }

    return new Response("Not Found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

async function handleFirefliesWebhook(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  // Load org config (single-org for now — use a default key)
  const configRaw = await env.KV.get("config:default");
  if (!configRaw) {
    return Response.json({ error: "No org configuration found" }, { status: 500 });
  }

  const config: OrgConfig = JSON.parse(configRaw);
  if (!config.enabled) {
    return Response.json({ status: "disabled" }, { status: 200 });
  }

  // Verify webhook signature
  const isValid = await verifyWebhookSignature(request, config.fireflies_webhook_secret);
  if (!isValid) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  // Parse payload
  let payload;
  try {
    const body = await request.json();
    payload = parseWebhookPayload(body);
  } catch {
    return Response.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (payload.eventType !== "Transcription completed") {
    return Response.json({ status: "ignored", reason: "Not a transcription event" });
  }

  // Process asynchronously — return 200 immediately
  ctx.waitUntil(
    processWebhook(payload.meetingId, config, env.KV).catch((err) => {
      console.error(`Processing failed for meeting ${payload.meetingId}:`, err);
    }),
  );

  return Response.json({ status: "accepted", meetingId: payload.meetingId });
}
