// --- Cloudflare Worker Environment ---

export interface Env {
  KV: KVNamespace;
  // Cloudflare Browser Rendering binding (Workers Paid plan + Browser
  // Rendering enabled on account). Consumed by the /pdf endpoint to
  // render a structured document into a PDF without leaving the Worker.
  BROWSER: Fetcher;
  // Set via `wrangler secret put`:
  SUPABASE_URL: string;
  WORKER_SERVICE_TOKEN: string;
  ENCRYPTION_KEY: string;
  // Operator-owned OpenRouter account — shared across all orgs. Fair-use
  // throttling lives at the app layer (processing_logs counter), not here.
  OPENROUTER_API_KEY: string;
  OPENROUTER_MODEL?: string;
  // Supabase anon API key. Two uses: (1) the Authorization header on every
  // worker→Supabase Edge Function call — the gateway rejects requests without a
  // valid project key (the functions still enforce X-Worker-Token themselves);
  // (2) the /pdf endpoint verifies user sessions via the auth/v1/user lookup.
  // Required (see REQUIRED_SECRETS). Set via `wrangler secret put
  // SUPABASE_ANON_KEY` from flodok-router/. Same value as VITE_SUPABASE_ANON_KEY.
  SUPABASE_ANON_KEY: string;
  // Optional — if set, requests to the legacy /webhook/fireflies path route
  // to this org for a grace period while users update their Fireflies URLs.
  LEGACY_WEBHOOK_ORG_ID?: string;
}

// --- Fireflies Types ---

export interface FirefliesWebhookPayload {
  meetingId: string;
  eventType: string;
  clientReferenceId?: string;
}

export interface FirefliesSpeaker {
  id: number;
  name: string;
}

export interface FirefliesSentence {
  text: string;
  speaker_name: string;
  speaker_id: number;
  start_time: number;
  end_time: number;
}

export interface FirefliesSummary {
  keywords: string[];
  action_items: string[];
}

export interface FirefliesTranscript {
  title: string;
  date: string;
  duration: number;
  participants: string[];
  speakers: FirefliesSpeaker[];
  sentences: FirefliesSentence[];
  summary: FirefliesSummary;
}

// --- Flodok Types ---

export interface FlodokEmployee {
  id: string;
  name: string;
  phone: string;
  email?: string;
}

export interface FlodokEmployeeWithSOP extends FlodokEmployee {
  sop_content: string;
}

// --- LLM Call 1: Name Extraction ---

export interface MatchedEmployee {
  employee_id: string;
  employee_name: string;
  transcript_references: string[];
  context: string;
}

export interface UnrecognizedName {
  name: string;
  context: string;
  reason: string;
}

export interface NameExtractionResult {
  matched_employees: MatchedEmployee[];
  unrecognized_names: UnrecognizedName[];
}

// --- LLM Call 2: Full Analysis ---

export interface ExtractedTask {
  // Name as referred to in the meeting (or the speaker's name for first-person
  // commitments). Resolved to a real person server-side in tasks-ingest; null =
  // genuinely unassigned. The LLM never emits an id.
  assignee_name: string | null;
  title: string;
  notes?: string | null;
  due_date: string | null;
  priority: "high" | "medium" | "low";
}

export interface SOPUpdate {
  employee_id: string;
  employee_phone: string;
  employee_name: string;
  summary: string;
  proposed_content: string;
  change_type: "revision" | "addition" | "modification" | "removal";
}

export interface UnmatchedSOPItem {
  raw_name: string;
  content: string;
  summary: string;
  reason: string;
}

export interface FullAnalysisResult {
  tasks: ExtractedTask[];
  sop_updates: SOPUpdate[];
  unmatched_sop_items: UnmatchedSOPItem[];
}

// --- Org Configuration ---

export interface OrgConfig {
  org_id: string;
  org_name: string;
  fireflies_api_key: string;
  fireflies_webhook_secret?: string;
  enabled: boolean;
  // Incremented on every credential change. Used as a cache-busting hint so
  // the Worker can treat KV-cached configs as stale without a DB round trip.
  config_version: number;
}

// --- Processing Log ---

export interface ProcessingLog {
  meeting_id: string;
  meeting_title: string;
  meeting_date: string;
  processed_at: string;
  employees_matched: number;
  tasks_created: number;   // tasks ingested into pending_tasks (was: Asana-created)
  tasks_deduped: number;   // re-extracted tasks collapsed by the idempotency key
  tasks_failed: number;    // tasks rejected by server-side validation
  sop_updates_sent: number;
  unmatched_items: number;
  errors: string[];
}
