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

export async function processWebhook(
  meetingId: string,
  config: OrgConfig,
  kv: KVNamespace,
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
    // Step 2: Fetch transcript
    const transcript = await fetchTranscript(meetingId, config.fireflies_api_key);
    log.meeting_title = transcript.title;
    log.meeting_date = transcript.date;

    // Step 3: Fetch lightweight roster
    const roster = await fetchEmployeeRoster(config.flodok_api_base, config.flodok_api_key);

    // Handle chunking for very long transcripts
    if (needsChunking(transcript.sentences)) {
      await processChunked(transcript, roster, config, log);
    } else {
      const transcriptText = formatTranscriptText(transcript.sentences);
      await processSingle(transcript, transcriptText, roster, config, log);
    }
  } catch (err) {
    log.errors.push(err instanceof Error ? err.message : String(err));
  }

  // Step 8: Log results
  await kv.put(
    `log:${config.org_id}:${meetingId}`,
    JSON.stringify(log),
    { expirationTtl: 60 * 60 * 24 * 30 }, // 30 days
  );
}

async function processSingle(
  transcript: FirefliesTranscript,
  transcriptText: string,
  roster: { id: string; name: string; phone: string; email?: string }[],
  config: OrgConfig,
  log: ProcessingLog,
): Promise<void> {
  // Step 4: LLM Call 1 — Name extraction
  const nameExtractionUserMsg = buildNameExtractionUserMessage(
    roster,
    transcript.title,
    transcript.date,
    transcriptText,
  );

  const nameRaw = await callLLM(
    NAME_EXTRACTION_SYSTEM_PROMPT,
    nameExtractionUserMsg,
    config.openrouter_api_key,
    config.openrouter_model,
  );

  const nameResult = parseLLMJson<NameExtractionResult>(nameRaw);
  log.employees_matched = nameResult.matched_employees.length;

  // If no employees matched, do a simplified task-only analysis
  if (nameResult.matched_employees.length === 0) {
    await processTasksOnly(transcript, transcriptText, config, log);
    return;
  }

  // Step 5: Fetch matched employees' SOPs
  const matchedIds = nameResult.matched_employees.map((e) => e.employee_id);
  const employeesWithSOPs = await fetchEmployeesWithSOPs(
    config.flodok_api_base,
    config.flodok_api_key,
    matchedIds,
  );

  // Step 6: LLM Call 2 — Full analysis
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
    config.openrouter_api_key,
    config.openrouter_model,
  );

  const analysis = parseLLMJson<FullAnalysisResult>(analysisRaw);

  // Step 7: Route outputs
  await routeOutputs(analysis, transcript, config, log);
}

async function processTasksOnly(
  transcript: FirefliesTranscript,
  transcriptText: string,
  config: OrgConfig,
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
    config.openrouter_api_key,
    config.openrouter_model,
  );

  const analysis = parseLLMJson<FullAnalysisResult>(raw);
  await routeOutputs(analysis, transcript, config, log);
}

async function processChunked(
  transcript: FirefliesTranscript,
  roster: { id: string; name: string; phone: string; email?: string }[],
  config: OrgConfig,
  log: ProcessingLog,
): Promise<void> {
  const chunks = chunkTranscript(transcript.sentences);
  const allAnalyses: FullAnalysisResult[] = [];

  for (const chunk of chunks) {
    await processSingle(
      { ...transcript, sentences: [] }, // sentences not needed — we pass text directly
      chunk.text,
      roster,
      config,
      log,
    );
  }

  // Note: processSingle routes outputs directly per chunk.
  // Deduplication across chunks is handled by Asana/Flodok accepting duplicates gracefully.
  // For a more robust solution, collect all results and deduplicate before routing.
}

async function routeOutputs(
  analysis: FullAnalysisResult,
  transcript: FirefliesTranscript,
  config: OrgConfig,
  log: ProcessingLog,
): Promise<void> {
  const sourceMeeting = `${transcript.title} - ${transcript.date}`;

  // Route tasks to Asana (non-blocking — failures don't stop SOP updates)
  const taskPromises = analysis.tasks.map(async (task) => {
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

  // Route SOP updates to Flodok
  const sopPromises = analysis.sop_updates.map(async (update) => {
    try {
      await submitSOPUpdate(
        config.flodok_api_base,
        config.flodok_api_key,
        update,
        sourceMeeting,
      );
      log.sop_updates_sent++;
    } catch (err) {
      log.errors.push(
        `SOP update failed for ${update.employee_name}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  });

  // Route unmatched items to Flodok
  const unmatchedPromises = analysis.unmatched_sop_items.map(async (item) => {
    try {
      await submitUnmatchedItem(
        config.flodok_api_base,
        config.flodok_api_key,
        item,
        sourceMeeting,
      );
      log.unmatched_items++;
    } catch (err) {
      log.errors.push(
        `Unmatched item failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  });

  await Promise.all([...taskPromises, ...sopPromises, ...unmatchedPromises]);
}
