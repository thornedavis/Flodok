import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

export interface DocTopic {
  slug: string
  title: string
  description: string
  iconKey: IconKey
  body: ReactNode
}

export interface DocSection {
  id: string
  title: string
  description: string
  topics: DocTopic[]
}

export type IconKey =
  | 'book'
  | 'card'
  | 'users'
  | 'mail'
  | 'file'
  | 'history'
  | 'upload'
  | 'pen'
  | 'shield'
  | 'star'
  | 'globe'
  | 'plug'
  | 'settings'
  | 'clock'
  | 'language'
  | 'lock'
  | 'receipt'
  | 'wallet'
  | 'eye'
  | 'sparkles'
  | 'workflow'

// ─── Reusable doc-body building blocks ──────────────────

function P({ children }: { children: ReactNode }) {
  return <p>{children}</p>
}

function H3({ id, children }: { id?: string; children: ReactNode }) {
  return <h3 id={id}>{children}</h3>
}

function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol>
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ol>
  )
}

function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul>
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  )
}

function Callout({ type, children }: { type: 'tip' | 'note' | 'warn'; children: ReactNode }) {
  const styles: Record<typeof type, { bg: string; fg: string; label: string }> = {
    tip: { bg: 'var(--color-diff-add)', fg: 'var(--color-success)', label: 'Tip' },
    note: { bg: 'var(--color-bg-tertiary)', fg: 'var(--color-text-secondary)', label: 'Note' },
    warn: { bg: 'var(--color-diff-remove)', fg: 'var(--color-danger)', label: 'Heads up' },
  }
  const s = styles[type]
  return (
    <div
      className="my-5 rounded-xl border-l-4 px-5 py-4 text-sm"
      style={{
        borderLeftColor: s.fg,
        backgroundColor: s.bg,
      }}
    >
      <div className="mb-1 text-xs font-semibold uppercase tracking-wider" style={{ color: s.fg }}>
        {s.label}
      </div>
      <div style={{ color: 'var(--color-text)' }}>{children}</div>
    </div>
  )
}

// ─── Doc bodies (kept inline for SEO + simplicity) ──────

const QUICKSTART: ReactNode = (
  <>
    <P>
      Flodok is the operations OS for Indonesian teams — a single home for SOPs,
      contracts, employee data, and your team's public portal. This guide walks
      you through your first ten minutes on the platform.
    </P>

    <H3 id="create-account">1. Create your account</H3>
    <P>
      Head to <Link to="/signup">flodok.com/signup</Link> and create a free
      account. You'll need a name, the legal name of your organization, an email,
      and a password. The Free plan is free forever for teams up to 2
      employees — no card required.
    </P>

    <H3 id="set-up-workspace">2. Set up your workspace</H3>
    <P>
      Once you're in, head to <strong>Settings → Organization</strong>:
    </P>
    <Bullets
      items={[
        <>Add a <strong>display name</strong> if your trading name differs from your legal name.</>,
        <>Set your <strong>time zone</strong> — WIB, WITA, or WIT.</>,
        <>Upload a logo. It'll appear in your employee portal and exported PDFs.</>,
      ]}
    />

    <H3 id="invite-team">3. Invite your team</H3>
    <P>
      Open the invite drawer from the sidebar or visit{' '}
      <strong>Settings → Team Members</strong>. You can invite admins (full
      access), managers (their team's data only), or employees (read-only access
      to assigned SOPs and contracts).
    </P>
    <Callout type="tip">
      Most teams invite admins through Flodok directly, but distribute the
      <em> employee portal link</em> over WhatsApp — your team gets read access
      to SOPs without needing to log in.
    </Callout>

    <H3 id="first-sop">4. Publish your first SOP</H3>
    <P>
      Go to <strong>SOPs → New SOP</strong>. Write or paste your content using the
      rich-text editor — headings, lists, tables, images, embeds all work. Save
      as draft, then click <strong>Publish</strong> when ready. Your team sees it
      immediately on their portal.
    </P>

    <H3 id="next">What to do next</H3>
    <Bullets
      items={[
        <Link to="/help/docs/sop-versioning">Understand how SOP versioning works</Link>,
        <Link to="/help/docs/employee-portal">Set up your employee portal</Link>,
        <Link to="/help/docs/contracts">Send your first contract</Link>,
        <Link to="/help/docs/plans">Compare plans when you're ready to upgrade</Link>,
      ]}
    />
  </>
)

