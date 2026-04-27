import { Link } from 'react-router-dom'
import { getAvatarGradient, getInitials } from '../../lib/avatar'

export function About() {
  return (
    <main>
      <AboutHero />
      <Story />
      <Values />
      <Team />
      <AboutCTA />
    </main>
  )
}

function AboutHero() {
  return (
    <section className="px-6 pb-10 pt-16 md:pt-24">
      <div className="mx-auto max-w-3xl text-center">
        <p
          className="mb-3 text-xs font-semibold uppercase tracking-widest"
          style={{ color: 'var(--color-primary)' }}
        >
          About
        </p>
        <h1
          className="text-4xl font-semibold tracking-tight md:text-5xl"
          style={{ color: 'var(--color-text)' }}
        >
          Software for the way Indonesian teams actually work.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base md:text-lg" style={{ color: 'var(--color-text-secondary)' }}>
          We're building Flodok because the tools Indonesian operators reach for were
          designed somewhere else, for someone else, and it shows.
        </p>
      </div>
    </section>
  )
}

function Story() {
  return (
    <section className="px-6 py-20">
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-10 md:grid-cols-2 md:gap-16">
        <div>
          <p
            className="mb-3 text-xs font-semibold uppercase tracking-widest"
            style={{ color: 'var(--color-primary)' }}
          >
            Our story
          </p>
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl" style={{ color: 'var(--color-text)' }}>
            Born out of the Google Doc graveyard.
          </h2>
        </div>
        <div className="space-y-4 text-base leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
          <p>
            Flodok started where most operations companies start: a folder of Google Docs nobody
            could find, a WhatsApp group fielding the same five questions every week, and a
            spreadsheet that "we'll clean up later."
          </p>
          <p>
            We tried every tool on the market. They almost worked. They didn't speak Bahasa, didn't
            understand Rupiah, didn't know what BPJS was, didn't run on WITA. They expected us to
            fit our way of working to their assumptions about how software-using companies operate.
          </p>
          <p>
            So we built one for ourselves. And then for the friends running operations companies
            we'd started during pandemic. And now for hundreds of Indonesian teams from Jakarta to
            Makassar to Medan.
          </p>
          <p style={{ color: 'var(--color-text)' }}>
            <strong>Flodok is the operating system we wished existed when we were the ones
            running the operation.</strong>
          </p>
        </div>
      </div>
    </section>
  )
}

function Values() {
  const values = [
    {
      title: 'Built for here',
      body: "Bahasa-first, IDR-first, WIB/WITA/WIT-first. Indonesia isn't an i18n afterthought.",
    },
    {
      title: 'Boring on purpose',
      body: 'Operations software should fade into the background. We optimise for "didn\'t have to think about it."',
    },
    {
      title: 'Respect the operator',
      body: 'You know your business. We don\'t tell you how to run it — we give you tools that get out of your way.',
    },
    {
      title: 'Ship faster than feels comfortable',
      body: 'Every customer is one feedback loop away from a better product. We close that loop weekly.',
    },
  ]

  return (
    <section
      className="border-y px-6 py-20"
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}
    >
      <div className="mx-auto max-w-5xl">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <p
            className="mb-3 text-xs font-semibold uppercase tracking-widest"
            style={{ color: 'var(--color-primary)' }}
          >
            What we believe
          </p>
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl" style={{ color: 'var(--color-text)' }}>
            Four things, on the wall.
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {values.map((v, i) => (
            <div
              key={v.title}
              className="rounded-2xl border p-6"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
            >
              <div
                className="mb-3 inline-flex h-7 w-7 items-center justify-center rounded-md text-xs font-mono font-semibold"
                style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-primary)' }}
              >
                {String(i + 1).padStart(2, '0')}
              </div>
              <h3 className="mb-2 text-base font-semibold" style={{ color: 'var(--color-text)' }}>
                {v.title}
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                {v.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Team() {
  const team = [
    { name: 'Thorne Davis', role: 'Founder & CEO', id: 'thorne-davis' },
    { name: 'Putri Anggraini', role: 'Head of Product', id: 'putri-anggraini' },
    { name: 'Rizky Hidayat', role: 'Engineering Lead', id: 'rizky-hidayat' },
    { name: 'Maya Sutanto', role: 'Design', id: 'maya-sutanto' },
    { name: 'Bayu Setiawan', role: 'Customer Success', id: 'bayu-setiawan' },
    { name: 'Nadia Halim', role: 'Operations', id: 'nadia-halim' },
  ]

  return (
    <section className="px-6 py-20">
      <div className="mx-auto max-w-5xl">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <p
            className="mb-3 text-xs font-semibold uppercase tracking-widest"
            style={{ color: 'var(--color-primary)' }}
          >
            Team
          </p>
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl" style={{ color: 'var(--color-text)' }}>
            A small team. Long careers in operations.
          </h2>
        </div>

        <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-3">
          {team.map(member => (
            <div key={member.id} className="text-center">
              <div
                className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-full text-base font-semibold"
                style={{ background: getAvatarGradient(member.id), color: 'var(--color-text)' }}
              >
                {getInitials(member.name)}
              </div>
              <div className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                {member.name}
              </div>
              <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                {member.role}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-10 text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
          Want to join us? Email{' '}
          <a href="mailto:hiring@flodok.com" style={{ color: 'var(--color-primary)' }}>
            hiring@flodok.com
          </a>
          .
        </p>
      </div>
    </section>
  )
}

function AboutCTA() {
  return (
    <section className="px-6 pb-24">
      <div className="mx-auto max-w-4xl">
        <div
          className="rounded-3xl border px-8 py-14 text-center md:px-16"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}
        >
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl" style={{ color: 'var(--color-text)' }}>
            Run your operation with us.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-base" style={{ color: 'var(--color-text-secondary)' }}>
            Free for teams up to 10. Five minutes to set up.
          </p>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/signup"
              className="inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              Start free →
            </Link>
            <Link
              to="/contact"
              className="inline-flex items-center justify-center rounded-lg border px-5 py-2.5 text-sm font-semibold transition-colors"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)', backgroundColor: 'var(--color-bg)' }}
            >
              Get in touch
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
