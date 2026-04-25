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
interface AsanaCreds {
  access_token: string;
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

  // Fireflies is the only required integration — it's the source of
  // transcripts. Without it the pipeline has nothing to do. Asana is optional;
  // tasks just get skipped with a log entry when it's absent.
  const fireflies = byProvider.get("fireflies");
  const asana = byProvider.get("asana");

  if (!fireflies) return null;

  const [firefliesPlain, asanaPlain] = await Promise.all([
    decryptJson<FirefliesCreds>(fireflies.credentials_encrypted, env_key),
    asana ? decryptJson<AsanaCreds>(asana.credentials_encrypted, env_key) : Promise.resolve(null),
  ]);

  const maxVersion = Math.max(fireflies.version, asana?.version ?? 0);

  return {
    org_id: resolved.org.id,
    org_name: resolved.org.name,
    fireflies_api_key: firefliesPlain.api_key,
    fireflies_webhook_secret: firefliesPlain.webhook_secret,
    asana_access_token: asanaPlain?.access_token,
    asana_workspace_id: (asana?.config?.workspace_id as string | undefined) ?? undefined,
    asana_project_id: (asana?.config?.project_id as string | undefined) ?? undefined,
    enabled: true,
    config_version: maxVersion,
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

// Runs the Postgres auto-close RPC. Invoked from the daily cron. The edge
// function delegates to the `auto_close_periods()` SQL function, which is
// idempotent and only freezes periods for orgs whose `pay_day_of_month`
// matches today's Asia/Jakarta date.
export async function autoClosePeriods(env: Env): Promise<{
  today_wib: string;
  orgs_processed: number;
  employees_closed: number;
  closures: Array<{ org_id: string; period_month: string; pay_day_of_month: number }>;
}> {
  return callWorkerConfig(env, "/auto-close-periods", {});
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
    sop_updates_sent: log.sop_updates_sent,
    unmatched_items: log.unmatched_items,
    errors: log.errors,
  });
}
