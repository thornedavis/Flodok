// tasks-ingest — receives meeting-extracted action items from the flodok-router
// worker and stages them as pending_tasks for human review on the Pending page.
//
// Auth: the same primitive sop-updates uses — validateWorkerOrApiKey (the
// Worker's X-Worker-Token + X-Worker-Org-Id, or a flk_ API key). No new secret.
//
// This function is the trust boundary: it re-validates every field the LLM
// produced, resolves the spoken assignee NAME to a real person server-side
// (never trusting an LLM-provided id), and dedups on a content-derived key so a
// redelivered / re-polled / multi-chunk extraction can't double-insert.
//
// See docs/fireflies-tasks-plan.md §4–§5.

import { corsHeaders, jsonResponse, getSupabaseAdmin, validateWorkerOrApiKey } from '../_shared/auth.ts'

type Priority = 'high' | 'medium' | 'low'

interface IncomingTask {
  assignee_name?: string | null
  title?: string
  notes?: string | null
  due_date?: string | null
  priority?: Priority
}

interface IngestBody {
  source?: string
  meeting_id?: string | null
  source_meeting?: string | null
  tasks?: IncomingTask[]
}

// UI stores priority 0..3 (none/low/medium/high — see src/lib/tasks.ts).
const PRIORITY_MAP: Record<string, number> = { none: 0, low: 1, medium: 2, high: 3 }
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function normalizeName(s: string): string {
  return s
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function nameTokens(s: string): string[] {
  return normalizeName(s).split(' ').filter(Boolean)
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// Calendar-valid YYYY-MM-DD or null. The regex only checks shape — "2026-02-30"
// / "2026-13-01" would pass it but then error the Postgres `date` insert and
// drop an otherwise-good task. Round-trip through Date to reject impossible days.
function validDate(s: string | null | undefined): string | null {
  if (!s || !DATE_RE.test(s)) return null
  const d = new Date(`${s}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10) === s ? s : null
}

interface Candidate {
  kind: 'employee' | 'user'
  id: string
  norm: string
  toks: string[]
}

interface Resolution {
  employeeId?: string
  userId?: string
  ambiguous: boolean
}

// Deterministic, tiered name → person resolver. The golden rule: NEVER auto-pick
// when more than one candidate matches — flag ambiguous and let the human choose.
function resolveAssignee(rawName: string | null, candidates: Candidate[]): Resolution {
  if (!rawName) return { ambiguous: false }
  const spokenNorm = normalizeName(rawName)
  if (!spokenNorm) return { ambiguous: false }
  const spokenToks = spokenNorm.split(' ').filter(Boolean)

  // Tier 1: exact normalized equality.
  let tier = candidates.filter(c => c.norm === spokenNorm)
  // Tier 2: every spoken token is in the candidate ("Andi" → "Andi Wijaya").
  // (We deliberately do NOT do the reverse — candidate-tokens-⊆-spoken — because
  // a single-token name appearing inside a longer spoken string would auto-pick
  // the wrong person with no ambiguity flag. Unmatched-but-safe beats confident-
  // but-wrong; the reviewer resolves it.)
  if (tier.length === 0) {
    tier = candidates.filter(c => c.toks.length > 0 && spokenToks.every(t => c.toks.includes(t)))
  }

  if (tier.length === 0) return { ambiguous: false }   // no match → unassigned + keep name
  if (tier.length > 1) return { ambiguous: true }      // >1 → human picks
  const m = tier[0]
  return m.kind === 'employee' ? { employeeId: m.id, ambiguous: false } : { userId: m.id, ambiguous: false }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  try {
    const supabase = getSupabaseAdmin()
    const authed = await validateWorkerOrApiKey(req, supabase)
    if (!authed) return jsonResponse({ error: 'Unauthorized' }, 401)

    const body = (await req.json()) as IngestBody
    const source = body.source || 'fireflies'
    // meeting_id is required: the dedup key is meeting-scoped, so without it two
    // genuinely different meetings that share an identically-worded task+assignee
    // would collapse into one. The worker always sends it.
    const meetingId =
      typeof body.meeting_id === 'string' && body.meeting_id.trim() ? body.meeting_id.trim() : null
    if (!meetingId) return jsonResponse({ error: 'meeting_id required' }, 400)
    const sourceMeeting = body.source_meeting || null
    const tasks = Array.isArray(body.tasks) ? body.tasks : []
    if (tasks.length === 0) return jsonResponse({ ingested: 0, deduped: 0, failed: 0 })

    // Build the assignable-people candidate set. Service role bypasses RLS, so we
    // self-filter: active (currently-employed) workforce, plus operators. A user
    // linked to an employee (users.employee_id) is ONE person — exclude them from
    // the operator list so they're represented by (and resolve to) their employee
    // identity, and so a single name never falsely reads as two candidates.
    const [empRes, usrRes] = await Promise.all([
      supabase.from('employees').select('id, name')
        .eq('org_id', authed.org_id).eq('lifecycle_stage', 'active').is('deleted_at', null),
      supabase.from('users').select('id, name, employee_id').eq('org_id', authed.org_id),
    ])

    const candidates: Candidate[] = []
    const activeEmpIds = new Set<string>()
    const empNorms = new Set<string>()
    for (const e of empRes.data || []) {
      if (!e.name) continue
      const norm = normalizeName(e.name)
      candidates.push({ kind: 'employee', id: e.id, norm, toks: nameTokens(e.name) })
      activeEmpIds.add(e.id)
      empNorms.add(norm)
    }
    for (const u of usrRes.data || []) {
      if (!u.name) continue
      // Skip an operator only when they're already represented by an ACTIVE
      // employee row — either linked to one (users.employee_id) or sharing its
      // name. This (a) collapses dual-identity people to their employee identity,
      // (b) keeps an operator linked to a non-active employee still assignable,
      // and (c) stops an unlinked same-name user from double-listing and turning
      // a real person into a false "ambiguous".
      if (u.employee_id && activeEmpIds.has(u.employee_id)) continue
      const norm = normalizeName(u.name)
      if (empNorms.has(norm)) continue
      candidates.push({ kind: 'user', id: u.id, norm, toks: nameTokens(u.name) })
    }

    let ingested = 0
    let deduped = 0
    let failed = 0

    for (const t of tasks) {
      const title = typeof t.title === 'string' ? t.title.trim() : ''
      if (!title) { failed++; continue } // a task with no title is unusable

      const priority = PRIORITY_MAP[t.priority ?? 'medium'] ?? 2
      const dueDate = validDate(t.due_date)
      const assigneeName =
        typeof t.assignee_name === 'string' && t.assignee_name.trim() ? t.assignee_name.trim() : null
      const notes = typeof t.notes === 'string' && t.notes.trim() ? t.notes.trim() : null
      const resolved = resolveAssignee(assigneeName, candidates)

      // Content-derived, chunk-independent key: same (meeting, normalized
      // title+assignee) → same ref → ON CONFLICT DO NOTHING collapses the dup.
      const digest = await sha256Hex(
        normalizeName(title) + '|' + (assigneeName ? normalizeName(assigneeName) : ''),
      )
      const sourceRef = `${meetingId}#${digest.slice(0, 16)}`

      // insert + catch unique_violation (23505) is the repo's dedup convention
      // (see worker-config dedup-claim). A re-extracted duplicate collides on the
      // (org_id, source, source_ref) unique constraint → counted as deduped, not
      // an error. Any other error → failed (and never thrown).
      const { error } = await supabase
        .from('pending_tasks')
        .insert({
          org_id: authed.org_id,
          source,
          source_ref: sourceRef,
          meeting_id: meetingId,
          source_meeting: sourceMeeting,
          title,
          notes,
          due_date: dueDate,
          priority,
          assignee_name: assigneeName,
          assignee_employee_id: resolved.employeeId ?? null,
          assignee_user_id: resolved.userId ?? null,
          assignee_ambiguous: resolved.ambiguous,
        })

      if (!error) ingested++
      else if (error.code === '23505') deduped++
      else failed++
    }

    return jsonResponse({ ingested, deduped, failed })
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Internal error' }, 500)
  }
})
