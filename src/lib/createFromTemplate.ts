// "Use this template" — create a new document seeded from a
// `document_templates` row and return the path to its editor.
//
// Job descriptions reuse the existing deferred flow: their editor already
// reads `?template=` on the /new route and seeds itself on load (and only
// inserts a row on first save). The eager types (sop / contract / letter)
// insert a draft row here, copying the template's body — and, for
// contracts, the structured starter fields the template carries (wages,
// hours, leave, probation, pkwt/pkwtt) so the new draft opens pre-filled.

import { supabase } from './supabase'
import { docAsJson, emptyDocumentDoc, type LanguageMode } from './documentDoc'
import { documentEditPath, type DocumentType } from './documentTypes'
import { seedContractComponentsFromTemplate } from './contractTemplates'

export async function createDocFromTemplate(
  templateId: string,
  type: DocumentType,
  user: { id: string; org_id: string },
): Promise<string> {
  // JD has a deferred new-from-template flow its editor already understands.
  if (type === 'job_description') {
    return `/dashboard/hiring/jds/new?template=${templateId}`
  }

  const { data: tpl, error: tplError } = await supabase
    .from('document_templates')
    .select('*')
    .eq('id', templateId)
    .single()
  if (tplError || !tpl) throw new Error(tplError?.message ?? 'Template not found')

  // Shared draft fields. Carry the template title so the new draft opens
  // with a sensible name the user can rename.
  const base = {
    org_id: user.org_id,
    title: tpl.title ?? '',
    status: 'draft' as const,
    content_doc: tpl.content_doc ?? docAsJson(emptyDocumentDoc()),
  }

  // Carry the template's monolingual flag onto the new draft so it keeps
  // rendering full-width (and doesn't sprout an empty off-side column). The
  // template's content_doc already has the off-side cleared, so only the flag
  // needs copying. Done as a follow-up update because database.ts doesn't yet
  // type the language_mode column; bilingual (the default) needs no write.
  const mode = (tpl as { language_mode?: LanguageMode }).language_mode ?? 'bilingual'
  async function applyMode(table: 'sops' | 'letters' | 'ndas' | 'contracts', rowId: string) {
    if (mode !== 'bilingual') {
      const { error } = await supabase.from(table).update({ language_mode: mode } as never).eq('id', rowId)
      if (error) console.warn('Failed to copy language_mode from template:', error.message)
    }
  }

  if (type === 'sop') {
    const { data, error } = await supabase.from('sops').insert(base).select('id').single()
    if (error || !data) throw new Error(error?.message ?? 'Could not create SOP')
    await applyMode('sops', data.id)
    return documentEditPath('sop', data.id)
  }

  if (type === 'letter') {
    const { data, error } = await supabase
      .from('letters')
      .insert({ ...base, sender_user_id: user.id })
      .select('id')
      .single()
    if (error || !data) throw new Error(error?.message ?? 'Could not create letter')
    await applyMode('letters', data.id)
    return documentEditPath('letter', data.id)
  }

  if (type === 'nda') {
    // `document_templates` carries no NDA-specific columns (survival_years /
    // penalty_idr), so seed the draft from the base fields only; the editor
    // applies its own defaults.
    const { data, error } = await supabase.from('ndas').insert(base).select('id').single()
    if (error || !data) throw new Error(error?.message ?? 'Could not create NDA')
    await applyMode('ndas', data.id)
    return documentEditPath('nda', data.id)
  }

  // Contract — copy the structured starter fields alongside the body.
  const contractType = tpl.contract_type ?? 'pkwt'
  const { data, error } = await supabase
    .from('contracts')
    .insert({
      ...base,
      contract_type: contractType,
      base_wage_idr: tpl.base_wage_idr,
      allowance_idr: tpl.allowance_idr,
      hours_per_day: tpl.hours_per_day,
      days_per_week: tpl.days_per_week,
      annual_leave_days: tpl.annual_leave_days ?? 12,
      // Probation is PKWTT-only — never carry it onto a PKWT contract, or the
      // editor reads the fresh draft as "unsaved" on open (parsedProbationMonths
      // is force-nulled for PKWT). The DB trigger (migration 212) enforces this
      // too; keeping it explicit here documents the intent at the create site.
      probation_months: contractType === 'pkwtt' ? tpl.probation_months : null,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(error?.message ?? 'Could not create contract')
  await applyMode('contracts', data.id)
  // Seed the itemised allowance breakdown (trigger then derives allowance_idr).
  await seedContractComponentsFromTemplate(data.id, user.org_id, tpl)
  return documentEditPath('contract', data.id)
}
