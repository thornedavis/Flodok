import type {
  Env,
  FlodokEmployee,
  FlodokEmployeeWithSOP,
  SOPUpdate,
  UnmatchedSOPItem,
} from "./types";

// The Worker authenticates to Flodok's Supabase Edge Functions using the
// operator-owned WORKER_SERVICE_TOKEN plus an `X-Worker-Org-Id` header that
// declares which org the call is for. This replaces the older per-org
// `flk_live_*` bearer — users never have to know about internal plumbing.

async function flodokFetch(
  env: Env,
  orgId: string,
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const url = `${env.SUPABASE_URL}/functions/v1/${path}`;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          "X-Worker-Token": env.WORKER_SERVICE_TOKEN,
          "X-Worker-Org-Id": orgId,
          ...options.headers,
        },
      });

      if (!response.ok) {
        throw new Error(
          `Flodok API returned ${response.status}: ${await response.text()}`,
        );
      }

      return response;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw new Error(
    `Flodok API failed after 3 attempts: ${lastError?.message}`,
  );
}

export async function fetchEmployeeRoster(
  env: Env,
  orgId: string,
): Promise<FlodokEmployee[]> {
  const response = await flodokFetch(env, orgId, "employees?include_sop=false");
  const data = (await response.json()) as { employees: FlodokEmployee[] };
  return data.employees;
}

export async function fetchEmployeesWithSOPs(
  env: Env,
  orgId: string,
  employeeIds: string[],
): Promise<FlodokEmployeeWithSOP[]> {
  const ids = employeeIds.join(",");
  const response = await flodokFetch(
    env,
    orgId,
    `employees?include_sop=true&ids=${ids}`,
  );
  const data = (await response.json()) as { employees: FlodokEmployeeWithSOP[] };
  return data.employees;
}

export async function submitSOPUpdate(
  env: Env,
  orgId: string,
  update: SOPUpdate,
  sourceMeeting: string,
): Promise<{ status: string; update_id: string }> {
  const response = await flodokFetch(env, orgId, "sop-updates", {
    method: "POST",
    body: JSON.stringify({
      employee_phone: update.employee_phone,
      changes: [
        {
          summary: update.summary,
          content_markdown: update.proposed_content,
          change_type: update.change_type || 'revision',
        },
      ],
      source_meeting: sourceMeeting,
    }),
  });
  return response.json() as Promise<{ status: string; update_id: string }>;
}

export async function submitUnmatchedItem(
  env: Env,
  orgId: string,
  item: UnmatchedSOPItem,
  sourceMeeting: string,
): Promise<{ status: string; update_id: string }> {
  const response = await flodokFetch(env, orgId, "sop-updates", {
    method: "POST",
    body: JSON.stringify({
      employee_phone: null,
      changes: [
        {
          section: "Unmatched",
          summary: item.summary,
          content_markdown: item.content,
        },
      ],
      source_meeting: sourceMeeting,
    }),
  });
  return response.json() as Promise<{ status: string; update_id: string }>;
}
