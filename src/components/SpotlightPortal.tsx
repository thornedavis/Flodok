// Spotlight surface for the employee portal.
//
// Exposes:
//   useSpotlight(slug, token) — hook that fetches posts visible to the
//     employee, with their per-post view state, plus mutators for seen /
//     acknowledge / dismiss.
//   <SpotlightTab />     — feed view rendered when the Spotlight tab is active
//   <SpotlightBanner />  — top-of-home strip for active banner-mode posts
//   <SpotlightModal />   — full-screen interceptor for modal-mode posts
//
// All RPCs are token-authed (emp_slug, emp_token) and validate internally.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Translations } from '../lib/translations'
import type { SpotlightPriority, SpotlightDisplayMode } from '../types/aliases'

export type SpotlightFeedPost = {
  id: string
  title: string
  author_name: string
  what_happened: string
  what_to_do_instead: string
  who_applies_note: string | null
  image_url: string | null
  priority: SpotlightPriority
  display_mode: SpotlightDisplayMode
  requires_acknowledgement: boolean
  effective_from: string | null
  effective_until: string | null
  published_at: string | null
  republish_count: number
  first_seen_at: string | null
  acknowledged_at: string | null
  dismissed_at: string | null
}

export function useSpotlight(slug: string | null, token: string | null) {
  const [posts, setPosts] = useState<SpotlightFeedPost[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    if (!slug || !token) return
    const { data } = await supabase.rpc('portal_spotlight_posts', {
      emp_slug: slug,
      emp_token: token,
    })
    setPosts((data as SpotlightFeedPost[] | null) ?? [])
    setLoading(false)
  }, [slug, token])

  useEffect(() => { reload() }, [reload])

  const markSeen = useCallback(async (postId: string) => {
    if (!slug || !token) return
    await supabase.rpc('portal_spotlight_seen', { emp_slug: slug, emp_token: token, p_post_id: postId })
    setPosts(prev => prev.map(p => p.id === postId
      ? { ...p, first_seen_at: p.first_seen_at ?? new Date().toISOString() }
      : p))
  }, [slug, token])

  const acknowledge = useCallback(async (postId: string) => {
    if (!slug || !token) return
    await supabase.rpc('portal_spotlight_acknowledge', { emp_slug: slug, emp_token: token, p_post_id: postId })
    const now = new Date().toISOString()
    setPosts(prev => prev.map(p => p.id === postId
      ? { ...p, first_seen_at: p.first_seen_at ?? now, acknowledged_at: now }
      : p))
  }, [slug, token])

  const dismiss = useCallback(async (postId: string) => {
    if (!slug || !token) return
    await supabase.rpc('portal_spotlight_dismiss', { emp_slug: slug, emp_token: token, p_post_id: postId })
    const now = new Date().toISOString()
    setPosts(prev => prev.map(p => p.id === postId
      ? { ...p, first_seen_at: p.first_seen_at ?? now, dismissed_at: now }
      : p))
  }, [slug, token])

  return { posts, loading, reload, markSeen, acknowledge, dismiss }
}

// ─── Tab content ────────────────────────────────────────

export function SpotlightTab({
  posts, t, onAcknowledge,
}: {
  posts: SpotlightFeedPost[]
  t: Translations
  onAcknowledge: (postId: string) => void
}) {
  if (posts.length === 0) {
    return (
      <div className="rounded-xl border p-6 text-center" style={{ borderColor: 'var(--color-border)' }}>
        <p className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{t.spotlightPortalEmpty}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {posts.map(p => (
        <PostCard key={p.id} post={p} t={t} onAcknowledge={onAcknowledge} />
      ))}
    </div>
  )
}

function PostCard({ post, t, onAcknowledge }: {
  post: SpotlightFeedPost
  t: Translations
  onAcknowledge: (postId: string) => void
}) {
  const author = post.author_name || ''
  const acknowledged = !!post.acknowledged_at
  return (
    <div
      className="rounded-xl border p-4"
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}
    >
      {post.image_url && (
        <Thumbnail src={post.image_url} ariaExpand={t.spotlightImageExpand} className="mb-3" />
      )}

      <div className="mb-3 flex items-start gap-2">
        <PriorityPill priority={post.priority} t={t} />
        {post.republish_count > 0 && <ReminderPill count={post.republish_count} t={t} />}
        <div className="ml-auto text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
          {author && `${t.spotlightPostedBy} ${author}`}
        </div>
      </div>

      <h3 className="mb-2 text-base font-semibold" style={{ color: 'var(--color-text)' }}>{post.title}</h3>

      <Section label={t.spotlightWhatHappenedLabel} body={post.what_happened} />
      <Section label={t.spotlightWhatToDoLabel} body={post.what_to_do_instead} />
      {post.who_applies_note && <Section label={t.spotlightWhoAppliesLabel} body={post.who_applies_note} />}

      {post.requires_acknowledgement && !acknowledged && (
        <button
          onClick={() => onAcknowledge(post.id)}
          className="mt-3 rounded-lg px-4 py-2 text-sm font-medium text-white"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          {t.spotlightAcknowledge}
        </button>
      )}
      {acknowledged && (
        <p className="mt-2 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
          ✓ {t.spotlightAcknowledge}
        </p>
      )}
    </div>
  )
}

