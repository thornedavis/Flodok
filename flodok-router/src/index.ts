import type { Env, OrgConfig } from "./types";
import { verifyWebhookSignature, parseWebhookPayload } from "./webhook";
import { processWebhook } from "./processor";
import { fetchRecentTranscripts } from "./fireflies";
import { loadOrgById, listActiveOrgs, claimMeeting, autoClosePeriods } from "./config";

// Required secrets. Checked on every fetch so misconfiguration is loud (500 at
// the request level) rather than silent (cron skips, webhooks fail obscurely).
const REQUIRED_SECRETS = [
  "SUPABASE_URL",
  "WORKER_SERVICE_TOKEN",
  "ENCRYPTION_KEY",
  "OPENROUTER_API_KEY",
] as const;

function missingSecrets(env: Env): string[] {
  const missing: string[] = [];
  for (const key of REQUIRED_SECRETS) {
    const val = (env as unknown as Record<string, string | undefined>)[key];
    if (!val || val.length === 0) missing.push(key);
  }
  return missing;
}

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

// RFC-4122 UUID — any version. Orgs are always UUIDs because Postgres
// generates them via gen_random_uuid() on insert.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method;

    if (url.pathname === "/health" && method === "GET") {
      const missing = missingSecrets(env);
      if (missing.length > 0) {
        return Response.json(
          { status: "misconfigured", missing_secrets: missing },
          { status: 500 },
        );
      }
      return Response.json({ status: "ok", timestamp: new Date().toISOString() });
    }

    // Deep health check — per-org end-to-end verification. Used by the
    // Integrations UI after a save to confirm the round trip works.
    // Requires the operator's WORKER_SERVICE_TOKEN.
    const deepHealthMatch = url.pathname.match(/^\/health\/deep\/([^/]+)\/?$/);
    if (deepHealthMatch && method === "GET") {
      return handleDeepHealth(request, env, deepHealthMatch[1]);
    }

    // Fail loud if core secrets are missing. Other routes would return
    // confusing errors downstream otherwise.
    const missing = missingSecrets(env);
    if (missing.length > 0) {
      console.error("Worker misconfigured — missing secrets:", missing.join(", "));
      return Response.json(
        { error: "Worker misconfigured", missing_secrets: missing },
        { status: 500 },
      );
    }

    // Per-org webhook: /webhook/fireflies/:org_id
    const webhookMatch = url.pathname.match(/^\/webhook\/fireflies\/([^/]+)\/?$/);
    if (webhookMatch && method === "POST") {
      const orgId = webhookMatch[1];
      if (!UUID_RE.test(orgId)) {
        return Response.json({ error: "Invalid org id" }, { status: 400 });
      }
      return handleFirefliesWebhook(request, env, ctx, orgId);
    }

    // Legacy path — kept alive during cutover, routed via env var.
    if (url.pathname === "/webhook/fireflies" && method === "POST") {
      if (!env.LEGACY_WEBHOOK_ORG_ID) {
        return Response.json(
          { error: "This webhook URL is no longer active. Use the per-org URL shown in your Integrations settings." },
          { status: 410 },
        );
      }
      return handleFirefliesWebhook(request, env, ctx, env.LEGACY_WEBHOOK_ORG_ID);
    }

    // Per-org manual trigger: /trigger/:org_id (operator-only)
    const triggerMatch = url.pathname.match(/^\/trigger\/([^/]+)\/?$/);
    if (triggerMatch && method === "POST") {
      const orgId = triggerMatch[1];
      if (!UUID_RE.test(orgId)) {
        return Response.json({ error: "Invalid org id" }, { status: 400 });
      }
      return handleManualTrigger(request, env, ctx, orgId);
    }

    // Per-org manual poll: /poll/:org_id (operator-only)
    const pollMatch = url.pathname.match(/^\/poll\/([^/]+)\/?$/);
    if (pollMatch && (method === "POST" || method === "OPTIONS")) {
      const orgId = pollMatch[1];
      if (method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
      }
      if (!UUID_RE.test(orgId)) {
        return Response.json({ error: "Invalid org id" }, { status: 400, headers: corsHeaders });
      }
      return handleManualPoll(request, env, orgId);
    }

    return new Response("Not Found", { status: 404 });
  },

  async scheduled(controller: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    // Multiple cron triggers share this handler. Dispatch on the UTC cron
    // expression to keep each job's concerns separate.
    if (controller.cron === "0 18 * * *") {
      try {
        const result = await autoClosePeriods(env);
        console.log("Cron: auto-close →", result);
      } catch (err) {
        console.error("Cron: auto-close failed:", err);
      }
      return;
    }

    const orgs = await listActiveOrgs(env);
    console.log(`Cron: polling ${orgs.length} active org(s)`);

    const results = await Promise.allSettled(
      orgs.map((o) => runPollForOrg(env, o.id)),
    );

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const id = orgs[i].id;
      if (r.status === "rejected") {
        console.error(`Cron: poll failed for ${id}:`, r.reason);
      } else {
        console.log(`Cron: ${id} →`, r.value);
      }
    }
  },
} satisfies ExportedHandler<Env>;

