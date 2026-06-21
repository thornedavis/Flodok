// Upload & analyse: turn an existing uploaded document (a PDF the org
// already has — an employment contract, NDA, or SOP) into a structured
// bilingual DocumentDoc plus a small set of extracted scalar fields, so
// migrating into Flodok doesn't mean re-typing everything by hand.
//
// Sibling of `generate-document`: same OpenRouter call, same JSON-mode
// response, same intermediate → DocumentDoc conversion. The differences:
//
//   1. Input is a PDF (sent as a `file` content-part / base64 data URL),
//      not a free-text prompt. We rely on a VISION-capable model that
//      reads PDFs natively (default google/gemini-2.5-flash-lite) — no
//      separate OCR step. Swap the model via OPENROUTER_ANALYSIS_MODEL.
//
//   2. Output carries `{ doc, title, fields, confidence }`. The body is
//      the bilingual doc; `fields` are the document-established
//      commercial terms (wage, dates, probation, NDA knobs) that exist
//      nowhere else for an uploaded file; `confidence` flags which
//      fields the human reviewer should double-check.
//
// What this deliberately does NOT extract: employee/org identity (name,
// KTP, address…). Those resolve from the linked employee via merge
// fields — re-OCR'ing a name we already hold as a clean row is strictly
// worse. The client links an employee separately.
//
// The result always lands as a `draft`; the human confirms the terms in
// the review step before anything is created. No auto-activation.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, jsonResponse } from '../_shared/auth.ts'
import { intermediateToDocumentDoc, type IntermediateDoc } from '../_shared/intermediateDoc.ts'

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'

type DocType = 'sop' | 'contract' | 'nda' | 'job_description'

const SYSTEM_PROMPT_BASE = `You analyse an existing workplace document (provided as a PDF) for an Indonesian HR platform and re-express it as a structured BILINGUAL record. The platform stores every document in BOTH English and Bahasa Indonesia, each block as a translated pair.

You MUST return ONLY a JSON object that matches this schema exactly:

{
  "title": "A short document title (e.g. the employee name + document kind, or the heading printed on the document).",
  "sections": [
    {
      "titleEn": "English section title",
      "titleId": "Bahasa Indonesia section title",
      "blocks": [
        {
          "en": ["First English paragraph.", "Second English paragraph."],
          "id": ["Paragraf pertama dalam Bahasa Indonesia.", "Paragraf kedua dalam Bahasa Indonesia."]
        }
      ]
    }
  ],
  "fields": { },
  "confidence": { }
}

Rules for the BODY (title + sections):
- Output VALID JSON only. No markdown fences, no commentary, no leading prose.
- Reproduce the document's actual content faithfully — do NOT invent clauses that aren't in the file. Preserve the meaning and structure of what you read.
- Every block MUST have parallel \`en\` and \`id\` arrays of equal length — each EN paragraph corresponds to one ID paragraph at the same index. If the source is only in one language, translate to fill the other side accurately.
- Each paragraph is a single plain-text string. NO markdown syntax (no #, no **, no -), NO line breaks within a string.
- Group related content into the same block; split into separate blocks when the topic shifts. Keep section titles short in both languages.

Rules for FIELDS and CONFIDENCE:
- \`fields\` holds the commercial terms listed below for this document type. Extract ONLY what is actually stated in the document. If a value is absent or unreadable, use null — never guess.
- Numbers must be plain integers with no separators or currency symbols (e.g. 8500000, not "Rp 8.500.000"). Dates must be ISO "YYYY-MM-DD".
- Do NOT extract the employee's name, ID number (KTP/NIK), address, or other personal identity — those are linked separately. Focus on the document body and the commercial terms.
- \`confidence\` maps each field key you filled to either "high" (clearly stated, unambiguous) or "low" (inferred, partially legible, or uncertain). Only include keys that are present in \`fields\`.`

const SOP_TAIL = `
Document type: Standard Operating Procedure (SOP).
- \`fields\` is an empty object {} for SOPs — there are no commercial terms.
- Capture purpose, scope, responsibilities, and the procedure steps as sections.`

const CONTRACT_TAIL = `
Document type: Indonesian employment contract.
- \`fields\` keys (extract only those stated): "contract_type" (one of "pkwt" for fixed-term or "pkwtt" for permanent), "base_wage_idr" (integer monthly base wage in IDR), "allowance_idr" (integer monthly allowance in IDR, or null), "annual_leave_days" (integer), "probation_months" (integer months of probation, or null), "hours_per_day" (number), "days_per_week" (integer), "start_date" (ISO), "end_date" (ISO, for fixed-term).
- Reference points: Indonesian labour law (UU 13/2003, UU 11/2020, PP 35/2021). PKWT = fixed term (has an end date), PKWTT = permanent (no end date).`

const NDA_TAIL = `
Document type: Non-Disclosure Agreement (one-way employee NDA).
- \`fields\` keys (extract only those stated): "effective_date" (ISO date the NDA takes effect), "survival_years" (integer years confidentiality survives after termination), "penalty_idr" (integer penalty/liquidated-damages amount in IDR, or null).`

const JD_TAIL = `
Document type: Job description.
- \`fields\` is an empty object {} for job descriptions — there are no commercial terms to extract.
- Capture the role overview, key responsibilities, required and preferred qualifications, and reporting relationships as sections. Describe the ROLE, not a specific person.`

