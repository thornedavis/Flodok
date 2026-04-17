import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { SOPEditor } from '../../components/Editor'
import { useLang } from '../../contexts/LanguageContext'
import type { User, Sop, Tag, Employee } from '../../types/database'

function fireTranslation(sopId: string, direction: 'en-to-id' | 'id-to-en') {
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (!session) return
    fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/translate-sop`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ sop_id: sopId, direction }),
    }).catch(() => {})
  })
}

export function SOPEdit({ user }: { user: User }) {
  const { t } = useLang()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [sop, setSOP] = useState<Sop | null>(null)
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

  // AI generation
  const [aiPrompt, setAiPrompt] = useState('')
  const [generating, setGenerating] = useState(false)

  // Tags
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set())
  const [newTagName, setNewTagName] = useState('')

  useEffect(() => {
    async function load() {
      const [sopResult, tagsResult, sopTagsResult, empsResult] = await Promise.all([
        supabase.from('sops').select('*').eq('id', id!).single(),
        supabase.from('tags').select('*').eq('org_id', user.org_id).order('name'),
        supabase.from('sop_tags').select('tag_id').eq('sop_id', id!),
        supabase.from('employees').select('*').eq('org_id', user.org_id).order('name'),
      ])

      setAllEmployees(empsResult.data || [])

      if (sopResult.data) {
        setSOP(sopResult.data)
        setTitle(sopResult.data.title)
        setContent(sopResult.data.content_markdown)
        setContentId(sopResult.data.content_markdown_id)
        setStatus(sopResult.data.status)
        setEmployeeId(sopResult.data.employee_id)

        if (sopResult.data.employee_id) {
          const emp = (empsResult.data || []).find(e => e.id === sopResult.data.employee_id)
          if (emp) setEmployee(emp)
        }
      }

      setAllTags(tagsResult.data || [])
      setSelectedTagIds(new Set((sopTagsResult.data || []).map(st => st.tag_id)))
    }
    load()
  }, [id, user.org_id])

  function toggleTag(tagId: string) {
    setSelectedTagIds(prev => {
      const next = new Set(prev)
      if (next.has(tagId)) next.delete(tagId)
      else next.add(tagId)
      return next
    })
  }

  async function handleCreateTag() {
    const name = newTagName.trim()
    if (!name) return

    const { data, error } = await supabase
      .from('tags')
      .insert({ org_id: user.org_id, name })
      .select()
      .single()

    if (error) { alert(error.message); return }
    if (data) {
      setAllTags(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
      setSelectedTagIds(prev => new Set([...prev, data.id]))
      setNewTagName('')
    }
  }

  async function handleTranslate(direction: 'en-to-id' | 'id-to-en') {
    if (!sop) return
    setTranslating(true)
    setTranslateDone(false)
    setError('')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setError(t.notAuthenticated); setTranslating(false); return }

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 55000)

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/translate-sop`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ sop_id: sop.id, direction }),
          signal: controller.signal,
        },
      )
      clearTimeout(timeout)

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || `${t.translationFailed} (${response.status})`)
      }

      // Reload the full SOP so the local baseline matches the DB.
      // This prevents Save from seeing the translated field as a "change"
      // and re-triggering translation.
      const { data } = await supabase.from('sops').select('*').eq('id', sop.id).single()
      if (data) {
        setSOP(data)
        if (direction === 'en-to-id') setContentId(data.content_markdown_id)
        else setContent(data.content_markdown)
      }

      setTranslateDone(true)
      setTimeout(() => setTranslateDone(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : t.translationFailed)
    }

    setTranslating(false)
  }

  async function handleGenerate() {
    if (!aiPrompt.trim() || generating) return
    setGenerating(true)
    setError('')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setError(t.notAuthenticated); setGenerating(false); return }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-sop`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            prompt: aiPrompt,
            employee_name: employee?.name,
            department: employee?.department,
            title,
            existing_content: content || undefined,
          }),
        },
      )

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || `${t.generationFailed} (${response.status})`)
      }

      // Parse SSE stream — collect all content, then set once at end
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
            if (delta) {
              generated += delta
            }
          } catch {
            // skip non-JSON lines
          }
        }
      }

      if (generated) {
        setContent(generated)
      }
      setAiPrompt('')
    } catch (err) {
      setError(err instanceof Error ? err.message : t.generationFailed)
    }

    setGenerating(false)
  }

  const enChanged = sop ? content !== sop.content_markdown : false
  const idChanged = sop ? contentId !== sop.content_markdown_id : false
  const employeeChanged = sop ? employeeId !== sop.employee_id : false
  const hasChanges = sop ? (
    enChanged || idChanged || employeeChanged ||
    title !== sop.title ||
    status !== sop.status ||
    changeSummary !== ''
  ) : false

  async function handleSave() {
    if (!sop) return
    setError('')
    setSaving(true)

    const newVersion = sop.current_version + 1
    const contentChanged = enChanged || idChanged

    const { error: updateError } = await supabase
      .from('sops')
      .update({
        title,
        employee_id: employeeId,
        content_markdown: content,
        content_markdown_id: contentId,
        status,
        current_version: contentChanged ? newVersion : sop.current_version,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sop.id)

    if (updateError) { setError(updateError.message); setSaving(false); return }

    if (contentChanged) {
      await supabase.from('sop_versions').insert({
        sop_id: sop.id,
        version_number: newVersion,
        content_markdown: content,
        change_summary: changeSummary || null,
        changed_by: user.id,
      })

      // Create feed event if SOP is linked to an employee
      if (sop.employee_id) {
        await supabase.from('feed_events').insert({
          org_id: user.org_id,
          employee_id: sop.employee_id,
          event_type: 'sop_updated',
          title: title,
          description: `Version ${newVersion}${changeSummary ? ' — ' + changeSummary : ''}`,
          metadata: { sop_id: sop.id, version: newVersion },
        })
      }
    }

    // Sync tags
    await supabase.from('sop_tags').delete().eq('sop_id', sop.id)
    if (selectedTagIds.size > 0) {
      await supabase.from('sop_tags').insert(
        [...selectedTagIds].map(tag_id => ({ sop_id: sop.id, tag_id }))
      )
    }

    // Fire-and-forget translation if content changed
    if (enChanged) {
      fireTranslation(sop.id, 'en-to-id')
    } else if (idChanged) {
      fireTranslation(sop.id, 'id-to-en')
    }

    setSaving(false)
    navigate('/dashboard/sops')
  }

  if (!sop) return <div style={{ color: 'var(--color-text-secondary)' }}>{t.loading}</div>

  const inputStyle = {
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-bg)',
    color: 'var(--color-text)',
  } as React.CSSProperties

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
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>{t.editSopTitle}</h1>
        <div className="flex items-center gap-3">
          <div className="relative">
            <span
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: statusColors[status] }}
            />
            <select
              value={status}
              onChange={e => setStatus(e.target.value as typeof status)}
              className="appearance-none rounded-lg border py-2 pl-7 pr-8 text-sm font-medium"
              style={{ ...inputStyle, color: statusColors[status] }}
            >
              <option value="draft">{t.statusDraft}</option>
              <option value="active">{t.statusActive}</option>
              <option value="archived">{t.statusArchived}</option>
            </select>
            <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-tertiary)' }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {saving ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
                {t.saving}
              </>
            ) : t.save}
          </button>
          <button
            onClick={() => navigate('/dashboard/sops')}
            className="rounded-lg border px-4 py-2 text-sm"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
          >
            {t.cancel}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md px-3 py-2 text-sm" style={{ backgroundColor: 'var(--color-diff-remove)', color: 'var(--color-danger)' }}>
          {error}
        </div>
      )}

      <div className="space-y-4">
        {/* Title + Employee + Tags row */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.titleLabel}</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={inputStyle}
            />
          </div>

          {/* Employee */}
          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.employeeLabel}</label>
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
                <option value="">{t.noEmployeeLinked}</option>
                {allEmployees.map(emp => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name}{emp.department ? ` (${emp.department})` : ''}
                  </option>
                ))}
              </select>
              <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-tertiary)' }}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.tagsLabel}</label>
            <div className="flex flex-wrap gap-2">
              {allTags.map(tag => {
                const isSelected = selectedTagIds.has(tag.id)
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTag(tag.id)}
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
                <input
                  type="text"
                  value={newTagName}
                  onChange={e => setNewTagName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreateTag() } }}
                  placeholder={t.newTagPlaceholder}
                  className="w-24 rounded-full border px-3 py-1 text-xs outline-none"
                  style={inputStyle}
                />
                {newTagName.trim() && (
                  <button
                    type="button"
                    onClick={handleCreateTag}
                    className="rounded-full px-2 py-1 text-xs font-medium"
                    style={{ color: 'var(--color-primary)' }}
                  >
                    {t.addShort}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t.contentLabel}</label>
            <div className="flex items-center gap-2">
              <div
                className="flex rounded-lg border p-0.5"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}
              >
                <button
                  type="button"
                  onClick={() => setActiveTab('en')}
                  className="rounded-md px-3 py-1 text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: activeTab === 'en' ? 'var(--color-bg)' : 'transparent',
                    color: activeTab === 'en' ? 'var(--color-text)' : 'var(--color-text-tertiary)',
                    boxShadow: activeTab === 'en' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                  }}
                >
                  {t.english}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('id')}
                  className="rounded-md px-3 py-1 text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: activeTab === 'id' ? 'var(--color-bg)' : 'transparent',
                    color: activeTab === 'id' ? 'var(--color-text)' : 'var(--color-text-tertiary)',
                    boxShadow: activeTab === 'id' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                  }}
                >
                  {t.bahasaIndonesiaLabel}
                </button>
              </div>
              <button
                type="button"
                onClick={() => handleTranslate(translateDirection)}
                disabled={translating || !hasSourceContent || needsSaveBeforeTranslate}
                title={needsSaveBeforeTranslate ? t.saveChangesBeforeTranslatingHint : undefined}
                className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all disabled:opacity-50"
                style={{
                  borderColor: translateDone ? 'var(--color-success, #22c55e)' : 'var(--color-border)',
                  color: translateDone ? 'var(--color-success, #22c55e)' : 'var(--color-text-secondary)',
                }}
                onMouseOver={e => { if (!translateDone) e.currentTarget.style.borderColor = 'var(--color-primary)' }}
                onMouseOut={e => { if (!translateDone) e.currentTarget.style.borderColor = 'var(--color-border)' }}
              >
                {translating ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                  </svg>
                ) : translateDone ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m5 8 6 6"/>
                    <path d="m4 14 6-6 2-3"/>
                    <path d="M2 5h12"/>
                    <path d="M7 2h1"/>
                    <path d="m22 22-5-10-5 10"/>
                    <path d="M14 18h6"/>
                  </svg>
                )}
                {needsSaveBeforeTranslate ? t.saveBeforeTranslating : translating ? t.translating : translateDone ? t.translateComplete : (
                  activeTab === 'en'
                    ? (contentId ? t.retranslateToId : t.translateToId)
                    : (content ? t.retranslateToEn : t.translateToEn)
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

        {/* AI Generate */}
        <div
          className="rounded-xl border p-4"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary, var(--color-bg))' }}
        >
          <label className="mb-2 flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-primary)' }}>
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
            {t.aiGenerate}
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={aiPrompt}
              onChange={e => setAiPrompt(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleGenerate() } }}
              placeholder={content
                ? t.aiPromptWithContent
                : t.aiPromptEmpty(employee?.department || 'marketing')}
              disabled={generating}
              className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none disabled:opacity-50"
              style={inputStyle}
            />
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating || !aiPrompt.trim()}
              className="flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              {generating && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
              )}
              {generating ? t.generating : t.generate}
            </button>
          </div>
        </div>


      </div>
    </div>
  )
}
