// Multi-tenant config loader + dedup + logging.
//
// The Worker no longer owns credentials. All config lives in Supabase; this
// module is the thin client the rest of the Worker uses. Reads go through a
// 60s KV cache keyed by `cfg:${slug}:v${version}`; on a credential change the
// row's `version` column bumps, the old cache key becomes orphaned, and the
// next call fetches fresh.

import type { Env, OrgConfig, ProcessingLog } from "./types";
import { decryptJson } from "./crypto";

const CACHE_TTL_SECONDS = 60;

interface IntegrationRow {
  provider: "fireflies" | "asana";
  status: string;
  credentials_encrypted: string;
  config: Record<string, unknown>;
  version: number;
}

interface ResolveResponse {
  org: { id: string; name: string };
  integrations: IntegrationRow[];
}

interface FirefliesCreds {
  api_key: string;
  webhook_secret?: string;
}

async function callWorkerConfig<T>(
  env: Env,
  path: string,
  body: unknown,
): Promise<T> {
  const res = await fetch(`${env.SUPABASE_URL}/functions/v1/worker-config${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Anon key satisfies the Supabase gateway's mandatory Authorization
      // header; worker-config still enforces X-Worker-Token itself. See flodok.ts.
      Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
      "X-Worker-Token": env.WORKER_SERVICE_TOKEN,
    },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`worker-config${path} returned ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

async function assembleOrgConfig(resolved: ResolveResponse): Promise<OrgConfig | null> {
  const env_key = resolvedEnvKey();
  if (!env_key) throw new Error("ENCRYPTION_KEY not set on Worker");

  const byProvider = new Map<string, IntegrationRow>();
  for (const row of resolved.integrations) {
    if (row.status === "active") byProvider.set(row.provider, row);
  }

  // Fireflies is the only integration the pipeline needs — it's the source of
  // transcripts. Without it there's nothing to do. (Tasks now route into Flodok,
  // not Asana, so no Asana creds are assembled here.)
  const fireflies = byProvider.get("fireflies");
  if (!fireflies) return null;

  const firefliesPlain = await decryptJson<FirefliesCreds>(
    fireflies.credentials_encrypted,
    env_key,
  );

  return {
    org_id: resolved.org.id,
    org_name: resolved.org.name,
    fireflies_api_key: firefliesPlain.api_key,
    fireflies_webhook_secret: firefliesPlain.webhook_secret,
    enabled: true,
    config_version: fireflies.version,
  };
}

// Each runtime holds onto the ENCRYPTION_KEY via `env`. We stash it in a
// module-level slot during `loadOrg*` so decryptJson calls inside
// assembleOrgConfig don't need to pass env around.
let cachedEnvKey: string | null = null;
function resolvedEnvKey(): string | null {
  return cachedEnvKey;
}

export async function loadOrgById(env: Env, orgId: string): Promise<OrgConfig | null> {
  cachedEnvKey = env.ENCRYPTION_KEY;

  const cacheKey = `cfg:id:${orgId}`;
  const cached = await env.KV.get(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached) as OrgConfig;
    } catch {
      // fall through to refresh
    }
  }

  const resolved = await callWorkerConfig<ResolveResponse>(env, "/resolve", { org_id: orgId });
  const assembled = await assembleOrgConfig(resolved);
  if (!assembled) return null;

  await env.KV.put(cacheKey, JSON.stringify(assembled), { expirationTtl: CACHE_TTL_SECONDS });
  return assembled;
}

export async function listActiveOrgs(env: Env): Promise<{ id: string; name: string }[]> {
  const res = await callWorkerConfig<{ orgs: { id: string; name: string }[] }>(
    env,
    "/list-active-orgs",
    {},
  );
  return res.orgs;
}

// (Payroll auto-close has been removed — payroll is now an explicit owner/admin
// action via run_payroll on the Payroll page, never a silent cron freeze.)

// Achievements daily run: tenure + compensation firsts for every active employee.
// Idempotent — safe to call repeatedly.
export async function runDailyAchievements(env: Env): Promise<
  { employees_processed: number; unlocks_awarded: number }[]
> {
  return callWorkerConfig(env, "/run-daily-achievements", {});
}

// Achievements monthly leaderboard: snapshot last completed month + award
// Podium / Number One / Reigning Champion. Pass period_start (YYYY-MM-01) to
// rebuild a specific month; omit to default to last completed WIB month.
export async function runMonthlyLeaderboard(
  env: Env,
  periodStart?: string,
): Promise<{ snapshot_rows: number; unlocks_awarded: number }[]> {
  return callWorkerConfig(env, "/run-monthly-leaderboard", periodStart ? { period_start: periodStart } : {});
}

// Atomic dedup. Returns true iff this call inserted the row (i.e. first time
// this meeting is seen). Replaces the old `env.KV.get("processed:X")` /
// `env.KV.put("processed:X", ...)` pattern which had a race window.
export async function claimMeeting(
  env: Env,
  orgId: string,
  provider: string,
  externalId: string,
): Promise<boolean> {
  const res = await callWorkerConfig<{ claimed: boolean }>(env, "/dedup-claim", {
    org_id: orgId,
    provider,
    external_id: externalId,
  });
  return res.claimed === true;
}

// Record the outcome of processing a claimed meeting (see migration 209). On
// success the row is marked 'done'; on failure it's left 'failed' (so the cron
// poll can retry it) until attempts are exhausted, then 'poison'. This is what
// makes a transient failure recoverable instead of a silent, permanent loss.
export async function markMeeting(
  env: Env,
  orgId: string,
  provider: string,
  externalId: string,
  success: boolean,
): Promise<void> {
  await callWorkerConfig(env, "/mark-meeting", {
    org_id: orgId,
    provider,
    external_id: externalId,
    success,
  });
}

export async function writeProcessingLog(
  env: Env,
  orgId: string,
  log: ProcessingLog,
): Promise<void> {
  await callWorkerConfig(env, "/log-processing", {
    org_id: orgId,
    provider: "fireflies",
    external_id: log.meeting_id,
    meeting_title: log.meeting_title || null,
    meeting_date: log.meeting_date || null,
    employees_matched: log.employees_matched,
    tasks_created: log.tasks_created,
    tasks_deduped: log.tasks_deduped,
    tasks_failed: log.tasks_failed,
    sop_updates_sent: log.sop_updates_sent,
    unmatched_items: log.unmatched_items,
    errors: log.errors,
  });
}
