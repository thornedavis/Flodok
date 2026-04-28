import { Link } from 'react-router-dom'
import { sections } from './data'
import { HelpIcon } from '../../components/HelpCenterLayout'

export function DocsIndex() {
  return (
    <div>
      <header className="mb-10">
        <h1
          className="text-4xl font-semibold tracking-tight"
          style={{ color: 'var(--color-text)' }}
        >
          Documentation
        </h1>
        <p
          className="mt-2 text-base"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          In-depth reference docs for every feature in Flodok.
        </p>
      </header>

      <div className="space-y-12">
        {sections.map((section) => (
          <section key={section.id} id={section.id}>
            <div className="mb-5">
              <h2
                className="text-xl font-semibold tracking-tight"
                style={{ color: 'var(--color-text)' }}
              >
                {section.title}
              </h2>
              <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                {section.description}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {section.topics.map((topic) => (
                <Link
                  key={topic.slug}
                  to={`/help/docs/${topic.slug}`}
                  className="group block rounded-2xl border p-5 transition-colors"
                  style={{
                    borderColor: 'var(--color-border)',
                    backgroundColor: 'var(--color-bg-secondary)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--color-border-strong)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--color-border)'
                  }}
                >
                  <div className="mb-3 flex items-start justify-between">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-lg"
                      style={{
                        backgroundColor: 'color-mix(in srgb, var(--color-primary) 12%, transparent)',
                        color: 'var(--color-primary)',
                      }}
                    >
                      <HelpIcon name={topic.iconKey} />
                    </div>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="opacity-40 transition-opacity group-hover:opacity-80"
                      style={{ color: 'var(--color-text-tertiary)' }}
                    >
                      <line x1="7" y1="17" x2="17" y2="7" />
                      <polyline points="7 7 17 7 17 17" />
                    </svg>
                  </div>
                  <h3
                    className="text-base font-semibold"
                    style={{ color: 'var(--color-text)' }}
                  >
                    {topic.title}
                  </h3>
                  <p
                    className="mt-1.5 text-sm leading-relaxed"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    {topic.description}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Contact callout */}
      <div
        className="mt-16 rounded-2xl border px-8 py-10 text-center"
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: 'var(--color-bg-secondary)',
        }}
      >
        <h2 className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>
          Still have questions?
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          Check the FAQ first — most things are covered there. If you're stuck,
          we'll get back within one business day.
        </p>
        <div className="mt-5 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            to="/help/faq"
            className="inline-flex items-center justify-center rounded-lg border px-5 py-2 text-sm font-semibold transition-colors"
            style={{
              borderColor: 'var(--color-border)',
              color: 'var(--color-text)',
              backgroundColor: 'var(--color-bg)',
            }}
          >
            Browse the FAQ
          </Link>
          <Link
            to="/help/contact"
            className="inline-flex items-center justify-center rounded-lg px-5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            Contact support →
          </Link>
        </div>
      </div>
    </div>
  )
}