// /poll and /trigger are operator-only. Gate with the same service token the
// Worker uses to talk to Supabase — only the operator has it. Constant-time
// compare to resist timing attacks.
function authorizeAdmin(request: Request, env: Env): boolean {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token || !env.WORKER_SERVICE_TOKEN) return false;
  if (token.length !== env.WORKER_SERVICE_TOKEN.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) {
    diff |= token.charCodeAt(i) ^ env.WORKER_SERVICE_TOKEN.charCodeAt(i);
  }
  return diff === 0;
}

async function handleManualPoll(request: Request, env: Env, orgId: string): Promise<Response> {
  if (!authorizeAdmin(request, env)) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }

  const config = await loadOrgById(env, orgId);
  if (!config) {
    return Response.json({ error: "Org not found or not configured" }, { status: 404, headers: corsHeaders });
  }

  const result = await runPollForOrg(env, orgId, config);
  return Response.json(result, { headers: corsHeaders });
}

async function runPollForOrg(
  env: Env,
  orgId: string,
  preloaded?: OrgConfig,
): Promise<{ status: string; org_id: string; found: number; processed: number }> {
  const config = preloaded ?? (await loadOrgById(env, orgId));
  if (!config) {
    return { status: "not_configured", org_id: orgId, found: 0, processed: 0 };
  }
  if (!config.enabled) {
    return { status: "disabled", org_id: orgId, found: 0, processed: 0 };
  }

  const transcripts = await fetchRecentTranscripts(config.fireflies_api_key);
  console.log(`Poll[${orgId}]: found ${transcripts.length} transcripts`);

  let processed = 0;
  for (const t of transcripts) {
    const claimed = await claimMeeting(env, config.org_id, "fireflies", t.id);
    if (!claimed) continue;

    console.log(`Poll[${orgId}]: processing ${t.id} — "${t.title}"`);
    try {
      await processWebhook(t.id, config, env);
      processed++;
    } catch (err) {
      console.error(`Poll[${orgId}]: processWebhook failed for ${t.id}:`, err);
    }
  }

  return { status: "ok", org_id: orgId, found: transcripts.length, processed };
}

