import type { ExtractedTask } from "./types";

const ASANA_API_BASE = "https://app.asana.com/api/1.0";

export async function createAsanaTask(
  task: ExtractedTask,
  meetingTitle: string,
  meetingDate: string,
  accessToken: string,
  workspaceId: string,
  projectId: string,
): Promise<{ gid: string } | null> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
    }

    try {
      const response = await fetch(`${ASANA_API_BASE}/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          data: {
            workspace: workspaceId,
            projects: [projectId],
            name: task.description,
            due_on: task.deadline,
            notes: [
              `Assignee: ${task.assignee_name}`,
              `Priority: ${task.priority}`,
              `Source: ${meetingTitle} (${meetingDate})`,
            ].join("\n"),
          },
        }),
      });

      if (!response.ok) {
        throw new Error(
          `Asana API returned ${response.status}: ${await response.text()}`,
        );
      }

      const json = (await response.json()) as { data: { gid: string } };
      return json.data;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  console.error(
    `Asana task creation failed after 3 attempts: ${lastError?.message}`,
  );
  return null;
}
