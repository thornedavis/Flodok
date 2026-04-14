import type { Env, OrgConfig } from "./types";
import { verifyWebhookSignature, parseWebhookPayload } from "./webhook";
import { processWebhook } from "./processor";
import { fetchRecentTranscripts } from "./fireflies";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health" && request.method === "GET") {
      return Response.json({ status: "ok", timestamp: new Date().toISOString() });
    }


    if (url.pathname === "/webhook/fireflies" && request.method === "POST") {
      return handleFirefliesWebhook(request, env, ctx);
    }

    // Manual trigger — process a specific meeting by ID
    if (url.pathname === "/trigger" && request.method === "POST") {
      return handleManualTrigger(request, env, ctx);
    }

    // Manual poll — check for new transcripts now
    if (url.pathname === "/poll" && (request.method === "POST" || request.method === "OPTIONS")) {
      return handleManualPoll(request, env, ctx);
    }

    return new Response("Not Found", { status: 404 });
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    await runPoll(env);
  },
} satisfies ExportedHandler<Env>;

async function handleManualPoll(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const configRaw = await env.KV.get("config:default");
  if (!configRaw) {
    return Response.json({ error: "No org configuration found" }, { status: 500, headers: corsHeaders });
  }

  const config: OrgConfig = JSON.parse(configRaw);

  // Accept either the raw API key or a poll secret
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token || token !== config.flodok_api_key) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }

  const result = await runPoll(env);
  return Response.json(result, { headers: corsHeaders });
}

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

async function runPoll(env: Env): Promise<{ status: string; found: number; processed: number }> {
  const configRaw = await env.KV.get("config:default");
  if (!configRaw) {
    return { status: "error", found: 0, processed: 0 };
  }

  const config: OrgConfig = JSON.parse(configRaw);
  if (!config.enabled) {
    return { status: "disabled", found: 0, processed: 0 };
  }

  const transcripts = await fetchRecentTranscripts(config.fireflies_api_key);
  console.log(`Poll: Found ${transcripts.length} transcripts`);

  let processed = 0;
  for (const t of transcripts) {
    const alreadyProcessed = await env.KV.get(`processed:${t.id}`);
    if (alreadyProcessed) continue;

    console.log(`Poll: Processing new transcript ${t.id} — "${t.title}"`);
    await env.KV.put(`processed:${t.id}`, new Date().toISOString(), {
      expirationTtl: 60 * 60 * 24 * 90,
    });

    await processWebhook(t.id, config, env.KV);
    processed++;
  }

  console.log(`Poll: Processed ${processed} new transcripts`);
  return { status: "ok", found: transcripts.length, processed };
}

async function handleManualTrigger(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const configRaw = await env.KV.get("config:default");
  if (!configRaw) {
    return Response.json({ error: "No org configuration found" }, { status: 500 });
  }

  const config: OrgConfig = JSON.parse(configRaw);

  // Authenticate with the Flodok API key
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token || token !== config.flodok_api_key) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { meetingId?: string };
  try {
    body = await request.json() as { meetingId?: string };
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.meetingId) {
    return Response.json({ error: "Missing meetingId" }, { status: 400 });
  }

  ctx.waitUntil(
    processWebhook(body.meetingId, config, env.KV).catch((err) => {
      console.error(`Manual trigger failed for meeting ${body.meetingId}:`, err);
    }),
  );

  return Response.json({ status: "accepted", meetingId: body.meetingId });
}

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
  if (config.fireflies_webhook_secret) {
    const sigHeader = request.headers.get("x-hub-signature");
    if (sigHeader) {
      // Signature present — verify it
      const isValid = await verifyWebhookSignature(request, config.fireflies_webhook_secret);
      if (!isValid) {
        console.error("Webhook signature verification failed");
        return Response.json({ error: "Invalid signature" }, { status: 401 });
      }
    } else {
      // No signature header — log but accept (Fireflies test events may omit it)
      console.warn("No x-hub-signature header present — skipping verification");
    }
  }

  // Parse payload
  let payload;
  try {
    const body = await request.json();
    console.log("Webhook payload received:", JSON.stringify(body));
    payload = parseWebhookPayload(body);
  } catch (err) {
    // Test/ping events from Fireflies may not include meetingId
    console.log("Non-standard payload (likely test event):", err);
    return Response.json({ status: "ok", note: "Webhook received (test/ping)" });
  }

  if (payload.eventType !== "Transcription completed" && payload.eventType !== "meeting.transcribed") {
    console.log("Ignoring event type:", payload.eventType);
    return Response.json({ status: "ignored", reason: "Not a transcription event" });
  }

  // Check if already processed (e.g., by polling)
  const alreadyProcessed = await env.KV.get(`processed:${payload.meetingId}`);
  if (alreadyProcessed) {
    console.log(`Webhook: Meeting ${payload.meetingId} already processed, skipping`);
    return Response.json({ status: "already_processed", meetingId: payload.meetingId });
  }

  // Mark as processed and process asynchronously
  await env.KV.put(`processed:${payload.meetingId}`, new Date().toISOString(), {
    expirationTtl: 60 * 60 * 24 * 90,
  });

  ctx.waitUntil(
    processWebhook(payload.meetingId, config, env.KV).catch((err) => {
      console.error(`Processing failed for meeting ${payload.meetingId}:`, err);
    }),
  );

  return Response.json({ status: "accepted", meetingId: payload.meetingId });
}
