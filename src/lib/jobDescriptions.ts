// Job-description workflow helpers — RPC wrappers, status enums, seed
// document builder, doc-number suggestion.

import { supabase } from './supabase'
import { emptyBlock, newSectionId, type DocumentDoc } from './documentDoc'
import type { JobDescription } from '../types/aliases'

export const JD_STATUSES = ['draft', 'published', 'archived'] as const
export type JobDescriptionStatus = typeof JD_STATUSES[number]

export function isJdEditable(status: JobDescriptionStatus): boolean {
  // Only drafts are editable. Published JDs are frozen — to change one,
  // archive it and create a new draft (matches the pattern we have for
  // contracts, where active contracts are immutable from the editor).
  return status === 'draft'
}

export function jdStatusTone(status: JobDescriptionStatus): 'neutral' | 'success' | 'muted' {
  switch (status) {
    case 'draft': return 'neutral'
    case 'published': return 'success'
    case 'archived': return 'muted'
  }
}

// ─── Seed document ──────────────────────────────────────────────────────
//
// New JDs start from this template — six load-bearing sections that match
// the paper-form structure. Section titles are bilingual; the body of each
// section is one empty bilingual block that the user fills in.

const JD_SECTIONS: ReadonlyArray<{ titleEn: string; titleId: string }> = [
  { titleEn: 'Job Overview',           titleId: 'Gambaran Pekerjaan' },
  { titleEn: 'Key Responsibilities',   titleId: 'Tanggung Jawab Utama' },
  { titleEn: 'Competencies',           titleId: 'Kompetensi' },
  { titleEn: 'Key Performance Indicators', titleId: 'Indikator Kinerja Utama (KPI)' },
  { titleEn: 'Coordination',           titleId: 'Koordinasi' },
  { titleEn: 'General Requirements',   titleId: 'Persyaratan Umum' },
]

export function buildJobDescriptionSeedDoc(): DocumentDoc {
  return {
    type: 'document',
    content: JD_SECTIONS.map(s => ({
      type: 'section',
      attrs: {
        id: newSectionId(),
        titleEn: s.titleEn,
        titleId: s.titleId,
        accentColor: null,
        numberingStyle: 'decimal',
        boxed: false,
      },
      content: [emptyBlock()],
    })),
  }
}

// ─── Doc-number suggestion ──────────────────────────────────────────────

/**
 * Suggest a default doc number like "HR-JD/ENG/2026/Ver01". The user is
 * expected to override if their org uses a different convention — the
 * column is free text by design.
 */
export function suggestDocVersion(departmentName: string | null): string {
  const dept = departmentSlug(departmentName) || 'GEN'
  const year = new Date().getFullYear()
  return `HR-JD/${dept}/${year}/Ver01`
}

function departmentSlug(name: string | null): string {
  if (!name) return ''
  // First word, uppercase, ASCII letters only, max 6 chars. Good enough as
  // a default; users with stricter numbering schemes will just edit.
  const first = name.split(/\s+/)[0] ?? ''
  return first.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 6)
}

// ─── RPC wrappers ───────────────────────────────────────────────────────

export async function publishJobDescription(id: string): Promise<JobDescription> {
  const { data, error } = await supabase.rpc('publish_job_description', { p_id: id })
  if (error) throw new Error(error.message)
  return data as unknown as JobDescription
}

export async function archiveJobDescription(id: string): Promise<JobDescription> {
  const { data, error } = await supabase.rpc('archive_job_description', { p_id: id })
  if (error) throw new Error(error.message)
  return data as unknown as JobDescription
}