// Per-type whitelist + coercion. We never trust the model's field object
// blindly — we keep only known keys and coerce to the column's type, so a
// stray string can't reach a numeric column downstream.
function sanitizeFields(docType: DocType, raw: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (!raw || typeof raw !== 'object') return out
  const f = raw as Record<string, unknown>

  const asInt = (v: unknown): number | null => {
    if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v)
    if (typeof v === 'string') {
      const n = Number(v.replace(/[^\d.-]/g, ''))
      return Number.isFinite(n) ? Math.round(n) : null
    }
    return null
  }
  const asNum = (v: unknown): number | null => {
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string') {
      const n = Number(v.replace(/[^\d.-]/g, ''))
      return Number.isFinite(n) ? n : null
    }
    return null
  }
  const asDate = (v: unknown): string | null => {
    if (typeof v !== 'string') return null
    const m = v.match(/\d{4}-\d{2}-\d{2}/)
    return m ? m[0] : null
  }

  if (docType === 'contract') {
    const ct = typeof f.contract_type === 'string' ? f.contract_type.toLowerCase() : ''
    if (ct === 'pkwt' || ct === 'pkwtt') out.contract_type = ct
    if ('base_wage_idr' in f) out.base_wage_idr = asInt(f.base_wage_idr)
    if ('allowance_idr' in f) out.allowance_idr = asInt(f.allowance_idr)
    if ('annual_leave_days' in f) out.annual_leave_days = asInt(f.annual_leave_days)
    if ('probation_months' in f) out.probation_months = asInt(f.probation_months)
    if ('hours_per_day' in f) out.hours_per_day = asNum(f.hours_per_day)
    if ('days_per_week' in f) out.days_per_week = asInt(f.days_per_week)
    if ('start_date' in f) out.start_date = asDate(f.start_date)
    if ('end_date' in f) out.end_date = asDate(f.end_date)
  } else if (docType === 'nda') {
    if ('effective_date' in f) out.effective_date = asDate(f.effective_date)
    if ('survival_years' in f) out.survival_years = asInt(f.survival_years)
    if ('penalty_idr' in f) out.penalty_idr = asInt(f.penalty_idr)
  }
  return out
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  // Auth check via Supabase — gating on a valid session keeps
  // unauthenticated callers out (and off our OpenRouter bill).
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: user } = await supabase.auth.getUser()
  if (!user.user) return jsonResponse({ error: 'Not authenticated' }, 401)

  let body: { doc_type?: unknown; file_data?: unknown; file_name?: unknown }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400)
  }

  const docType: DocType =
    body.doc_type === 'contract' ? 'contract'
    : body.doc_type === 'nda' ? 'nda'
    : body.doc_type === 'job_description' ? 'job_description'
    : 'sop'

  const fileData = typeof body.file_data === 'string' ? body.file_data : ''
  if (!fileData.startsWith('data:application/pdf')) {
    return jsonResponse({ error: 'Expected a PDF file (data:application/pdf;base64,…)' }, 400)
  }
  const fileName = typeof body.file_name === 'string' && body.file_name.trim()
    ? body.file_name.trim()
    : 'document.pdf'

  const apiKey = Deno.env.get('OPENROUTER_API_KEY')
  if (!apiKey) {
    return jsonResponse({ error: 'OPENROUTER_API_KEY not set' }, 500)
  }
  // Dedicated channel for this use case — a separate env var so the
  // analysis model can be configured independently of generation /
  // translation. Default is a cheap vision model that reads PDFs natively.
  const model = Deno.env.get('OPENROUTER_ANALYSIS_MODEL') || 'google/gemini-2.5-flash-lite'

  const tail =
    docType === 'contract' ? CONTRACT_TAIL
    : docType === 'nda' ? NDA_TAIL
    : docType === 'job_description' ? JD_TAIL
    : SOP_TAIL
  const systemPrompt = SYSTEM_PROMPT_BASE + tail

  let modelResponse: Response
  try {
    modelResponse = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://flodok.com',
        'X-Title': 'Flodok Document Analysis',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Analyse the attached document and return the JSON described in the system prompt. Reproduce its content faithfully and extract only the commercial terms that are actually stated.',
              },
              {
                type: 'file',
                file: { filename: fileName, file_data: fileData },
              },
            ],
          },
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' },
      }),
    })
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Model call failed' }, 502)
  }

  if (!modelResponse.ok) {
    const text = await modelResponse.text().catch(() => '')
    console.error('OpenRouter analysis failed:', modelResponse.status, text)
    return jsonResponse({ error: `OpenRouter returned ${modelResponse.status}` }, 502)
  }

  const completion = await modelResponse.json().catch(() => null) as {
    choices?: Array<{ message?: { content?: string } }>
  } | null
  const content = completion?.choices?.[0]?.message?.content
  if (typeof content !== 'string') {
    return jsonResponse({ error: 'Empty model response' }, 502)
  }

  let parsed: IntermediateDoc & { title?: unknown; fields?: unknown; confidence?: unknown }
  try {
    parsed = JSON.parse(content)
  } catch {
    return jsonResponse({ error: 'Model returned invalid JSON' }, 502)
  }

  const doc = intermediateToDocumentDoc(parsed)
  if (!doc.content || doc.content.length === 0) {
    return jsonResponse({ error: 'Could not read any document content from the file' }, 502)
  }

  const title = typeof parsed.title === 'string' ? parsed.title.trim() : ''
  const fields = sanitizeFields(docType, parsed.fields)
  // Keep confidence only for keys we actually kept in `fields`.
  const rawConf = (parsed.confidence && typeof parsed.confidence === 'object')
    ? parsed.confidence as Record<string, unknown>
    : {}
  const confidence: Record<string, 'high' | 'low'> = {}
  for (const key of Object.keys(fields)) {
    confidence[key] = rawConf[key] === 'high' ? 'high' : 'low'
  }

  return jsonResponse({ doc, title, fields, confidence })
})