const PLANS: ReactNode = (
  <>
    <P>
      Flodok has two plans: <strong>Free</strong> and <strong>Pro</strong>. Both
      include the public employee portal, Bahasa & English UI, in-app
      translation, and WIB/WITA/WIT time zones. Pro adds AI features,
      contracts, e-signatures, performance reviews, and integrations.
    </P>

    <H3 id="comparison">What's different per plan</H3>
    <Bullets
      items={[
        <><strong>Free</strong> — Up to 2 employees, with 1 SOP and 1 contract per employee. No AI features or integrations. Forever free, no card required.</>,
        <><strong>Pro</strong> — Per-seat pricing, 3-employee minimum. Unlimited SOPs and contracts, AI drafting and translation included, e-signatures, performance reviews, and all integrations (Fireflies, Slack, Google Workspace).</>,
      ]}
    />

    <H3 id="how-pro-pricing-works">How Pro pricing works</H3>
    <P>
      Pro uses graduated per-seat pricing — like income-tax brackets. Each seat
      is priced based on which bracket it falls into, so the total cost only
      ever goes up as you add seats:
    </P>
    <Bullets
      items={[
        <><strong>Seats 1–15</strong> — Rp 80.000 per seat / month</>,
        <><strong>Seats 16–40</strong> — Rp 50.000 per seat / month</>,
        <><strong>Seats 41+</strong> — Rp 30.000 per seat / month</>,
      ]}
    />
    <P>
      A 10-employee team pays Rp 800.000/month. A 30-employee team pays
      Rp 1.950.000/month (15 × 80k + 15 × 50k). A 100-employee team pays
      Rp 4.250.000/month (15 × 80k + 25 × 50k + 60 × 30k). Drag the slider on
      our <Link to="/pricing">pricing page</Link> to see your exact bill.
    </P>

    <H3 id="billing">How billing works</H3>
    <P>
      Pro is month-to-month, billed in Indonesian Rupiah. Annual plans save 20%
      and can be paid by bank transfer with a tax invoice. When you add or
      remove employees mid-cycle, we update your seat count and the difference
      is <strong>prorated and applied to your next monthly invoice</strong> —
      no surprise mid-month charges, no need to re-enter your card.
    </P>

    <H3 id="ai-fair-use">AI fair-use policy</H3>
    <P>
      AI features (SOP drafting, contract drafting, document translation,
      meeting-transcript processing) are bundled into Pro at no extra cost
      under a fair-use policy. We don't meter usage. We'll only reach out if
      your usage is materially above what a normal team of your size would
      generate — and even then we'd rather move you to a custom plan than slap
      on usage fees.
    </P>

    <H3 id="payment">Payment methods</H3>
    <P>We accept:</P>
    <Bullets
      items={[
        'Bank transfer (BCA, Mandiri, BNI, BRI)',
        'Credit card (Visa, Mastercard, JCB)',
        'Indonesian e-wallets (OVO, GoPay, DANA)',
      ]}
    />

    <Callout type="note">
      Registered yayasan and accredited Indonesian schools get 50% off Pro.
      Email <a href="mailto:sales@flodok.com">sales@flodok.com</a> with your
      registration to claim.
    </Callout>

    <P>
      Full breakdown on the <Link to="/pricing">pricing page</Link>.
    </P>
  </>
)

const ROLES: ReactNode = (
  <>
    <P>
      Flodok has four built-in roles. Custom roles with granular permissions
      are available on custom plans for organizations with compliance needs —
      <Link to="/contact"> get in touch</Link> if you need this.
    </P>

    <H3 id="admin">Admin</H3>
    <P>
      Full access to everything: settings, billing, employees, SOPs, contracts,
      performance, integrations. Can invite or remove users, change roles, and
      delete the organization. Most companies have 1–3 admins.
    </P>

    <H3 id="manager">Manager</H3>
    <P>
      Sees employees and contracts within their assigned department(s). Can
      author SOPs and run performance reviews for their team. Cannot see
      billing or organization-wide settings.
    </P>

    <H3 id="employee">Employee</H3>
    <P>
      Read access to SOPs and contracts assigned to them, plus their own
      profile, badges, and 1:1 history. They cannot see other employees' data.
    </P>

    <H3 id="portal-only">Portal-only</H3>
    <P>
      Doesn't have a Flodok account at all — accesses your organization's
      content only through the public employee portal link. Doesn't count
      toward your plan limit. Best for frontline staff or contractors who need
      occasional read access without a login.
    </P>

    <Callout type="tip">
      Flodok defaults are conservative — managers can't see other teams,
      employees can't see each other's contracts. If that's too tight,
      custom-plan customers can broaden specific permissions per role.
    </Callout>
  </>
)

const INVITES: ReactNode = (
  <>
    <P>
      The fastest way to onboard your team is to send invites by email or share
      a workspace link. There are two flavours: full Flodok accounts (admins,
      managers, employees) and portal-only access (no account needed).
    </P>

    <H3 id="email-invites">Email invites</H3>
    <P>
      In <strong>Settings → Team Members</strong> click <strong>Invite people</strong>.
      Enter their email, choose a role, and Flodok sends them an invite link
      that expires in 7 days. They click the link, set a password, and they're
      in.
    </P>

    <H3 id="bulk">Bulk inviting</H3>
    <P>
      Pro supports CSV upload — name, email, role, department.
      We send invites in batches and surface anyone who didn't receive theirs
      (typo, bounce, etc.) so you can resend.
    </P>

    <H3 id="portal-link">Sharing the portal link</H3>
    <P>
      For frontline teams, skip invites entirely. Copy your portal link from{' '}
      <strong>Settings → Portal</strong> and drop it in your team WhatsApp
      group. Anyone with the link can read assigned SOPs and announcements.
    </P>

    <Callout type="warn">
      Portal links are unguessable but not secret. If you have content that's
      strictly confidential, gate it behind employee accounts instead of the
      public portal.
    </Callout>
  </>
)

// ─── SOPs ────────────────────────────────────────────────

const SOP_CREATE: ReactNode = (
  <>
    <P>
      Flodok's SOP editor uses a block-based rich-text experience. Headings,
      lists, tables, images, embeds, and code blocks all work — paste from
      Google Docs or Notion and formatting carries over.
    </P>

    <H3 id="create">Creating a new SOP</H3>
    <Steps
      items={[
        <>From the dashboard, go to <strong>SOPs</strong> and click <strong>New SOP</strong>.</>,
        <>Give it a title and (optionally) a department. Both are searchable.</>,
        <>Start writing. Hit <code>/</code> for a block menu (heading, list, table, callout, embed).</>,
        <>Click <strong>Save draft</strong> to come back later, or <strong>Publish</strong> to make it live.</>,
      ]}
    />

    <H3 id="formatting">Formatting tips</H3>
    <Bullets
      items={[
        <>Use <strong>headings</strong> generously — they become a clickable table of contents in the portal.</>,
        <>Tables are great for decision matrices. Cells support inline formatting.</>,
        <>Embed videos (YouTube, Vimeo) by pasting the URL on a blank line.</>,
        <>Mark steps that <em>must</em> be done in order with a numbered list. Reading time is calculated automatically.</>,
      ]}
    />

    <H3 id="assign">Assigning to people</H3>
    <P>
      Open the right-hand panel and pick departments, roles, or specific
      employees. Anyone in the assigned scope sees the SOP in their portal and
      gets a notification. They can mark it as "read & understood" — visible to
      you in <strong>SOPs → [your SOP] → Acknowledgements</strong>.
    </P>

    <Callout type="tip">
      Save effort by writing one SOP and assigning to multiple departments
      rather than copy-pasting. Updates roll out to all assignees at once.
    </Callout>
  </>
)

