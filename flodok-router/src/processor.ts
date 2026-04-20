import type {
  Env,
  OrgConfig,
  FirefliesTranscript,
  NameExtractionResult,
  FullAnalysisResult,
  ProcessingLog,
} from "./types";
import { fetchTranscript } from "./fireflies";
import { fetchEmployeeRoster, fetchEmployeesWithSOPs, submitSOPUpdate, submitUnmatchedItem } from "./flodok";
import { createAsanaTask } from "./asana";
import { callLLM, parseLLMJson } from "./llm";
import {
  NAME_EXTRACTION_SYSTEM_PROMPT,
  FULL_ANALYSIS_SYSTEM_PROMPT,
  buildNameExtractionUserMessage,
  buildFullAnalysisUserMessage,
} from "./prompts";
import { chunkTranscript, formatTranscriptText, needsChunking } from "./chunking";
import { writeProcessingLog } from "./config";

const DEFAULT_OPENROUTER_MODEL = "anthropic/claude-sonnet-4.5";

function modelFor(env: Env): string {
  return env.OPENROUTER_MODEL ?? DEFAULT_OPENROUTER_MODEL;
}

export async function processWebhook(
  meetingId: string,
  config: OrgConfig,
  env: Env,
): Promise<void> {
  const log: ProcessingLog = {
    meeting_id: meetingId,
    meeting_title: "",
    meeting_date: "",
    processed_at: new Date().toISOString(),
    employees_matched: 0,
    tasks_created: 0,
    sop_updates_sent: 0,
    unmatched_items: 0,
    errors: [],
  };

  try {
    const transcript = await fetchTranscript(meetingId, config.fireflies_api_key);
    log.meeting_title = transcript.title;
    log.meeting_date = transcript.date;

    const roster = await fetchEmployeeRoster(env, config.org_id);

    if (needsChunking(transcript.sentences)) {
      await processChunked(transcript, roster, config, env, log);
    } else {
      const transcriptText = formatTranscriptText(transcript.sentences);
      await processSingle(transcript, transcriptText, roster, config, env, log);
    }
  } catch (err) {
    log.errors.push(err instanceof Error ? err.message : String(err));
  }

  try {
    await writeProcessingLog(env, config.org_id, log);
  } catch (err) {
    console.error(`Failed to write processing log for ${meetingId}:`, err);
  }
}

async function processSingle(
  transcript: FirefliesTranscript,
  transcriptText: string,
  roster: { id: string; name: string; phone: string; email?: string }[],
  config: OrgConfig,
  env: Env,
  log: ProcessingLog,
): Promise<void> {
  const nameExtractionUserMsg = buildNameExtractionUserMessage(
    roster,
    transcript.title,
    transcript.date,
    transcriptText,
  );

  const nameRaw = await callLLM(
    NAME_EXTRACTION_SYSTEM_PROMPT,
    nameExtractionUserMsg,
    env.OPENROUTER_API_KEY,
    modelFor(env),
  );

  const nameResult = parseLLMJson<NameExtractionResult>(nameRaw);
  log.employees_matched = nameResult.matched_employees.length;

  if (nameResult.matched_employees.length === 0) {
    await processTasksOnly(transcript, transcriptText, config, env, log);
    return;
  }

  const matchedIds = nameResult.matched_employees.map((e) => e.employee_id);
  const employeesWithSOPs = await fetchEmployeesWithSOPs(env, config.org_id, matchedIds);

  const fullAnalysisUserMsg = buildFullAnalysisUserMessage(
    nameRaw,
    employeesWithSOPs,
    transcript.title,
    transcript.date,
    transcriptText,
  );

  const analysisRaw = await callLLM(
    FULL_ANALYSIS_SYSTEM_PROMPT,
    fullAnalysisUserMsg,
    env.OPENROUTER_API_KEY,
    modelFor(env),
  );

  const analysis = parseLLMJson<FullAnalysisResult>(analysisRaw);

  await routeOutputs(analysis, transcript, config, env, log);
}

async function processTasksOnly(
  transcript: FirefliesTranscript,
  transcriptText: string,
  config: OrgConfig,
  env: Env,
  log: ProcessingLog,
): Promise<void> {
  const taskOnlyPrompt = `You are a meeting task extractor. Extract action items from the transcript.

Return ONLY valid JSON:
{
  "tasks": [
    {
      "assignee_name": "Name as mentioned",
      "description": "What needs to be done",
      "deadline": "YYYY-MM-DD" or null,
      "priority": "high" | "medium" | "low"
    }
  ],
  "sop_updates": [],
  "unmatched_sop_items": []
}`;

  const raw = await callLLM(
    taskOnlyPrompt,
    `## Meeting Transcript: ${transcript.title} - ${transcript.date}\n${transcriptText}`,
    env.OPENROUTER_API_KEY,
    modelFor(env),
  );

  const analysis = parseLLMJson<FullAnalysisResult>(raw);
  await routeOutputs(analysis, transcript, config, env, log);
}

async function processChunked(
  transcript: FirefliesTranscript,
  roster: { id: string; name: string; phone: string; email?: string }[],
  config: OrgConfig,
  env: Env,
  log: ProcessingLog,
): Promise<void> {
  const chunks = chunkTranscript(transcript.sentences);

  for (const chunk of chunks) {
    await processSingle(
      { ...transcript, sentences: [] },
      chunk.text,
      roster,
      config,
      env,
      log,
    );
  }
}

async function routeOutputs(
  analysis: FullAnalysisResult,
  transcript: FirefliesTranscript,
  config: OrgConfig,
  env: Env,
  log: ProcessingLog,
): Promise<void> {
  const sourceMeeting = `${transcript.title} - ${transcript.date}`;

  const taskPromises = analysis.tasks.map(async (task) => {
    if (!config.asana_access_token || !config.asana_workspace_id || !config.asana_project_id) {
      log.errors.push("Asana not configured — skipping task creation");
      return;
    }
    try {
      const result = await createAsanaTask(
        task,
        transcript.title,
        transcript.date,
        config.asana_access_token,
        config.asana_workspace_id,
        config.asana_project_id,
      );
      if (result) log.tasks_created++;
    } catch (err) {
      log.errors.push(
        `Asana task failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  });

  const sopPromises = analysis.sop_updates.map(async (update) => {
    try {
      await submitSOPUpdate(env, config.org_id, update, sourceMeeting);
      log.sop_updates_sent++;
    } catch (err) {
      log.errors.push(
        `SOP update failed for ${update.employee_name}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  });

  const unmatchedPromises = analysis.unmatched_sop_items.map(async (item) => {
    try {
      await submitUnmatchedItem(env, config.org_id, item, sourceMeeting);
      log.unmatched_items++;
    } catch (err) {
      log.errors.push(
        `Unmatched item failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  });

  await Promise.all([...taskPromises, ...sopPromises, ...unmatchedPromises]);
}
