// Structured-document AI generation (Phase G.3).
//
// Replaces the old `generate-sop` function which produced freeform
// markdown for the markdown-based editor. The new editor operates on
// a structured DocumentDoc (Document → Section → BilingualBlock), so
// generation needs to land in that shape directly — otherwise the
// output isn't editable, can't carry bilingual content, and has to
// be re-parsed before display.
//
// Strategy:
//   1. Ask the model (via OpenRouter, JSON-object response_format) to
//      produce a *simplified* intermediate shape — sections with EN/ID
//      titles and an array of blocks, each block carrying parallel EN
//      and ID paragraphs as plain strings.
//   2. Convert that intermediate shape to a real ProseMirror-flavoured
//      DocumentDoc on the server. Plain paragraphs only — no lists,
//      headings, or marks. Robust and predictable; the editor still
//      lets the user upgrade individual blocks afterwards.
//
// Why JSON mode (not raw markdown):
//   - LLMs reliably produce well-formed JSON when asked to. Parsing a
//     freeform-markdown bilingual doc into sections/blocks is fragile.
//   - We get the bilingual split for free — the model is told to fill
//     both languages, so no second translation pass on first save.
//
// Why simplified intermediate shape (not full ProseMirror JSON):
//   - LLMs struggle with exact ProseMirror node shapes (attrs, ids).
//   - Keeping conversion server-side means the model just produces
//     content and we own structural correctness.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, jsonResponse } from '../_shared/auth.ts'
import type { DocNode, DocumentDoc } from '../_shared/documentDoc.ts'

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'

type DocType = 'sop' | 'contract' | 'job_description'

type IntermediateBlock = {
  en: string[]
  id: string[]
}

type IntermediateSection = {
  titleEn: string
  titleId: string
  blocks: IntermediateBlock[]
}

type IntermediateDoc = {
  sections: IntermediateSection[]
}

const SYSTEM_PROMPT_BASE = `You generate structured bilingual workplace documents for an Indonesian HR platform. Every document is authored in BOTH English and Bahasa Indonesia, with each block translated as a pair.

You MUST return ONLY a JSON object that matches this schema exactly:

{
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
  ]
}

Rules:
- Output VALID JSON only. No markdown fences, no commentary, no leading prose.
- Every block MUST have parallel \`en\` and \`id\` arrays of equal length — each EN paragraph corresponds to one ID paragraph at the same index.
- Each paragraph is a single plain-text string. NO markdown syntax (no #, no **, no -), NO line breaks within a string.
- Group related content into the same block (translation parity matters at the block level). Split into separate blocks when the topic shifts.
- 4–10 sections is typical. Keep titles short and descriptive in both languages.
- Use formal but accessible language appropriate for workplace documentation.`

const SOP_PROMPT_TAIL = `
Document type: Standard Operating Procedure (SOP).
- Standard sections: Purpose / Scope / Responsibilities / Procedure / Notes — but tailor to the request.
- Be specific and actionable. Each procedure step should be clear enough for someone new to follow.`

const CONTRACT_PROMPT_TAIL = `
Document type: Indonesian employment contract.
- Standard sections include Position & Duties, Compensation, Working Hours, Leave, BPJS, Termination, Confidentiality, General Provisions.
- Reference Indonesian labour law where relevant (UU 13/2003, UU 11/2020 Cipta Kerja, PP 35/2021).
- Keep clauses concise — orgs will customise the boilerplate.`