const SOP_VERSIONING: ReactNode = (
  <>
    <P>
      Every save creates a snapshot. You can compare any two versions, roll
      back, or branch off into a draft.
    </P>

    <H3 id="how-it-works">How it works</H3>
    <P>
      Each time you click <strong>Save draft</strong> or <strong>Publish</strong>,
      Flodok stores a complete copy of the document along with who made the
      change and when. The published version is what your team sees; drafts
      stay invisible until the next publish.
    </P>

    <H3 id="diff">Comparing versions</H3>
    <P>
      Open <strong>SOPs → [your SOP] → History</strong>. Pick any two versions
      and Flodok renders a side-by-side diff with additions in green and
      removals in red. Useful for review before publishing.
    </P>

    <H3 id="rollback">Rolling back</H3>
    <P>
      In <strong>History</strong>, hit <strong>Restore</strong> on any version
      and Flodok creates a new draft from that snapshot. Nothing is destroyed —
      the version you rolled back from stays in history forever.
    </P>

    <Callout type="note">
      Acknowledgements are version-aware. If you publish a material update,
      previous "read & understood" marks reset for assignees so they re-read
      the new version.
    </Callout>
  </>
)

const SOP_IMPORT: ReactNode = (
  <>
    <P>
      Most teams arrive at Flodok with a graveyard of Google Docs, Notion
      pages, or Word files. We make moving them in painless.
    </P>

    <H3 id="paste">Paste from Google Docs / Notion</H3>
    <P>
      Open your source doc, select all, copy. In Flodok, create a new SOP and
      paste — headings, lists, tables, links, and images all carry over. Manual
      cleanup is usually under five minutes per doc.
    </P>

    <H3 id="upload">Upload .docx or .md</H3>
    <P>
      <strong>SOPs → New SOP → Upload file</strong>. We support .docx, .md, and
      .html. Tables and embedded images are preserved; complex Word layouts
      (multi-column, headers/footers) are flattened.
    </P>

    <H3 id="bulk">Bulk migration</H3>
    <P>
      For 50+ SOPs, our team can handle the migration as a paid add-on. Send
      us a Drive folder or a zip of files and you'll have everything in Flodok
      within a week. Email{' '}
      <a href="mailto:onboarding@flodok.com">onboarding@flodok.com</a>.
    </P>
  </>
)

// ─── Contracts ───────────────────────────────────────────

const CONTRACTS_CREATE: ReactNode = (
  <>
    <P>
      Flodok handles employment contracts, NDAs, and consultancy agreements end
      to end: draft, send for signature, store, and renew.
    </P>

    <H3 id="from-scratch">Starting from scratch</H3>
    <P>
      <strong>Contracts → New contract</strong>. Pick a template (PKWT, PKWTT,
      NDA, Consultancy) or start blank. Templates come pre-filled with standard
      Indonesian employment language and required clauses under{' '}
      <em>UU Cipta Kerja</em>.
    </P>

    <H3 id="merge-fields">Merge fields</H3>
    <P>
      Contracts support merge fields for employee name, position, salary, start
      date, and supervisor. Type <code>{`{{`}</code> in the editor to insert one.
      When you assign the contract to an employee, fields auto-populate from
      their record.
    </P>

    <H3 id="send">Sending for signature</H3>
    <P>
      Click <strong>Send for signature</strong>, choose the recipient, and add
      a personal note. They get an email with a secure link to read and sign —
      no Flodok account required. Once signed, both parties get a PDF copy and
      the contract status flips to <strong>Active</strong>.
    </P>

    <Callout type="tip">
      Set up auto-renewal reminders at <strong>Contracts → [contract] → Renewal</strong>.
      Flodok will email both you and the employee 30 days before the contract
      expires.
    </Callout>
  </>
)

const CONTRACTS_SIGN: ReactNode = (
  <>
    <P>
      Flodok's e-signature is legally enforceable in Indonesia under{' '}
      <em>UU 11/2008 (ITE)</em> as amended by <em>UU 19/2016</em>, and complies
      with PP 71/2019 on data residency.
    </P>

    <H3 id="how">How signing works</H3>
    <Steps
      items={[
        <>You send the contract from Flodok. The signer gets a unique, expiring link by email.</>,
        <>They open the link, read the contract, and click <strong>Sign</strong>.</>,
        <>They draw or type their signature, optionally upload a KTP/identity scan, and submit.</>,
        <>Both parties receive a signed PDF with audit trail (IP, timestamp, hash).</>,
      ]}
    />

    <H3 id="audit">Audit trail</H3>
    <P>
      Every signed contract carries a tamper-evident audit log: who viewed it,
      from where (IP + city), when they signed, and a SHA-256 hash of the
      signed document. Visible at <strong>Contracts → [contract] → Audit</strong>.
    </P>

    <H3 id="invalid">When e-signature isn't enough</H3>
    <P>
      Some documents — typically anything notarised or registered with a
      government office — still need physical wet ink. Flodok will export a
      print-ready PDF in those cases.
    </P>
  </>
)

