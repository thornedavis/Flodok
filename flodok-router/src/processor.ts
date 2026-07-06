import type {
  Env,
  OrgConfig,
  FirefliesTranscript,
  NameExtractionResult,
  FullAnalysisResult,
  ProcessingLog,
} from "./types";
import { fetchTranscript } from "./fireflies";
import { fetchEmployeeRoster, fetchEmployeesWithSOPs, submitSOPUpdate, submitTask, submitUnmatchedItem } from "./flodok";
import { callLLM, parseLLMJson } from "./llm";
import {
  NAME_EXTRACTION_SYSTEM_PROMPT,
  FULL_ANALYSIS_SYSTEM_PROMPT,
  TASK_ONLY_SYSTEM_PROMPT,
  buildNameExtractionUserMessage,
  buildFullAnalysisUserMessage,
  buildTaskOnlyUserMessage,
} from "./prompts";
import { chunkTranscript, formatTranscriptText, needsChunking } from "./chunking";
import { writeProcessingLog } from "./config";

const DEFAULT_OPENROUTER_MODEL = "anthropic/claude-sonnet-4.5";
// Cap sized for the SOP worst-case (a full-document rewrite); prevents provider
// truncation from throwing in parseLLMJson and losing the whole meeting.
const MAX_OUTPUT_TOKENS = 8000;
// The app operates in WIB; anchor relative-date resolution there. (An org-level
// timezone can replace this constant later.)
const ORG_TIMEZONE = "Asia/Jakarta (WIB)";

function modelFor(env: Env): string {
  return env.OPENROUTER_MODEL ?? DEFAULT_OPENROUTER_MODEL;
}

function speakerNames(transcript: FirefliesTranscript): string[] {
  return (transcript.speakers ?? []).map((s) => s.name).filter(Boolean);
}

function actionItemsOf(transcript: FirefliesTranscript): string[] {
  return transcript.summary?.action_items ?? [];
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
    tasks_deduped: 0,
    tasks_failed: 0,
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
      await processChunked(meetingId, transcript, roster, config, env, log);
    } else {
      const transcriptText = formatTranscriptText(transcript.sentences);
      await processSingle(meetingId, transcript, transcriptText, roster, config, env, log);
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
  meetingId: string,
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
    await processTasksOnly(meetingId, transcript, transcriptText, config, env, log);
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
    speakerNames(transcript),
    actionItemsOf(transcript),
    ORG_TIMEZONE,
  );

  const analysisRaw = await callLLM(
    FULL_ANALYSIS_SYSTEM_PROMPT,
    fullAnalysisUserMsg,
    env.OPENROUTER_API_KEY,
    modelFor(env),
    MAX_OUTPUT_TOKENS,
  );

  const analysis = parseLLMJson<FullAnalysisResult>(analysisRaw);

  await routeOutputs(meetingId, analysis, transcript, config, env, log);
}

async function processTasksOnly(
  meetingId: string,
  transcript: FirefliesTranscript,
  transcriptText: string,
  config: OrgConfig,
  env: Env,
  log: ProcessingLog,
): Promise<void> {
  const raw = await callLLM(
    TASK_ONLY_SYSTEM_PROMPT,
    buildTaskOnlyUserMessage(
      transcript.title,
      transcript.date,
      transcriptText,
      speakerNames(transcript),
      actionItemsOf(transcript),
      ORG_TIMEZONE,
    ),
    env.OPENROUTER_API_KEY,
    modelFor(env),
    MAX_OUTPUT_TOKENS,
  );

  const analysis = parseLLMJson<FullAnalysisResult>(raw);
  await routeOutputs(meetingId, analysis, transcript, config, env, log);
}

async function processChunked(
  meetingId: string,
  transcript: FirefliesTranscript,
  roster: { id: string; name: string; phone: string; email?: string }[],
  config: OrgConfig,
  env: Env,
  log: ProcessingLog,
): Promise<void> {
  const chunks = chunkTranscript(transcript.sentences);

  for (const chunk of chunks) {
    await processSingle(
      meetingId,
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
  meetingId: string,
  analysis: FullAnalysisResult,
  transcript: FirefliesTranscript,
  config: OrgConfig,
  env: Env,
  log: ProcessingLog,
): Promise<void> {
  const sourceMeeting = `${transcript.title} - ${transcript.date}`;

  // Tasks → Flodok's tasks-ingest (staged as pending_tasks for review). One call
  // per meeting; the edge fn dedups per item and resolves each assignee_name
  // server-side. A per-item title guard here plus per-item handling in the edge
  // fn means a bad task is dropped, never thrown — so it can't take the SOP
  // updates down with it.
  const validTasks = (analysis.tasks ?? []).filter(
    (t) => t && typeof t.title === "string" && t.title.trim().length > 0,
  );
  const droppedTasks = (analysis.tasks?.length ?? 0) - validTasks.length;
  if (droppedTasks > 0) {
    log.tasks_failed += droppedTasks;
    log.errors.push(`Dropped ${droppedTasks} task(s) with no title`);
  }
  const taskPromise: Promise<void> = validTasks.length
    ? submitTask(env, config.org_id, meetingId, sourceMeeting, validTasks)
        .then((res) => {
          log.tasks_created += res.ingested;
          log.tasks_deduped += res.deduped;
          log.tasks_failed += res.failed;
        })
        .catch((err) => {
          log.errors.push(
            `Task ingest failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        })
    : Promise.resolve();

  const sopPromises = (analysis.sop_updates ?? []).map(async (update) => {
    try {
      await submitSOPUpdate(env, config.org_id, update, sourceMeeting);
      log.sop_updates_sent++;
    } catch (err) {
      log.errors.push(
        `SOP update failed for ${update.employee_name}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  });

  const unmatchedPromises = (analysis.unmatched_sop_items ?? []).map(async (item) => {
    try {
      await submitUnmatchedItem(env, config.org_id, item, sourceMeeting);
      log.unmatched_items++;
    } catch (err) {
      log.errors.push(
        `Unmatched item failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  });

  await Promise.all([taskPromise, ...sopPromises, ...unmatchedPromises]);
}