const JOB_DESCRIPTION_PROMPT_TAIL = `
Document type: Job description.
- Standard sections: Job Overview / Key Responsibilities / Required Qualifications / Preferred Qualifications / Reporting & Working Relationships — but tailor to the request.
- Describe the role, not a specific person. Use clear, outcome-focused language for responsibilities.
- Qualifications should be concrete and screenable (skills, experience, certifications).`

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

  // Auth check via Supabase — we don't read user-scoped data here, but
  // gating on a valid session keeps unauthenticated callers out.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: user } = await supabase.auth.getUser()
  if (!user.user) return jsonResponse({ error: 'Not authenticated' }, 401)

  let body: { prompt?: unknown; doc_type?: unknown; title?: unknown }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400)
  }
  if (typeof body.prompt !== 'string' || !body.prompt.trim()) {
    return jsonResponse({ error: 'Missing prompt' }, 400)
  }
  const docType: DocType =
    body.doc_type === 'contract' ? 'contract'
    : body.doc_type === 'job_description' ? 'job_description'
    : 'sop'
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  const prompt = body.prompt.trim()

  const apiKey = Deno.env.get('OPENROUTER_API_KEY')
  if (!apiKey) {
    return jsonResponse({ error: 'OPENROUTER_API_KEY not set' }, 500)
  }
  const model = Deno.env.get('OPENROUTER_GENERATION_MODEL') || 'openai/gpt-5.4-mini'

  const promptTail =
    docType === 'contract' ? CONTRACT_PROMPT_TAIL
    : docType === 'job_description' ? JOB_DESCRIPTION_PROMPT_TAIL
    : SOP_PROMPT_TAIL
  const systemPrompt = SYSTEM_PROMPT_BASE + promptTail
  let userMessage = ''
  if (title) userMessage += `Document title: ${title}\n\n`
  userMessage += `Request: ${prompt}`

  let modelResponse: Response
  try {
    modelResponse = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://flodok.com',
        'X-Title': 'Flodok Document Generation',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.6,
        response_format: { type: 'json_object' },
      }),
    })
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Model call failed' }, 502)
  }

  if (!modelResponse.ok) {
    const text = await modelResponse.text().catch(() => '')
    console.error('OpenRouter generation failed:', modelResponse.status, text)
    return jsonResponse({ error: `OpenRouter returned ${modelResponse.status}` }, 502)
  }

  const completion = await modelResponse.json().catch(() => null) as {
    choices?: Array<{ message?: { content?: string } }>
  } | null
  const content = completion?.choices?.[0]?.message?.content
  if (typeof content !== 'string') {
    return jsonResponse({ error: 'Empty model response' }, 502)
  }

  let intermediate: IntermediateDoc
  try {
    intermediate = JSON.parse(content)
  } catch {
    return jsonResponse({ error: 'Model returned invalid JSON' }, 502)
  }

  const doc = intermediateToDocumentDoc(intermediate)
  if (!doc.content || doc.content.length === 0) {
    return jsonResponse({ error: 'Model returned no sections' }, 502)
  }

  return jsonResponse({ doc })
})

// ─── Intermediate → DocumentDoc ────────────────────────────────────

function newId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 10)
  const time = Date.now().toString(36).slice(-4)
  return `${prefix}_${time}${random}`
}

function paraNode(textValue: string): DocNode {
  const trimmed = textValue.trim()
  if (!trimmed) return { type: 'paragraph' }
  return { type: 'paragraph', content: [{ type: 'text', text: trimmed }] }
}

function intermediateToDocumentDoc(input: IntermediateDoc): DocumentDoc {
  const sections: DocNode[] = []
  const rawSections = Array.isArray(input.sections) ? input.sections : []
  for (const s of rawSections) {
    if (!s || typeof s !== 'object') continue
    const titleEn = typeof s.titleEn === 'string' ? s.titleEn.trim() : ''
    const titleId = typeof s.titleId === 'string' ? s.titleId.trim() : ''
    const rawBlocks = Array.isArray(s.blocks) ? s.blocks : []
    const blocks: DocNode[] = []
    for (const b of rawBlocks) {
      if (!b || typeof b !== 'object') continue
      const enParas = Array.isArray(b.en) ? b.en.filter(p => typeof p === 'string') : []
      const idParas = Array.isArray(b.id) ? b.id.filter(p => typeof p === 'string') : []
      // Pad shorter side with empty paragraphs so the bilingual block
      // always has *some* content on both sides — the editor expects
      // both blockBody children to be present.
      const enContent = (enParas.length > 0 ? enParas : ['']).map(paraNode)
      const idContent = (idParas.length > 0 ? idParas : ['']).map(paraNode)
      blocks.push({
        type: 'bilingualBlock',
        attrs: { id: newId('blk'), needsReview: false },
        content: [
          { type: 'blockBody', attrs: { lang: 'en' }, content: enContent },
          { type: 'blockBody', attrs: { lang: 'id' }, content: idContent },
        ],
      })
    }
    // A section needs at least one block; skip empty sections so the
    // editor doesn't render placeholder rows.
    if (blocks.length === 0) continue
    sections.push({
      type: 'section',
      attrs: {
        id: newId('sec'),
        titleEn,
        titleId,
        accentColor: null,
        numberingStyle: 'decimal',
        boxed: false,
      },
      content: blocks,
    })
  }
  return { type: 'document', content: sections }
}