const CONTRACTS_HISTORY: ReactNode = (
  <>
    <P>
      Like SOPs, contracts are versioned automatically. Every save and
      every signature creates a new snapshot.
    </P>

    <H3 id="view">Viewing history</H3>
    <P>
      <strong>Contracts → [contract] → History</strong> lists every revision
      with author, timestamp, and a one-line summary. Click any version to
      preview it; click <strong>Compare</strong> to diff against another.
    </P>

    <H3 id="amend">Amending an active contract</H3>
    <P>
      Once signed, the original is locked. To make changes, click{' '}
      <strong>Create amendment</strong> — this generates a linked addendum that
      gets its own signature flow. The original and the amendment travel
      together in your records.
    </P>

    <Callout type="warn">
      Editing contract content after signing is intentionally impossible. If
      you need to fix a typo, use an amendment with a one-line correction.
    </Callout>
  </>
)

// ─── Performance ─────────────────────────────────────────

const PERFORMANCE_REVIEWS: ReactNode = (
  <>
    <P>
      Lightweight performance reviews built around 360 feedback. No fifty-page
      forms — just the questions that matter, on a cycle that fits your team.
    </P>

    <H3 id="setup">Setting up a cycle</H3>
    <Steps
      items={[
        <>Go to <strong>Performance → New cycle</strong>.</>,
        <>Pick a template (Quarterly, Mid-year, Annual) or build your own questions.</>,
        <>Choose participants — by department, role, or specific employees.</>,
        <>Set the open and close dates. Flodok sends reminders automatically.</>,
      ]}
    />

    <H3 id="360">360 feedback</H3>
    <P>
      Each reviewee can have peer reviewers, a manager reviewer, and an
      optional self-review. Responses are private to the reviewee's manager and
      HR by default. You can change this per cycle.
    </P>

    <H3 id="results">Sharing results</H3>
    <P>
      After the cycle closes, managers see aggregated feedback per direct
      report and can write a manager summary. The summary — not the raw peer
      feedback — is what gets shared with the employee.
    </P>

    <Callout type="tip">
      Most Indonesian teams run quarterly mini-reviews and one annual deep
      review. Flodok's templates default to that cadence.
    </Callout>
  </>
)

const PERFORMANCE_ONE_ONES: ReactNode = (
  <>
    <P>
      A simple shared-doc model for ongoing 1:1s, plus a feedback log for
      moments worth remembering between reviews.
    </P>

    <H3 id="cadence">Setting a cadence</H3>
    <P>
      Each manager-direct pair has a 1:1 page. Pick a cadence (weekly,
      fortnightly, monthly) and Flodok creates a new note for each session
      with the previous one's open items pulled forward.
    </P>

    <H3 id="agenda">Shared agendas</H3>
    <P>
      Both manager and direct can add agenda items before the meeting. During
      the call, take notes inline. After, mark items as resolved or carry them
      forward.
    </P>

    <H3 id="feedback">Feedback log</H3>
    <P>
      Outside of formal reviews, capture small moments — a customer compliment,
      a missed deadline, a great pull request — in the feedback log. They
      surface in the next performance review so nothing gets lost to memory.
    </P>
  </>
)

const RECOGNITION: ReactNode = (
  <>
    <P>
      Flodok's recognition system is split into three: badges (free, public),
      credits (small monetary), and bonuses (large monetary). Each has its own
      rules and limits.
    </P>

    <H3 id="badges">Badges</H3>
    <P>
      Define your own badges (e.g., "Hospitality Hero", "Quarterly MVP") and
      give them to employees. Badges appear on the public portal and the
      employee's profile. They're free and unlimited.
    </P>

    <H3 id="credits">Credits</H3>
    <P>
      Credits are small recurring amounts — think a Rp 50.000 monthly perk
      budget per employee, redeemable internally or against marketplace
      partners. Set the cap per employee in <strong>Settings → Credits</strong>.
    </P>

    <H3 id="bonuses">Bonuses</H3>
    <P>
      Bonuses are larger one-off awards (e.g., end-of-quarter cash bonus). They
      require admin approval and are exported to your payroll system as a CSV
      line item, ready to import into Mekari Talenta or Gajihub.
    </P>

    <Callout type="note">
      Each award type can be toggled on or off per organization. If you only
      want badges, leave Credits and Bonuses disabled.
    </Callout>
  </>
)

// ─── Employee Portal ────────────────────────────────────

const PORTAL_ABOUT: ReactNode = (
  <>
    <P>
      The employee portal is a public, read-only mirror of your team's content
      — SOPs, announcements, awards, and contracts they've signed. Each
      organization gets a unique URL like{' '}
      <code>flodok.com/portal/your-org</code>.
    </P>

    <H3 id="who-it-is-for">Who it's for</H3>
    <P>
      Frontline staff who don't need a full Flodok account: warehouse, retail,
      kitchen, drivers, contractors. Anyone you'd otherwise share a Google
      Drive folder with.
    </P>

    <H3 id="what-they-see">What they see</H3>
    <Bullets
      items={[
        'SOPs assigned to them or their department',
        'Contracts they have signed (read-only)',
        'Their badges and any awards they have received',
        'Announcements you broadcast to the team',
      ]}
    />

    <H3 id="what-they-dont">What they cannot see</H3>
    <Bullets
      items={[
        "Other employees' contracts or compensation",
        'Performance reviews (theirs or others)',
        'Internal-only SOPs (toggle per SOP)',
        'Anything in Settings, Integrations, or Billing',
      ]}
    />
  </>
)

