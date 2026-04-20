// --- Cloudflare Worker Environment ---

export interface Env {
  KV: KVNamespace;
  // Set via `wrangler secret put`:
  SUPABASE_URL: string;
  WORKER_SERVICE_TOKEN: string;
  ENCRYPTION_KEY: string;
  // Operator-owned OpenRouter account — shared across all orgs. Fair-use
  // throttling lives at the app layer (processing_logs counter), not here.
  OPENROUTER_API_KEY: string;
  OPENROUTER_MODEL?: string;
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
  assignee_name: string;
  description: string;
  deadline: string | null;
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
  asana_access_token?: string;
  asana_workspace_id?: string;
  asana_project_id?: string;
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
  tasks_created: number;
  sop_updates_sent: number;
  unmatched_items: number;
  errors: string[];
}
