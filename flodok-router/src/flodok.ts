import type {
  FlodokEmployee,
  FlodokEmployeeWithSOP,
  SOPUpdate,
  UnmatchedSOPItem,
} from "./types";

async function flodokFetch(
  url: string,
  apiKey: string,
  options: RequestInit = {},
): Promise<Response> {
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
          Authorization: `Bearer ${apiKey}`,
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
  apiBase: string,
  apiKey: string,
): Promise<FlodokEmployee[]> {
  const response = await flodokFetch(
    `${apiBase}/employees?include_sop=false`,
    apiKey,
  );
  const data = (await response.json()) as { employees: FlodokEmployee[] };
  return data.employees;
}

export async function fetchEmployeesWithSOPs(
  apiBase: string,
  apiKey: string,
  employeeIds: string[],
): Promise<FlodokEmployeeWithSOP[]> {
  const ids = employeeIds.join(",");
  const response = await flodokFetch(
    `${apiBase}/employees?include_sop=true&ids=${ids}`,
    apiKey,
  );
  const data = (await response.json()) as { employees: FlodokEmployeeWithSOP[] };
  return data.employees;
}

export async function submitSOPUpdate(
  apiBase: string,
  apiKey: string,
  update: SOPUpdate,
  sourceMeeting: string,
): Promise<{ status: string; update_id: string }> {
  const response = await flodokFetch(`${apiBase}/sop-updates`, apiKey, {
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
  apiBase: string,
  apiKey: string,
  item: UnmatchedSOPItem,
  sourceMeeting: string,
): Promise<{ status: string; update_id: string }> {
  const response = await flodokFetch(`${apiBase}/sop-updates`, apiKey, {
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