const PORTAL_SHARE: ReactNode = (
  <>
    <P>
      The portal is a single URL that anyone in your organization can use to
      access their content — no login required.
    </P>

    <H3 id="get-link">Getting your portal link</H3>
    <P>
      <strong>Settings → Portal → Copy link</strong>. The link is unguessable
      but not secret — anyone with it can read public content. You can rotate
      the link any time, which immediately invalidates the old one.
    </P>

    <H3 id="distribute">Distributing the link</H3>
    <P>
      Most teams drop the link in the team WhatsApp group, save it as a
      bookmark on shared tablets at the front desk, or print it on the back of
      employee ID cards. The portal is mobile-first and works fine over slow
      connections.
    </P>

    <Callout type="tip">
      Generate a QR code from <strong>Settings → Portal → QR code</strong> and
      print it on the wall in your kitchen, warehouse, or front desk. Staff
      scan and they're in.
    </Callout>
  </>
)

const PORTAL_CUSTOMIZE: ReactNode = (
  <>
    <P>
      Tailor what your team sees — branding, language, which sections are
      visible, and what's pinned to the top.
    </P>

    <H3 id="branding">Branding</H3>
    <P>
      Upload your logo and pick an accent colour in <strong>Settings →
      Organization</strong>. The portal renders in your brand, not Flodok's.
    </P>

    <H3 id="sections">Sections & navigation</H3>
    <P>
      Toggle individual portal sections in <strong>Settings → Portal →
      Sections</strong>. If you don't use Awards yet, hide it. If you want a
      simple SOPs-only portal, hide everything else.
    </P>

    <H3 id="announcements">Announcements</H3>
    <P>
      Pin a message to the top of the portal — useful for safety reminders,
      shift changes, or company-wide updates. Markdown supported.
    </P>
  </>
)

// ─── Integrations ───────────────────────────────────────

const INTEGRATIONS_FIREFLIES: ReactNode = (
  <>
    <P>
      Connect Fireflies and meeting recordings flow into Flodok automatically —
      transcripts attached to 1:1s, action items lifted into your follow-ups.
    </P>

    <H3 id="connect">Connecting Fireflies</H3>
    <Steps
      items={[
        <>Go to <strong>Settings → Integrations → Fireflies</strong>.</>,
        <>Click <strong>Connect</strong> and authorise via your Fireflies account.</>,
        <>Pick which meeting types to pull in — defaults exclude internal-only meetings.</>,
      ]}
    />

    <H3 id="usage">What flows in</H3>
    <Bullets
      items={[
        'Meeting transcripts attach automatically to the matching 1:1 page',
        'Action items get lifted into the next 1:1 agenda',
        'Speaker stats show up in performance review prep',
      ]}
    />

    <Callout type="note">
      Fireflies' free plan exposes the GraphQL API we use. The webhook-based
      real-time sync needs the Fireflies Business plan ($19/month).
    </Callout>
  </>
)

const INTEGRATIONS_SLACK: ReactNode = (
  <>
    <P>
      Get notifications in Slack when SOPs change, contracts are signed, or
      performance cycles open or close.
    </P>

    <H3 id="connect">Connecting Slack</H3>
    <P>
      <strong>Settings → Integrations → Slack → Connect</strong>. Authorise via
      your Slack workspace and choose which channel each notification type
      goes to.
    </P>

    <H3 id="events">Events you can subscribe to</H3>
    <Bullets
      items={[
        'New SOP published',
        'SOP acknowledgement reminders',
        'Contract sent / signed / expired',
        'Performance cycle opened / closing soon / closed',
        'New employee added',
      ]}
    />
  </>
)

const INTEGRATIONS_SSO: ReactNode = (
  <>
    <P>
      Single sign-on through Google Workspace is included on Pro. Generic
      SAML 2.0 SSO (Okta, Azure AD, JumpCloud) is available on custom plans —
      <Link to="/contact"> get in touch</Link> if you need it.
    </P>

    <H3 id="google">Google Workspace</H3>
    <P>
      In <strong>Settings → Integrations → Google SSO</strong>, click{' '}
      <strong>Enable</strong> and confirm via your Google admin. After that,
      anyone signing up with a matching company domain auto-joins your
      Flodok organization.
    </P>

    <H3 id="saml">SAML 2.0</H3>
    <P>
      Provide Flodok's metadata XML to your IdP (Okta, Azure AD, JumpCloud, or
      Google), then paste the IdP's metadata back into Flodok. We support
      attribute mapping for role and department so users land in the right
      place automatically.
    </P>

    <Callout type="tip">
      With SSO enabled you can require it for all admins — recommended for
      organizations with sensitive contract data.
    </Callout>
  </>
)

// ─── Settings ───────────────────────────────────────────

const SETTINGS_ORG: ReactNode = (
  <>
    <P>
      Organization settings cover everything top-level: brand identity, time
      zones, language defaults, and contact details.
    </P>

    <H3 id="identity">Identity</H3>
    <Bullets
      items={[
        <><strong>Legal name</strong> — used on contracts and tax invoices.</>,
        <><strong>Display name (trading)</strong> — used in the product UI and portal. Optional.</>,
        <><strong>Logo</strong> — appears in the sidebar, portal header, and exported PDFs.</>,
        <><strong>Address</strong> — required if you generate Faktur Pajak.</>,
      ]}
    />

    <H3 id="locale">Locale</H3>
    <P>
      Pick a default language (Bahasa Indonesia or English) and time zone (WIB,
      WITA, or WIT). Individuals can override these in their personal
      preferences without changing the organization default.
    </P>

    <H3 id="contacts">Contacts</H3>
    <P>
      Set a billing contact (gets invoices) and a security contact (gets
      breach notifications under UU PDP). They can be the same person.
    </P>
  </>
)