function Section({ label, body }: { label: string; body: string }) {
  return (
    <div className="mt-2">
      <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>
        {label}
      </div>
      <p className="mt-0.5 whitespace-pre-wrap text-sm" style={{ color: 'var(--color-text)' }}>
        {renderWithLinks(body)}
      </p>
    </div>
  )
}

// Splits text into runs and turns http(s) URLs into anchor tags. Trailing
// sentence punctuation (. , ; : ! ? ) ]) is excluded from the linked URL so
// "see https://example.com." doesn't break the link with a trailing period.
const URL_RE = /https?:\/\/[^\s]+/g
function renderWithLinks(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  URL_RE.lastIndex = 0
  while ((match = URL_RE.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index))
    const raw = match[0]
    const trailing = raw.match(/[.,;:!?)\]]+$/)?.[0] ?? ''
    const url = trailing ? raw.slice(0, -trailing.length) : raw
    parts.push(
      <a
        key={`${match.index}-${url}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="underline"
        style={{ color: 'var(--color-primary)' }}
      >
        {url}
      </a>
    )
    if (trailing) parts.push(trailing)
    lastIndex = match.index + raw.length
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return parts
}

// ─── Banner ─────────────────────────────────────────────

export function SpotlightBanner({
  posts, t, onDismiss, onOpen,
}: {
  posts: SpotlightFeedPost[]
  t: Translations
  onDismiss: (postId: string) => void
  onOpen: (postId: string) => void
}) {
  // Only show banner-mode posts that aren't dismissed and aren't already
  // acknowledged. If an ack is required, the modal interceptor handles them.
  const eligible = useMemo(() => posts.filter(p =>
    p.display_mode === 'banner'
    && !p.dismissed_at
    && !p.acknowledged_at
  ), [posts])

  if (eligible.length === 0) return null

  return (
    <div className="mb-4 space-y-2">
      {eligible.map(p => (
        <div
          key={p.id}
          className="flex items-start gap-3 rounded-xl border p-3"
          style={{
            borderColor: priorityBorder(p.priority),
            backgroundColor: priorityBg(p.priority),
          }}
        >
          <div className="flex-1 min-w-0">
            <div className="mb-0.5 flex items-center gap-2">
              <PriorityPill priority={p.priority} t={t} />
              <span className="truncate text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{p.title}</span>
            </div>
            <p className="line-clamp-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>{p.what_happened}</p>
          </div>
          <div className="flex shrink-0 flex-col gap-1">
            <button
              onClick={() => onOpen(p.id)}
              className="rounded-md px-2 py-1 text-xs font-semibold"
              style={{ backgroundColor: 'var(--color-primary)', color: 'white' }}
            >
              {t.spotlightOpen}
            </button>
            <button
              onClick={() => onDismiss(p.id)}
              className="rounded-md px-2 py-1 text-xs"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              {t.spotlightDismiss}
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Modal interceptor ──────────────────────────────────

export function SpotlightModal({
  posts, t, onSeen, onAcknowledge, onDismiss,
}: {
  posts: SpotlightFeedPost[]
  t: Translations
  onSeen: (postId: string) => void
  onAcknowledge: (postId: string) => void
  onDismiss: (postId: string) => void
}) {
  // Show modal-mode posts the employee hasn't dealt with yet:
  //   • requires_acknowledgement → must ack
  //   • otherwise → must dismiss
  const queue = useMemo(() => posts.filter(p => {
    if (p.display_mode !== 'modal') return false
    if (p.acknowledged_at) return false
    if (!p.requires_acknowledgement && p.dismissed_at) return false
    return true
  }), [posts])

  const current = queue[0] ?? null

  // Record first_seen the moment the modal opens so managers' read-receipts
  // capture "they saw it" even if they don't acknowledge yet.
  useEffect(() => {
    if (current && !current.first_seen_at) onSeen(current.id)
  }, [current, onSeen])

  if (!current) return null

  const author = current.author_name || ''
  const close = () => {
    if (current.requires_acknowledgement) onAcknowledge(current.id)
    else onDismiss(current.id)
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center px-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
    >
      <div
        className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl border p-5 shadow-xl"
        style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
      >
        {current.image_url && (
          <Thumbnail src={current.image_url} ariaExpand={t.spotlightImageExpand} className="mb-3" />
        )}

        <div className="mb-3 flex items-center gap-2">
          <PriorityPill priority={current.priority} t={t} />
          {current.republish_count > 0 && <ReminderPill count={current.republish_count} t={t} />}
          {author && (
            <span className="ml-auto text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              {t.spotlightPostedBy} {author}
            </span>
          )}
        </div>

        <h3 className="mb-3 text-lg font-semibold" style={{ color: 'var(--color-text)' }}>{current.title}</h3>

        <Section label={t.spotlightWhatHappenedLabel} body={current.what_happened} />
        <Section label={t.spotlightWhatToDoLabel} body={current.what_to_do_instead} />
        {current.who_applies_note && <Section label={t.spotlightWhoAppliesLabel} body={current.who_applies_note} />}

        <div className="mt-5 flex justify-end">
          <button
            onClick={close}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {current.requires_acknowledgement ? t.spotlightAcknowledge : t.spotlightDismiss}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Shared bits ────────────────────────────────────────

function PriorityPill({ priority, t }: { priority: SpotlightPriority; t: Translations }) {
  const labels: Record<SpotlightPriority, string> = {
    critical: t.spotlightPriorityCritical,
    important: t.spotlightPriorityImportant,
    fyi: t.spotlightPriorityFyi,
  }
  const colors: Record<SpotlightPriority, { bg: string; fg: string }> = {
    critical: { bg: 'color-mix(in srgb, var(--color-danger) 14%, transparent)', fg: 'var(--color-danger)' },
    important: { bg: 'color-mix(in srgb, var(--color-primary) 14%, transparent)', fg: 'var(--color-primary)' },
    fyi: { bg: 'var(--color-bg-tertiary)', fg: 'var(--color-text-secondary)' },
  }
  const c = colors[priority]
  return (
    <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: c.bg, color: c.fg }}>
      {labels[priority]}
    </span>
  )
}

// Square thumbnail with click-to-expand lightbox. The square crop keeps
// the feed's visual rhythm steady regardless of the source aspect ratio;
// the lightbox preserves the full original photo for when detail matters
// (which is most of the time for "look at this" workplace shots).
function Thumbnail({ src, ariaExpand, className = '' }: {
  src: string
  ariaExpand: string
  className?: string
}) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    // Lock body scroll while the lightbox is open.
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open])

  return (
    <>
      <div className={`relative ${className}`}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={ariaExpand}
          className="block w-full overflow-hidden rounded-lg"
        >
          <img
            src={src}
            alt=""
            className="aspect-square w-full object-cover"
          />
        </button>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={ariaExpand}
          title={ariaExpand}
          className="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-md text-white"
          style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 3 21 3 21 9" />
            <polyline points="9 21 3 21 3 15" />
            <line x1="21" y1="3" x2="14" y2="10" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </svg>
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}
          onClick={() => setOpen(false)}
        >
          <img
            src={src}
            alt=""
            className="max-h-full max-w-full rounded-lg object-contain"
            onClick={e => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-white"
            style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}
    </>
  )
}

function ReminderPill({ count, t }: { count: number; t: Translations }) {
  // Visual escalation mirrors the dashboard pill: amber at 2+, danger at 4+.
  let bg = 'color-mix(in srgb, var(--color-primary) 14%, transparent)'
  let fg = 'var(--color-primary)'
  if (count >= 4) {
    bg = 'color-mix(in srgb, var(--color-danger) 16%, transparent)'
    fg = 'var(--color-danger)'
  } else if (count >= 2) {
    bg = 'color-mix(in srgb, #d97706 18%, transparent)'
    fg = '#d97706'
  }
  return (
    <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: bg, color: fg }}>
      {t.spotlightReminderBadge(count + 1)}
    </span>
  )
}

function priorityBorder(p: SpotlightPriority): string {
  if (p === 'critical') return 'var(--color-danger)'
  if (p === 'important') return 'var(--color-primary)'
  return 'var(--color-border)'
}

function priorityBg(p: SpotlightPriority): string {
  if (p === 'critical') return 'color-mix(in srgb, var(--color-danger) 8%, transparent)'
  if (p === 'important') return 'color-mix(in srgb, var(--color-primary) 8%, transparent)'
  return 'var(--color-bg-secondary)'
}
