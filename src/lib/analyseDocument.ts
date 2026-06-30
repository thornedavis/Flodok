// Frontend client for the analyse-document edge function (Upload & Analyse).
//
// Reads an uploaded PDF as a base64 data URL and asks the server to turn
// it into a bilingual `DocumentDoc` plus extracted commercial-term fields.
// The server owns the OpenRouter (vision) call and the JSON-to-doc
// conversion; the client just shuttles the file and unwraps the result.
// Mirrors `aiGenerate.ts` — errors come back as thrown Error.

import { supabase } from './supabase'
import type { DocumentDoc } from './documentDoc'

// 'letter' is DOCX-only (imported as a reusable template, no PDF/vision path).
export type AnalyseDocType = 'sop' | 'contract' | 'nda' | 'job_description' | 'letter'

// Extraction language mode for the PDF/vision path (the import modal's picker):
// 'auto' = faithful (a monolingual source stays monolingual, no fabricated
// translation), 'en'/'id' = single-language draft, 'bilingual' = both sides
// (translate the missing one).
export type PdfExtractMode = 'auto' | 'en' | 'id' | 'bilingual'

export type AnalyseDocumentResult = {
  doc: DocumentDoc
  title: string
  // Commercial-term scalars keyed by column name (e.g. base_wage_idr,
  // survival_years). Values are already type-coerced server-side.
  fields: Record<string, string | number | null>
  // Per-field reviewer hint: "high" = clearly stated, "low" = check it.
  confidence: Record<string, 'high' | 'low'>
  // The language mode the server actually produced (echoes the request for
  // explicit modes; detected for 'auto'). Drives the created draft's
  // language_mode so a monolingual import isn't padded with a blank side.
  languageMode: 'bilingual' | 'en' | 'id'
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Could not read the file'))
    reader.readAsDataURL(file)
  })
}

export async function analyseDocument(
  file: File,
  docType: AnalyseDocType,
  mode: PdfExtractMode = 'auto',
): Promise<AnalyseDocumentResult> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')

  const fileData = await readAsDataUrl(file)

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyse-document`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      doc_type: docType,
      file_name: file.name,
      file_data: fileData,
      language_mode: mode,
    }),
  })
  if (!response.ok) {
    let msg = `Analysis failed (HTTP ${response.status})`
    try {
      const errBody = await response.json() as { error?: string }
      if (errBody.error) msg = errBody.error
    } catch { /* fall through */ }
    throw new Error(msg)
  }
  const result = await response.json() as Partial<AnalyseDocumentResult> & { error?: string }
  if (!result.doc) throw new Error(result.error || 'Empty analysis response')
  return {
    doc: result.doc,
    title: result.title ?? '',
    fields: result.fields ?? {},
    confidence: result.confidence ?? {},
    languageMode: result.languageMode === 'en' || result.languageMode === 'id' ? result.languageMode : 'bilingual',
  }
}