const SETTINGS_TIMEZONES: ReactNode = (
  <>
    <P>
      Indonesia spans three time zones — WIB (UTC+7), WITA (UTC+8), and WIT
      (UTC+9). Flodok handles all three natively and you can mix them within a
      single organization.
    </P>

    <H3 id="org-default">Organization default</H3>
    <P>
      <strong>Settings → Organization → Time zone</strong>. The default applies
      to anyone who hasn't set their own. Most companies pick the time zone of
      their HQ.
    </P>

    <H3 id="per-user">Per-user override</H3>
    <P>
      Each user can override the default in <strong>Account → Preferences →
      Time zone</strong>. Useful for branch staff in Bali (WITA) or Papua (WIT)
      reporting into a Jakarta HQ (WIB).
    </P>

    <H3 id="display">How times display</H3>
    <P>
      Timestamps in the product (created, updated, signed) display in the
      reader's local time zone with the abbreviation (WIB/WITA/WIT). Exports
      record times in the originating user's time zone with offset.
    </P>
  </>
)

const SETTINGS_LANGUAGE: ReactNode = (
  <>
    <P>
      Flodok ships in Bahasa Indonesia and English. Both are first-class —
      every screen, error message, and email template is fully translated.
    </P>

    <H3 id="user-pref">Per-user preference</H3>
    <P>
      Each user picks their own language from the avatar menu (top-right, EN /
      ID toggle). Changes apply immediately.
    </P>

    <H3 id="org-default">Organization default</H3>
    <P>
      The org-level language sets the default for new invitees and dictates
      the language of system emails sent on the org's behalf (invites,
      contract sign requests, breach notices).
    </P>

    <H3 id="content">SOP & contract content</H3>
    <P>
      Content you write yourself — SOPs, contracts, announcements — is in
      whatever language you author it in. We don't auto-translate. Some teams
      maintain bilingual SOPs by including both languages in a single document.
    </P>
  </>
)

// ─── Account & Billing ──────────────────────────────────

