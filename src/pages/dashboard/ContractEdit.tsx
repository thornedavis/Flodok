import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { SOPEditor } from '../../components/Editor'
import type { User, Contract, Tag, Employee } from '../../types/database'

const GENERATE_SYSTEM_PROMPT = `You are an expert employment contract writer for workplace documentation.

You either generate new contracts or revise existing ones based on the user's instructions.

When creating a new contract:
- Structure logically: Parties, Position & Duties, Compensation, Working Hours, Leave, Termination, Confidentiality, General Provisions
- Be specific and legally clear — each clause should be unambiguous

When revising an existing contract:
- Apply the user's requested changes to the existing content
- Preserve sections and content the user did not ask to change
- Return the complete revised contract, not just the changed parts

Rules for all responses:
- Use clear markdown formatting: headings (#, ##, ###), bullet lists, numbered clauses, bold for emphasis
- Use professional legal language that is still accessible
- Tailor the content to the employee's role and department if provided
- Keep it practical and relevant
- Do not include meta-commentary or explanations — output ONLY the contract markdown content`

export function ContractEdit({ user }: { user: User }) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [contract, setContract] = useState<Contract | null>(null)
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [allEmployees, setAllEmployees] = useState<Employee[]>([])
  const [employeeId, setEmployeeId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [contentId, setContentId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'en' | 'id'>('en')
  const [translating, setTranslating] = useState(false)
  const [translateDone, setTranslateDone] = useState(false)
  const [status, setStatus] = useState<'active' | 'draft' | 'archived'>('draft')
  const [changeSummary] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [aiPrompt, setAiPrompt] = useState('')
  const [generating, setGenerating] = useState(false)

  const [allTags, setAllTags] = useState<Tag[]>([])
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set())
  const [newTagName, setNewTagName] = useState('')

  useEffect(() => {
    async function load() {
      const [contractResult, tagsResult, contractTagsResult, empsResult] = await Promise.all([
        supabase.from('contracts').select('*').eq('id', id!).single(),
        supabase.from('tags').select('*').eq('org_id', user.org_id).order('name'),
        supabase.from('contract_tags').select('tag_id').eq('contract_id', id!),
        supabase.from('employees').select('*').eq('org_id', user.org_id).order('name'),
      ])

      setAllEmployees(empsResult.data || [])

      if (contractResult.data) {
        setContract(contractResult.data)
        setTitle(contractResult.data.title)
        setContent(contractResult.data.content_markdown)
        setContentId(contractResult.data.content_markdown_id)
        setStatus(contractResult.data.status)
        setEmployeeId(contractResult.data.employee_id)

        if (contractResult.data.employee_id) {
          const emp = (empsResult.data || []).find(e => e.id === contractResult.data.employee_id)
          if (emp) setEmployee(emp)
        }
      }

      setAllTags(tagsResult.data || [])
      setSelectedTagIds(new Set((contractTagsResult.data || []).map(ct => ct.tag_id)))
    }
    load()
  }, [id, user.org_id])

  function toggleTag(tagId: string) {
    setSelectedTagIds(prev => {
      const next = new Set(prev)
      if (next.has(tagId)) next.delete(tagId); else next.add(tagId)
      return next
    })
  }

  async function handleCreateTag() {
    const name = newTagName.trim()
    if (!name) return
    const { data, error } = await supabase.from('tags').insert({ org_id: user.org_id, name }).select().single()
    if (error) { alert(error.message); return }
    if (data) {
      setAllTags(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
      setSelectedTagIds(prev => new Set([...prev, data.id]))
      setNewTagName('')
    }
  }

  async function handleTranslate(direction: 'en-to-id' | 'id-to-en') {
    if (!contract) return
    setTranslating(true)
    setTranslateDone(false)
    setError('')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setError('Not authenticated'); setTranslating(false); return }

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 55000)

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/translate-sop`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ sop_id: contract.id, direction, table: 'contracts' }),
          signal: controller.signal,
        },
      )
      clearTimeout(timeout)

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || `Translation failed (${response.status})`)
      }

      const { data } = await supabase.from('contracts').select('*').eq('id', contract.id).single()
      if (data) {
        setContract(data)
        if (direction === 'en-to-id') setContentId(data.content_markdown_id)
        else setContent(data.content_markdown)
      }

      setTranslateDone(true)
      setTimeout(() => setTranslateDone(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Translation failed')
    }
    setTranslating(false)
  }

  async function handleGenerate() {
    if (!aiPrompt.trim() || generating) return
    setGenerating(true)
    setError('')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setError('Not authenticated'); setGenerating(false); return }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-sop`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({
            prompt: aiPrompt,
            employee_name: employee?.name,
            department: employee?.department,
            title,
            existing_content: content || undefined,
            system_prompt: GENERATE_SYSTEM_PROMPT,
          }),
        },
      )

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || `Generation failed (${response.status})`)
      }

      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let generated = ''
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6)
          if (data === '[DONE]') continue
          try {
            const parsed = JSON.parse(data)
            const delta = parsed.choices?.[0]?.delta?.content
            if (delta) generated += delta
          } catch { /* skip */ }
        }
      }

      if (generated) setContent(generated)
      setAiPrompt('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
    }
    setGenerating(false)
  }

  const enChanged = contract ? content !== contract.content_markdown : false
  const idChanged = contract ? contentId !== contract.content_markdown_id : false
  const employeeChanged = contract ? employeeId !== contract.employee_id : false
  const hasChanges = contract ? (
    enChanged || idChanged || employeeChanged ||
    title !== contract.title ||
    status !== contract.status ||
    changeSummary !== ''
  ) : false

  async function handleSave() {
    if (!contract) return
    setError('')
    setSaving(true)

    const newVersion = contract.current_version + 1
    const contentChanged = enChanged || idChanged

    const { error: updateError } = await supabase
      .from('contracts')
      .update({
        title,
        employee_id: employeeId,
        content_markdown: content,
        content_markdown_id: contentId,
        status,
        current_version: contentChanged ? newVersion : contract.current_version,
        updated_at: new Date().toISOString(),
      })
      .eq('id', contract.id)

    if (updateError) { setError(updateError.message); setSaving(false); return }

    if (contentChanged) {
      await supabase.from('contract_versions').insert({
        contract_id: contract.id,
        version_number: newVersion,
        content_markdown: content,
        change_summary: changeSummary || null,
        changed_by: user.id,
      })

      if (contract.employee_id) {
        await supabase.from('feed_events').insert({
          org_id: user.org_id,
          employee_id: contract.employee_id,
          event_type: 'contract_updated',
          title: title,
          description: `Version ${newVersion}${changeSummary ? ' — ' + changeSummary : ''}`,
          metadata: { contract_id: contract.id, version: newVersion },
        })
      }
    }

    await supabase.from('contract_tags').delete().eq('contract_id', contract.id)
    if (selectedTagIds.size > 0) {
      await supabase.from('contract_tags').insert(
        [...selectedTagIds].map(tag_id => ({ contract_id: contract.id, tag_id }))
      )
    }

    setSaving(false)
    navigate('/dashboard/contracts')
  }

  if (!contract) return <div style={{ color: 'var(--color-text-secondary)' }}>Loading...</div>

  const inputStyle = { borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' } as React.CSSProperties

  const statusColors: Record<string, string> = {
    active: 'var(--color-success)',
    draft: 'var(--color-warning)',
    archived: 'var(--color-text-tertiary)',
  }

  const translateDirection = activeTab === 'en' ? 'en-to-id' : 'id-to-en'
  const hasSourceContent = activeTab === 'en' ? !!content : !!contentId
  const needsSaveBeforeTranslate = activeTab === 'en' ? enChanged : idChanged

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>Edit Contract</h1>
        <div className="flex items-center gap-3">
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: statusColors[status] }} />
            <select
              value={status}
              onChange={e => setStatus(e.target.value as typeof status)}
              className="appearance-none rounded-lg border py-2 pl-7 pr-8 text-sm font-medium"
              style={{ ...inputStyle, color: statusColors[status] }}
            >
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
            <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-tertiary)' }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
          <button onClick={handleSave} disabled={saving || !hasChanges}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50" style={{ backgroundColor: 'var(--color-primary)' }}>
            {saving ? (
              <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Saving...</>
            ) : 'Save'}
          </button>
          <button onClick={() => navigate('/dashboard/contracts')} className="rounded-lg border px-4 py-2 text-sm" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>Cancel</button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md px-3 py-2 text-sm" style={{ backgroundColor: 'var(--color-diff-remove)', color: 'var(--color-danger)' }}>{error}</div>
      )}

      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>Title</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>Employee</label>
            <div className="relative">
              <select
                value={employeeId || ''}
                onChange={e => {
                  const val = e.target.value
                  setEmployeeId(val || null)
                  setEmployee(allEmployees.find(emp => emp.id === val) || null)
                }}
                className="w-full appearance-none rounded-lg border px-3 py-2 pr-8 text-sm"
                style={inputStyle}
              >
                <option value="">No employee linked</option>
                {allEmployees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name}{emp.department ? ` (${emp.department})` : ''}</option>
                ))}
              </select>
              <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-tertiary)' }}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>Tags</label>
            <div className="flex flex-wrap gap-2">
              {allTags.map(tag => {
                const isSelected = selectedTagIds.has(tag.id)
                return (
                  <button key={tag.id} type="button" onClick={() => toggleTag(tag.id)}
                    className="rounded-full border px-3 py-1 text-xs font-medium transition-all"
                    style={{
                      borderColor: isSelected ? 'var(--color-primary)' : 'var(--color-border)',
                      backgroundColor: isSelected ? 'color-mix(in srgb, var(--color-primary) 12%, transparent)' : 'transparent',
                      color: isSelected ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                    }}
                  >
                    {tag.name}
                  </button>
                )
              })}
              <div className="flex items-center gap-1">
                <input type="text" value={newTagName} onChange={e => setNewTagName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreateTag() } }}
                  placeholder="New tag..." className="w-24 rounded-full border px-3 py-1 text-xs outline-none" style={inputStyle} />
                {newTagName.trim() && (
                  <button type="button" onClick={handleCreateTag} className="rounded-full px-2 py-1 text-xs font-medium" style={{ color: 'var(--color-primary)' }}>+ Add</button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>Content</label>
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg border p-0.5" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
                <button type="button" onClick={() => setActiveTab('en')} className="rounded-md px-3 py-1 text-xs font-medium transition-colors"
                  style={{ backgroundColor: activeTab === 'en' ? 'var(--color-bg)' : 'transparent', color: activeTab === 'en' ? 'var(--color-text)' : 'var(--color-text-tertiary)', boxShadow: activeTab === 'en' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none' }}>
                  English
                </button>
                <button type="button" onClick={() => setActiveTab('id')} className="rounded-md px-3 py-1 text-xs font-medium transition-colors"
                  style={{ backgroundColor: activeTab === 'id' ? 'var(--color-bg)' : 'transparent', color: activeTab === 'id' ? 'var(--color-text)' : 'var(--color-text-tertiary)', boxShadow: activeTab === 'id' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none' }}>
                  Bahasa Indonesia
                </button>
              </div>
              <button type="button" onClick={() => handleTranslate(translateDirection)} disabled={translating || !hasSourceContent || needsSaveBeforeTranslate}
                title={needsSaveBeforeTranslate ? 'Save your changes before translating' : undefined}
                className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all disabled:opacity-50"
                style={{ borderColor: translateDone ? 'var(--color-success, #22c55e)' : 'var(--color-border)', color: translateDone ? 'var(--color-success, #22c55e)' : 'var(--color-text-secondary)' }}
                onMouseOver={e => { if (!translateDone) e.currentTarget.style.borderColor = 'var(--color-primary)' }}
                onMouseOut={e => { if (!translateDone) e.currentTarget.style.borderColor = 'var(--color-border)' }}
              >
                {translating ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                ) : translateDone ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/>
                  </svg>
                )}
                {needsSaveBeforeTranslate ? 'Save before translating' : translating ? 'Translating...' : translateDone ? 'Complete' : (
                  activeTab === 'en'
                    ? (contentId ? 'Re-translate to ID' : 'Translate to ID')
                    : (content ? 'Re-translate to EN' : 'Translate to EN')
                )}
              </button>
            </div>
          </div>

          {activeTab === 'en' ? (
            <SOPEditor key="en" content={content} onChange={setContent} />
          ) : (
            <SOPEditor key="id" content={contentId || ''} onChange={setContentId} />
          )}
        </div>

        <div className="rounded-xl border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary, var(--color-bg))' }}>
          <label className="mb-2 flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-primary)' }}>
              <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
            </svg>
            AI Generate
          </label>
          <div className="flex gap-2">
            <input type="text" value={aiPrompt} onChange={e => setAiPrompt(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleGenerate() } }}
              placeholder={content
                ? 'e.g. "Add a non-compete clause" or "Update the probation period to 6 months"'
                : `e.g. "Generate an employment contract for a ${employee?.department || 'full-time'} position"`}
              disabled={generating} className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none disabled:opacity-50" style={inputStyle} />
            <button type="button" onClick={handleGenerate} disabled={generating || !aiPrompt.trim()}
              className="flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60" style={{ backgroundColor: 'var(--color-primary)' }}>
              {generating && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>}
              {generating ? 'Generating...' : 'Generate'}
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
