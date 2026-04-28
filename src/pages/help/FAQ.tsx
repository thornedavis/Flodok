import { Link } from 'react-router-dom'
import { faqGroups } from './data'

export function HelpFAQ() {
  return (
    <div className="max-w-3xl">
      <header className="mb-10">
        <h1
          className="text-4xl font-semibold tracking-tight"
          style={{ color: 'var(--color-text)' }}
        >
          Frequently Asked Questions
        </h1>
        <p
          className="mt-3 text-base"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          The questions we hear most often. If yours isn't here, the{' '}
          <Link to="/help/docs" style={{ color: 'var(--color-primary)' }}>
            documentation
          </Link>{' '}
          covers most things in detail — or just{' '}
          <Link to="/help/contact" style={{ color: 'var(--color-primary)' }}>
            ask us
          </Link>
          .
        </p>
      </header>

      {/* Quick jump */}
      <nav
        className="mb-10 flex flex-wrap gap-2 rounded-2xl border px-4 py-3"
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: 'var(--color-bg-secondary)',
        }}
      >
        <span
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: 'var(--color-text-tertiary)', alignSelf: 'center' }}
        >
          Jump to:
        </span>
        {faqGroups.map((g) => (
          <a
            key={g.id}
            href={`#${g.id}`}
            className="rounded-md px-2.5 py-1 text-sm transition-colors"
            style={{ color: 'var(--color-text-secondary)' }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)')
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.backgroundColor = 'transparent')
            }
          >
            {g.title}
          </a>
        ))}
      </nav>

      <div className="space-y-12">
        {faqGroups.map((group) => (
          <section key={group.id} id={group.id} style={{ scrollMarginTop: '6rem' }}>
            <h2
              className="mb-4 text-xl font-semibold tracking-tight"
              style={{ color: 'var(--color-text)' }}
            >
              {group.title}
            </h2>
            <div className="space-y-2">
              {group.items.map((item, i) => (
                <details
                  key={i}
                  className="group rounded-xl border px-5 py-4"
                  style={{
                    borderColor: 'var(--color-border)',
                    backgroundColor: 'var(--color-bg-secondary)',
                  }}
                >
                  <summary
                    className="flex cursor-pointer list-none items-center justify-between text-base font-medium"
                    style={{ color: 'var(--color-text)' }}
                  >
                    <span>{item.q}</span>
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="shrink-0 transition-transform group-open:rotate-45"
                      style={{ color: 'var(--color-text-tertiary)' }}
                    >
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </summary>
                  <div
                    className="mt-3 text-sm leading-relaxed"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    {item.a}
                  </div>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div
        className="mt-14 rounded-2xl border px-7 py-7 text-center"
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: 'var(--color-bg-secondary)',
        }}
      >
        <h2 className="text-xl font-semibold" style={{ color: 'var(--color-text)' }}>
          Didn't find your answer?
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          We respond within one business day, often faster.
        </p>
        <Link
          to="/help/contact"
          className="mt-5 inline-flex items-center justify-center rounded-lg px-5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          Contact support →
        </Link>
      </div>
    </div>
  )
}
