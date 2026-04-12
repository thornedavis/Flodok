import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { SOPEditor } from '../../components/Editor'
import type { User, Sop, Tag } from '../../types/database'

export function SOPEdit({ user }: { user: User }) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [sop, setSOP] = useState<Sop | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [status, setStatus] = useState<'active' | 'draft' | 'archived'>('draft')
  const [changeSummary, setChangeSummary] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Tags
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set())
  const [newTagName, setNewTagName] = useState('')

  useEffect(() => {
    async function load() {
      const [sopResult, tagsResult, sopTagsResult] = await Promise.all([
        supabase.from('sops').select('*').eq('id', id!).single(),
        supabase.from('tags').select('*').eq('org_id', user.org_id).order('name'),
        supabase.from('sop_tags').select('tag_id').eq('sop_id', id!),
      ])

      if (sopResult.data) {
        setSOP(sopResult.data)
        setTitle(sopResult.data.title)
        setContent(sopResult.data.content_markdown)
        setStatus(sopResult.data.status)
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

  async function handleSave() {
    if (!sop) return
    setError('')
    setSaving(true)

    const newVersion = sop.current_version + 1
    const contentChanged = content !== sop.content_markdown

    const { error: updateError } = await supabase
      .from('sops')
      .update({
        title,
        content_markdown: content,
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
    }

    // Sync tags: delete all existing, insert selected
    await supabase.from('sop_tags').delete().eq('sop_id', sop.id)
    if (selectedTagIds.size > 0) {
      await supabase.from('sop_tags').insert(
        [...selectedTagIds].map(tag_id => ({ sop_id: sop.id, tag_id }))
      )
    }

    setSaving(false)
    navigate('/dashboard/sops')
  }

  if (!sop) return <div style={{ color: 'var(--color-text-secondary)' }}>Loading...</div>

  const inputStyle = {
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-bg)',
    color: 'var(--color-text)',
  } as React.CSSProperties

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>Edit SOP</h1>
        <div className="flex items-center gap-2">
          <select
            value={status}
            onChange={e => setStatus(e.target.value as typeof status)}
            className="rounded-lg border px-3 py-2 text-sm"
            style={inputStyle}
          >
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md px-3 py-2 text-sm" style={{ backgroundColor: 'var(--color-diff-remove)', color: 'var(--color-danger)' }}>
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>Title</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={inputStyle}
          />
        </div>

        {/* Tags */}
        <div>
          <label className="mb-2 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>Tags</label>
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
            {/* Inline create tag */}
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={newTagName}
                onChange={e => setNewTagName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreateTag() } }}
                placeholder="New tag..."
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
                  + Add
                </button>
              )}
            </div>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>Content</label>
          <SOPEditor content={content} onChange={setContent} />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            Change summary (optional)
          </label>
          <input
            type="text"
            value={changeSummary}
            onChange={e => setChangeSummary(e.target.value)}
            placeholder="What changed in this version?"
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={inputStyle}
          />
        </div>

        <div className="flex gap-2 pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={() => navigate('/dashboard/sops')}
            className="rounded-lg border px-4 py-2 text-sm"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