async function handleManualTrigger(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  orgId: string,
): Promise<Response> {
  if (!authorizeAdmin(request, env)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = await loadOrgById(env, orgId);
  if (!config) {
    return Response.json({ error: "Org not found or not configured" }, { status: 404 });
  }

  let body: { meetingId?: string };
  try {
    body = (await request.json()) as { meetingId?: string };
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.meetingId) {
    return Response.json({ error: "Missing meetingId" }, { status: 400 });
  }

  const meetingId = body.meetingId;

  ctx.waitUntil(
    (async () => {
      const claimed = await claimMeeting(env, config.org_id, "fireflies", meetingId);
      if (!claimed) {
        console.log(`Manual trigger[${orgId}]: ${meetingId} already processed`);
        return;
      }
      await processWebhook(meetingId, config, env).catch((err) => {
        console.error(`Manual trigger[${orgId}] failed for ${meetingId}:`, err);
      });
    })(),
  );

  return Response.json({ status: "accepted", org_id: orgId, meetingId });
}

async function handleFirefliesWebhook(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  orgId: string,
): Promise<Response> {
  const config = await loadOrgById(env, orgId);
  if (!config) {
    return Response.json({ error: "Org not found or not configured" }, { status: 404 });
  }
  if (!config.enabled) {
    return Response.json({ status: "disabled" }, { status: 200 });
  }

  if (config.fireflies_webhook_secret) {
    const sigHeader = request.headers.get("x-hub-signature");
    if (sigHeader) {
      const isValid = await verifyWebhookSignature(request, config.fireflies_webhook_secret);
      if (!isValid) {
        console.error(`Webhook[${orgId}]: signature verification failed`);
        return Response.json({ error: "Invalid signature" }, { status: 401 });
      }
    } else {
      console.warn(`Webhook[${orgId}]: no x-hub-signature header — skipping verification`);
    }
  }

  let payload;
  try {
    const body = await request.json();
    console.log(`Webhook[${orgId}]: payload`, JSON.stringify(body));
    payload = parseWebhookPayload(body);
  } catch (err) {
    console.log(`Webhook[${orgId}]: non-standard payload (likely test event):`, err);
    return Response.json({ status: "ok", note: "Webhook received (test/ping)" });
  }

  if (
    payload.eventType !== "Transcription completed" &&
    payload.eventType !== "meeting.transcribed"
  ) {
    console.log(`Webhook[${orgId}]: ignoring event type`, payload.eventType);
    return Response.json({ status: "ignored", reason: "Not a transcription event" });
  }

  const claimed = await claimMeeting(env, config.org_id, "fireflies", payload.meetingId);
  if (!claimed) {
    console.log(`Webhook[${orgId}]: meeting ${payload.meetingId} already processed`);
    return Response.json({ status: "already_processed", meetingId: payload.meetingId });
  }

  const meetingId = payload.meetingId;
  ctx.waitUntil(
    processWebhook(meetingId, config, env).catch((err) => {
      console.error(`Webhook[${orgId}]: processing failed for ${meetingId}:`, err);
    }),
  );

  return Response.json({ status: "accepted", org_id: orgId, meetingId });
}

async function handleDeepHealth(request: Request, env: Env, orgId: string): Promise<Response> {
  if (!authorizeAdmin(request, env)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!UUID_RE.test(orgId)) {
    return Response.json({ error: "Invalid org id" }, { status: 400 });
  }

  const steps: { name: string; ok: boolean; detail?: unknown; error?: string }[] = [];

  const missing = missingSecrets(env);
  steps.push({
    name: "secrets",
    ok: missing.length === 0,
    error: missing.length === 0 ? undefined : `missing: ${missing.join(", ")}`,
  });
  if (missing.length > 0) {
    return Response.json({ ok: false, org_id: orgId, steps }, { status: 500 });
  }

  // Config load (Supabase reachable + ENCRYPTION_KEY decrypts cleanly)
  let config: OrgConfig | null = null;
  try {
    config = await loadOrgById(env, orgId);
    steps.push({ name: "config_load", ok: !!config, error: config ? undefined : "not_configured" });
  } catch (e) {
    steps.push({ name: "config_load", ok: false, error: e instanceof Error ? e.message : String(e) });
  }

  if (!config) {
    return Response.json({ ok: false, org_id: orgId, steps }, { status: 200 });
  }

  // Fireflies reachability with the stored key
  try {
    const list = await fetchRecentTranscripts(config.fireflies_api_key);
    steps.push({ name: "fireflies", ok: true, detail: { transcripts_seen: list.length } });
  } catch (e) {
    steps.push({ name: "fireflies", ok: false, error: e instanceof Error ? e.message : String(e) });
  }

  const allOk = steps.every((s) => s.ok);
  return Response.json({ ok: allOk, org_id: orgId, steps }, { status: allOk ? 200 : 200 });
}
