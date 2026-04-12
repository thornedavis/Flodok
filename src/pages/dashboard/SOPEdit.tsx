import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import MDEditor from '@uiw/react-md-editor'
import { supabase } from '../../lib/supabase'
import type { User, Sop } from '../../types/database'

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

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('sops').select('*').eq('id', id!).single()
      if (data) {
        setSOP(data)
        setTitle(data.title)
        setContent(data.content_markdown)
        setStatus(data.status)
      }
    }
    load()
  }, [id])

  async function handleSave() {
    if (!sop) return
    setError('')
    setSaving(true)

    const newVersion = sop.current_version + 1
    const contentChanged = content !== sop.content_markdown

    // Update SOP
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

    // Create version snapshot if content changed
    if (contentChanged) {
      await supabase.from('sop_versions').insert({
        sop_id: sop.id,
        version_number: newVersion,
        content_markdown: content,
        change_summary: changeSummary || null,
        changed_by: user.id,
      })
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

        <div data-color-mode={document.documentElement.classList.contains('dark') ? 'dark' : 'light'}>
          <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>Content</label>
          <MDEditor
            value={content}
            onChange={val => setContent(val || '')}
            height={500}
            preview="live"
          />
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