const BILLING_MANAGE: ReactNode = (
  <>
    <P>
      Manage your subscription, payment method, and invoices from{' '}
      <strong>Settings → Billing</strong>.
    </P>

    <H3 id="upgrade">Upgrading</H3>
    <P>
      Click <strong>Upgrade</strong> and pick the new plan. We prorate the
      difference and you're on the new tier immediately. No call required.
    </P>

    <H3 id="downgrade">Downgrading</H3>
    <P>
      Same place — pick a lower plan. The change applies at the start of your
      next billing cycle. If you'd exceed the new plan's employee limit,
      you'll be asked to remove employees first.
    </P>

    <H3 id="cancel">Cancelling</H3>
    <P>
      <strong>Settings → Billing → Cancel subscription</strong>. Your account
      stays active until the end of the paid period, then drops back to the
      Free plan (or read-only if you exceed Free's 2-employee limit). Your
      data is retained for 30 days for export, then permanently deleted.
    </P>
  </>
)

const BILLING_PAYMENT: ReactNode = (
  <>
    <P>
      Flodok accepts every common Indonesian payment method, plus international
      cards for teams paying from abroad.
    </P>

    <H3 id="local">Local methods</H3>
    <Bullets
      items={[
        'Bank transfer — BCA, Mandiri, BNI, BRI (auto-reconciled via virtual account)',
        'E-wallets — OVO, GoPay, DANA, ShopeePay',
        'QRIS — pay with any QRIS-enabled wallet or banking app',
      ]}
    />

    <H3 id="international">International methods</H3>
    <Bullets
      items={[
        'Credit card — Visa, Mastercard, JCB',
        'Wire transfer — for annual Pro contracts (invoiced)',
      ]}
    />

    <Callout type="tip">
      Annual plans paid by bank transfer get a 20% discount and Faktur Pajak
      handled automatically. Contact{' '}
      <a href="mailto:billing@flodok.com">billing@flodok.com</a> to set up.
    </Callout>
  </>
)

const BILLING_INVOICES: ReactNode = (
  <>
    <P>
      Every payment generates a downloadable invoice. For organizations
      registered as PKP (Pengusaha Kena Pajak), Flodok issues a Faktur Pajak
      Elektronik (e-Faktur).
    </P>

    <H3 id="standard">Standard invoices</H3>
    <P>
      Invoices land in your billing email and appear in <strong>Settings →
      Billing → Invoices</strong>. PDF includes your legal name, address, and
      tax ID (NPWP) if you've added one.
    </P>

    <H3 id="faktur">Faktur Pajak</H3>
    <P>
      Add your NPWP in <strong>Settings → Organization → Tax</strong>. Once
      validated, every monthly or annual invoice is issued as an e-Faktur with
      the PPN (11%) line, deductible on your return.
    </P>

    <H3 id="receipts">Receipts (kuitansi)</H3>
    <P>
      Need a separate kuitansi for petty cash reconciliation? Generate one
      from <strong>Invoice → Generate kuitansi</strong>. Stamped (with digital
      e-meterai) on demand for amounts above Rp 5.000.000.
    </P>
  </>
)

// ─── Sections registry ──────────────────────────────────

export const sections: DocSection[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    description: 'The basics: account, plans, roles, and inviting your team.',
    topics: [
      {
        slug: 'quickstart',
        title: 'Quickstart',
        description: 'Everything you need to know to start running your operation on Flodok in ten minutes.',
        iconKey: 'sparkles',
        body: QUICKSTART,
      },
      {
        slug: 'plans',
        title: 'Plans & Pricing',
        description: "Compare Flodok's three plans, what's in each, and how billing works.",
        iconKey: 'card',
        body: PLANS,
      },
      {
        slug: 'roles',
        title: 'Understanding Roles',
        description: 'Admins, managers, employees, and portal-only access — what each can see and do.',
        iconKey: 'shield',
        body: ROLES,
      },
      {
        slug: 'invite-team',
        title: 'Inviting Your Team',
        description: 'Email invites, bulk uploads, and sharing the public portal link.',
        iconKey: 'users',
        body: INVITES,
      },
    ],
  },
  {
    id: 'sops',
    title: 'SOPs',
    description: 'Standard Operating Procedures — write, version, publish, and import.',
    topics: [
      {
        slug: 'sop-create',
        title: 'Creating an SOP',
        description: 'Use the rich-text editor to write SOPs your team will actually read.',
        iconKey: 'pen',
        body: SOP_CREATE,
      },
      {
        slug: 'sop-versioning',
        title: 'SOP Versioning',
        description: 'How history, diffs, and acknowledgements stay in sync as you update.',
        iconKey: 'history',
        body: SOP_VERSIONING,
      },
      {
        slug: 'sop-import',
        title: 'Importing SOPs',
        description: 'Move from Google Docs, Notion, or Word with formatting preserved.',
        iconKey: 'upload',
        body: SOP_IMPORT,
      },
    ],
  },
  {
    id: 'contracts',
    title: 'Contracts',
    description: 'Draft, send, sign, and store employment and consultancy agreements.',
    topics: [
      {
        slug: 'contracts-create',
        title: 'Creating Contracts',
        description: 'Templates, merge fields, and the basics of drafting in Flodok.',
        iconKey: 'file',
        body: CONTRACTS_CREATE,
      },
      {
        slug: 'contracts-sign',
        title: 'E-signatures',
        description: "Legally enforceable e-signing under UU 11/2008 (ITE), with audit trail.",
        iconKey: 'pen',
        body: CONTRACTS_SIGN,
      },
      {
        slug: 'contracts-history',
        title: 'Contract History',
        description: 'Versioning, amendments, and how Flodok keeps signed contracts immutable.',
        iconKey: 'history',
        body: CONTRACTS_HISTORY,
      },
    ],
  },
  {
    id: 'performance',
    title: 'Performance',
    description: 'Reviews, 1:1 trackers, and recognition — without the spreadsheet sprawl.',
    topics: [
      {
        slug: 'performance-reviews',
        title: 'Performance Reviews',
        description: '360-style review cycles, configurable per quarter, year, or custom cadence.',
        iconKey: 'star',
        body: PERFORMANCE_REVIEWS,
      },
      {
        slug: 'one-on-ones',
        title: '1:1s & Feedback',
        description: 'Shared 1:1 docs and a lightweight feedback log for moments worth remembering.',
        iconKey: 'workflow',
        body: PERFORMANCE_ONE_ONES,
      },
      {
        slug: 'recognition',
        title: 'Awards & Recognition',
        description: 'Badges, credits, and bonuses — three layers of recognition with their own rules.',
        iconKey: 'star',
        body: RECOGNITION,
      },
    ],
  },
  {
    id: 'portal',
    title: 'Employee Portal',
    description: 'A read-only public mirror of your content — no logins required.',
    topics: [
      {
        slug: 'portal-about',
        title: 'About the Portal',
        description: 'What the public employee portal is, who it is for, and what it shows.',
        iconKey: 'globe',
        body: PORTAL_ABOUT,
      },
      {
        slug: 'portal-share',
        title: 'Sharing the Portal',
        description: 'Distribute your unique portal link via WhatsApp, QR code, or print.',
        iconKey: 'eye',
        body: PORTAL_SHARE,
      },
      {
        slug: 'portal-customize',
        title: 'Customizing the Portal',
        description: 'Branding, sections, language, and pinned announcements.',
        iconKey: 'settings',
        body: PORTAL_CUSTOMIZE,
      },
    ],
  },
  {
    id: 'integrations',
    title: 'Integrations',
    description: 'Connect Fireflies, Slack, and your identity provider.',
    topics: [
      {
        slug: 'integrations-fireflies',
        title: 'Fireflies',
        description: 'Pipe meeting transcripts and action items straight into your 1:1s.',
        iconKey: 'plug',
        body: INTEGRATIONS_FIREFLIES,
      },
      {
        slug: 'integrations-slack',
        title: 'Slack',
        description: 'Channel notifications for SOPs, contracts, performance, and team events.',
        iconKey: 'plug',
        body: INTEGRATIONS_SLACK,
      },
      {
        slug: 'integrations-sso',
        title: 'Google SSO & SAML',
        description: 'Single sign-on via Google Workspace (Pro) or any SAML 2.0 IdP (custom plan).',
        iconKey: 'lock',
        body: INTEGRATIONS_SSO,
      },
    ],
  },
  {
    id: 'settings',
    title: 'Settings',
    description: 'Identity, locale, languages, and how Indonesia-specific bits work.',
    topics: [
      {
        slug: 'settings-org',
        title: 'Organization Settings',
        description: 'Legal name, display name, logo, address, and contact roles.',
        iconKey: 'settings',
        body: SETTINGS_ORG,
      },
      {
        slug: 'settings-timezones',
        title: 'Time Zones (WIB / WITA / WIT)',
        description: "Indonesia's three time zones, how the org default works, and per-user overrides.",
        iconKey: 'clock',
        body: SETTINGS_TIMEZONES,
      },
      {
        slug: 'settings-language',
        title: 'Languages (Bahasa & English)',
        description: 'Per-user and org-default language. How content authoring relates to UI language.',
        iconKey: 'language',
        body: SETTINGS_LANGUAGE,
      },
    ],
  },
  {
    id: 'billing',
    title: 'Account & Billing',
    description: 'Plans, payment methods, invoices, and Faktur Pajak.',
    topics: [
      {
        slug: 'billing-manage',
        title: 'Managing Billing',
        description: 'Upgrade, downgrade, cancel, and what happens to your data if you leave.',
        iconKey: 'wallet',
        body: BILLING_MANAGE,
      },
      {
        slug: 'billing-payment',
        title: 'Payment Methods',
        description: 'BCA, Mandiri, e-wallets, QRIS, credit cards, and international wires.',
        iconKey: 'card',
        body: BILLING_PAYMENT,
      },
      {
        slug: 'billing-invoices',
        title: 'Invoices & Faktur Pajak',
        description: 'Standard invoices, e-Faktur for PKP organizations, and kuitansi on demand.',
        iconKey: 'receipt',
        body: BILLING_INVOICES,
      },
    ],
  },
]

