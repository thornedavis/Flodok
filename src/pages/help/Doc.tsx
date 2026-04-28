import { Link, useParams } from 'react-router-dom'
import { allTopics, sectionBySlug } from './data'

export function Doc() {
  const { slug } = useParams<{ slug: string }>()
  const topic = allTopics.find((t) => t.slug === slug)

  if (!topic) {
    return (
      <div className="py-20 text-center">
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>
          Page not found
        </h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          That doc doesn't exist (yet).
        </p>
        <Link
          to="/help/docs"
          className="mt-6 inline-block text-sm font-semibold"
          style={{ color: 'var(--color-primary)' }}
        >
          Back to documentation
        </Link>
      </div>
    )
  }

  const section = sectionBySlug[topic.slug]
  const sectionTopics = section.topics
  const idx = sectionTopics.findIndex((t) => t.slug === topic.slug)
  const prev = idx > 0 ? sectionTopics[idx - 1] : null
  const next = idx < sectionTopics.length - 1 ? sectionTopics[idx + 1] : null

  return (
    <article className="max-w-3xl">
      {/* Heading box */}
      <header
        className="mb-10 rounded-2xl border px-7 py-7"
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: 'var(--color-bg-secondary)',
        }}
      >
        <p
          className="mb-2 text-xs font-semibold uppercase tracking-widest"
          style={{ color: 'var(--color-primary)' }}
        >
          {section.title}
        </p>
        <h1
          className="text-4xl font-semibold tracking-tight"
          style={{ color: 'var(--color-text)' }}
        >
          {topic.title}
        </h1>
        <p
          className="mt-3 text-base leading-relaxed"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          {topic.description}
        </p>
      </header>

      {/* Body */}
      <div className="legal-prose">{topic.body}</div>

      {/* Prev/next nav */}
      <nav
        className="mt-14 grid grid-cols-1 gap-3 border-t pt-8 md:grid-cols-2"
        style={{ borderColor: 'var(--color-border)' }}
      >
        {prev ? (
          <Link
            to={`/help/docs/${prev.slug}`}
            className="rounded-xl border px-5 py-4 transition-colors"
            style={{
              borderColor: 'var(--color-border)',
              backgroundColor: 'var(--color-bg-secondary)',
            }}
          >
            <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              ← Previous
            </div>
            <div className="mt-1 text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
              {prev.title}
            </div>
          </Link>
        ) : (
          <div />
        )}
        {next ? (
          <Link
            to={`/help/docs/${next.slug}`}
            className="rounded-xl border px-5 py-4 text-right transition-colors"
            style={{
              borderColor: 'var(--color-border)',
              backgroundColor: 'var(--color-bg-secondary)',
            }}
          >
            <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              Next →
            </div>
            <div className="mt-1 text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
              {next.title}
            </div>
          </Link>
        ) : null}
      </nav>

      {/* Helpful? + contact */}
      <div
        className="mt-8 rounded-xl border px-5 py-4 text-sm"
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: 'var(--color-bg-secondary)',
          color: 'var(--color-text-secondary)',
        }}
      >
        Was this helpful? If something's missing, email{' '}
        <a href="mailto:hello@flodok.com" style={{ color: 'var(--color-primary)' }}>
          hello@flodok.com
        </a>{' '}
        or{' '}
        <Link to="/help/contact" style={{ color: 'var(--color-primary)' }}>
          contact support
        </Link>
        .
      </div>
    </article>
  )
}