// Flat lookup
export const allTopics: DocTopic[] = sections.flatMap((s) => s.topics)
export const sectionBySlug: Record<string, DocSection> = Object.fromEntries(
  sections.flatMap((s) => s.topics.map((t) => [t.slug, s])),
)

// ─── FAQ ────────────────────────────────────────────────

export interface FAQGroup {
  id: string
  title: string
  items: { q: string; a: ReactNode }[]
}

export const faqGroups: FAQGroup[] = [
  {
    id: 'general',
    title: 'General',
    items: [
      {
        q: 'Is Flodok built specifically for Indonesia?',
        a: <P>Yes. Bahasa-first UI, WIB / WITA / WIT time zones, IDR pricing, Faktur Pajak support, and built by people running businesses here.</P>,
      },
      {
        q: 'Do my employees need to create accounts?',
        a: <P>Only people who need to write or manage data — admins, managers, content authors. Frontline staff can use the public employee portal with no login.</P>,
      },
      {
        q: 'Can I use Flodok in Bahasa Indonesia?',
        a: <P>Yes. Every screen, error message, and email template is fully translated. Each user picks their language from the avatar menu.</P>,
      },
      {
        q: 'Is there a free plan?',
        a: <P>Yes — the Free plan covers organizations of up to 2 employees forever, with 1 SOP and 1 contract per employee plus the public portal. Beyond that you'll need Pro, which uses graduated per-seat pricing starting at Rp 240.000/month for 3 employees.</P>,
      },
    ],
  },
  {
    id: 'pricing',
    title: 'Pricing & Billing',
    items: [
      {
        q: 'What counts as an "employee"?',
        a: <P>Anyone you've added to Flodok with a login. Portal-only users (no account, just access via the public portal link) don't count toward your plan limit.</P>,
      },
      {
        q: 'What payment methods do you accept?',
        a: <P>BCA, Mandiri, BNI, BRI bank transfer; OVO, GoPay, DANA, ShopeePay; QRIS; credit card; international wire for annual contracts.</P>,
      },
      {
        q: 'Do you issue Faktur Pajak?',
        a: <P>Yes. Add your NPWP in Settings → Organization → Tax and we'll issue an e-Faktur for every paid invoice automatically.</P>,
      },
      {
        q: 'Can I cancel anytime?',
        a: <P>One click in Settings → Billing. No exit interview, no retention email. You stay active until the end of the paid period, then your data is retained 30 days for export.</P>,
      },
    ],
  },
  {
    id: 'data',
    title: 'Data & Security',
    items: [
      {
        q: 'Where is my data hosted?',
        a: <P>Primary infrastructure is in Indonesia and Singapore. Backups are encrypted and stored in Singapore (AWS ap-southeast-1). Full subprocessor list on our <Link to="/dpa">DPA page</Link>.</P>,
      },
      {
        q: 'Is Flodok compliant with UU PDP?',
        a: <P>Yes. We process Customer Data as a Data Processor under our DPA, with 72-hour breach notification, data subject rights handling, and Indonesia-resident primary storage. Full details on our <Link to="/privacy">Privacy Policy</Link>.</P>,
      },
      {
        q: 'How do I export my data?',
        a: <P>Settings → Data → Export. You'll get a zip with all your SOPs (Markdown), contracts (PDFs), employee records (CSV), and audit logs (JSON). Available on every plan.</P>,
      },
      {
        q: 'Are e-signatures legally binding?',
        a: <P>Yes, under UU 11/2008 (ITE) and UU 19/2016. Every signed contract carries an audit trail with IP, timestamp, and a tamper-evident hash. See <Link to="/help/docs/contracts-sign">E-signatures</Link>.</P>,
      },
    ],
  },
  {
    id: 'product',
    title: 'Product',
    items: [
      {
        q: 'Can I import SOPs from Google Docs?',
        a: <P>Yes. Paste from Google Docs and formatting carries over. For 50+ SOPs, our team handles the migration — see <Link to="/help/docs/sop-import">Importing SOPs</Link>.</P>,
      },
      {
        q: 'Do you integrate with payroll or BPJS?',
        a: <P>Direct payroll and BPJS integrations are on our 2026 roadmap. In the meantime, exports work cleanly with Mekari Talenta, Gajihub, and most local payroll systems.</P>,
      },
      {
        q: 'Can I use Flodok offline?',
        a: <P>Read access works offline — once a page is loaded, it stays available. Writing requires connectivity. The mobile portal is optimised for slow networks.</P>,
      },
    ],
  },
]
