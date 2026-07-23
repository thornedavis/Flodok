import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { LeaveRequestDemo, LeaveJourneyDemo, ApprovingDemo, PayrollDemo, ConfigDemo } from '../../components/help/GuidedDemo'
import { InviteTeamDemo, PlansDemo, QuickstartDemo, RolesDemo } from '../../components/help/demos/GettingStarted'
import { HiringCandidatesDemo, HiringFunnelDemo, HiringOffersDemo, HiringSeparationDemo } from '../../components/help/demos/Recruitment'
import { SopCreateDemo, SopImportDemo, SopVersioningDemo } from '../../components/help/demos/Sops'
import { ContractTemplatesDemo, ContractsCreateDemo, ContractsHistoryDemo, ContractsSignDemo } from '../../components/help/demos/Contracts'
import { RecognitionDemo } from '../../components/help/demos/Performance'
import { PortalAboutDemo, PortalCustomizeDemo, PortalOnboardingDemo, PortalShareDemo } from '../../components/help/demos/Portal'
import { FirefliesDemo } from '../../components/help/demos/Integrations'
import { SettingsLanguageDemo, SettingsOrgDemo, SettingsTimezonesDemo } from '../../components/help/demos/SettingsDemos'
import { BillingInvoicesDemo, BillingManageDemo, BillingPaymentDemo } from '../../components/help/demos/Billing'

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
  | 'briefcase'
  | 'handshake'
  | 'door-out'

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

    <QuickstartDemo />

    <H3 id="create-account">1. Create your account</H3>
    <P>
      Head to <Link to="/signup">flodok.com/signup</Link> and create a free
      account. You'll need a name, the legal name of your organization, an email,
      and a password. The Free plan is free forever for teams up to 2
      employees — no card required.
    </P>

    <H3 id="set-up-workspace">2. Set up your workspace</H3>
    <P>
      Once you're in, open the <strong>Company</strong> page:
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
      <strong>Settings → Team Members</strong>. You can invite <strong>Admins</strong> (full
      access), <strong>HR</strong> for your people team, or <strong>Members</strong>
      with limited access — plus the portal-only link for frontline staff.
    </P>
    <Callout type="tip">
      Most teams invite admins through Flodok directly, but distribute the
      <em> employee portal link</em> over WhatsApp — your team gets read access
      to SOPs without needing to log in.
    </Callout>

    <H3 id="first-sop">4. Publish your first SOP</H3>
    <P>
      Go to <strong>Documents → SOPs → New SOP</strong>. Write the EN
      side of the first block (or hit <strong>AI Generate</strong> and
      describe what you want) — Flodok translates the ID side on save,
      and you can edit either language directly. Save as draft, then
      click <strong>Publish</strong> when ready. Your team sees it
      immediately on their portal.
    </P>

    <H3 id="hiring">5. Bring on your first hire</H3>
    <P>
      When you're ready to hire, head to <strong>Recruitment</strong>. Add a
      candidate in seconds (just a name), and send them their{' '}
      <strong>portal link</strong> — they fill in their own screening profile,
      which moves them from Prospective to Shortlisted for you to review. When
      you click <strong>Make offer</strong>, Flodok auto-creates a draft
      contract from your{' '}
      <Link to="/help/docs/contract-templates">position template</Link>{' '}
      for the candidate to e-sign.
    </P>

    <H3 id="next">What to do next</H3>
    <Bullets
      items={[
        <Link to="/help/docs/hiring-funnel">Learn the hiring funnel</Link>,
        <Link to="/help/docs/contract-templates">Define a contract template per job position</Link>,
        <Link to="/help/docs/sop-versioning">Understand how SOP versioning works</Link>,
        <Link to="/help/docs/portal-about">Set up your employee portal</Link>,
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

    <PlansDemo />

    <H3 id="comparison">What's different per plan</H3>
    <Bullets
      items={[
        <><strong>Free</strong> — Up to 2 employees, with 1 SOP and 1 contract per employee. No AI features or integrations. Forever free, no card required.</>,
        <><strong>Pro</strong> — Per-employee pricing, 3-employee minimum. Unlimited SOPs and contracts, AI drafting and translation included, e-signatures, performance reviews, plus Fireflies and Asana integrations.</>,
      ]}
    />

    <H3 id="how-pro-pricing-works">How Pro pricing works</H3>
    <P>
      Pro uses graduated per-employee pricing — like income-tax brackets. Each
      employee is priced based on which bracket they fall into, so the total
      cost only ever goes up as you add employees:
    </P>
    <Bullets
      items={[
        <><strong>Employees 1–15</strong> — Rp 100,000 per employee / month</>,
        <><strong>Employees 16–40</strong> — Rp 70,000 per employee / month</>,
        <><strong>Employees 41+</strong> — Rp 50,000 per employee / month</>,
      ]}
    />
    <P>
      A 10-employee team pays Rp 1,000,000/month. A 30-employee team pays
      Rp 2,550,000/month (15 × 100k + 15 × 70k). A 100-employee team pays
      Rp 6,250,000/month (15 × 100k + 25 × 70k + 60 × 50k). Drag the slider on
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

    <RolesDemo />

    <H3 id="owner">Owner</H3>
    <P>
      The person who owns the organization. Full access to everything — including
      billing and deleting the org — and the final approver on leave and overtime
      requests. There is one owner per organization.
    </P>

    <H3 id="admin">Admin</H3>
    <P>
      Full access to run the organization day-to-day: employees, documents,
      recruitment, payroll, performance, and settings. Can invite or remove users
      and change roles. Most organizations have 1–3 admins.
    </P>

    <H3 id="hr">HR</H3>
    <P>
      For your people team. Can manage employees, recruitment, forms, and payroll,
      but not organization-level billing or settings.
    </P>

    <H3 id="member">Member</H3>
    <P>
      A standard team member. Access to what is shared or assigned to them — their
      own profile, badges, and the SOPs and contracts they are given — without
      people-management powers.
    </P>

    <Callout type="tip">
      Frontline staff and contractors do not need an account at all: share the
      public <Link to="/help/docs/portal-about">employee portal</Link> link and
      they get read access without a login, and without counting toward your plan
      limit.
    </Callout>
  </>
)

const INVITES: ReactNode = (
  <>
    <P>
      The fastest way to onboard your team is to send invites by email or share
      a workspace link. There are two flavours: full Flodok accounts (<strong>Admin</strong>, <strong>HR</strong>, or
      <strong>Member</strong>) and portal-only access (no account needed).
    </P>

    <InviteTeamDemo />

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
      Flodok's editor is bilingual by design — every SOP is authored in
      both English and Bahasa Indonesia, paired block-by-block. The
      editor renders the two languages side-by-side or stacked (your
      choice, remembered per-doc), so reviewers can keep the two
      versions aligned as the document evolves.
    </P>

    <SopCreateDemo />

    <H3 id="create">Creating a new SOP</H3>
    <Steps
      items={[
        <>From the dashboard, open <strong>Documents</strong> and click <strong>Create → SOP</strong> (or the New SOP tile).</>,
        <>Give it a title and (optionally) a department. Both are searchable.</>,
        <>Write the EN side; Flodok translates the missing ID side on save (and vice versa). Or fill in both — the editor's BubbleMenu has a <strong>Translate</strong> action for the selected text.</>,
        <>Group related sentences into the same <strong>block</strong> so translation parity stays clean. Hit <strong>+ Add block</strong> for a new paired block; the gutter <strong>+</strong> menu adds text, headings, tables, and callouts.</>,
        <>Click <strong>Save as draft</strong> to come back later, or <strong>Publish</strong> to make it live.</>,
      ]}
    />

    <H3 id="ai-generate">AI Generate</H3>
    <P>
      Click <strong>AI Generate</strong> in the toolbar to draft an SOP
      from a short prompt. Flodok produces a fully bilingual structured
      doc (both EN and ID filled in, organised into sections and
      blocks) that you can then edit and refine. Useful as a starting
      point — you'll still want to tailor it to your team's actual
      process.
    </P>

    <H3 id="formatting">Formatting tips</H3>
    <Bullets
      items={[
        <>Use <strong>Heading</strong> and <strong>Subheading</strong> blocks to structure the document — they form its outline.</>,
        <>Headings (H3, H4) work <em>within</em> a block for sub-structure.</>,
        <>Tables, bullet/numbered lists, callouts, and code blocks are all available from the toolbar.</>,
        <>The "needs review" banner appears on a block when both its EN and ID sides were edited in the same save — a hint to double-check translation parity.</>,
      ]}
    />

    <H3 id="assign">Assigning to people</H3>
    <P>
      Open the right-hand panel and pick departments, roles, or specific
      employees. Anyone in the assigned scope sees the SOP in their portal and
      gets a notification. They can mark it as "read & understood" — visible to
      in the SOP's <strong>Signatures</strong> panel.
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

    <SopVersioningDemo />

    <H3 id="how-it-works">How it works</H3>
    <P>
      Each time you click <strong>Save draft</strong> or <strong>Publish</strong>,
      Flodok stores a complete copy of the document along with who made the
      change and when. The published version is what your team sees; drafts
      stay invisible until the next publish.
    </P>

    <H3 id="diff">Comparing versions</H3>
    <P>
      Open the editor's <strong>⋯ → History</strong>. Pick any two versions
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
      pages, or Word files. The bilingual editor is structured (paired
      EN/ID per block), so importing is a slightly more deliberate act
      than dumping a markdown file — but in practice it's still quick.
    </P>

    <SopImportDemo />

    <H3 id="import-existing">Import an existing PDF</H3>
    <P>
      The quickest path for a document you already have: from{' '}
      <strong>Documents</strong>, choose <strong>Import existing</strong>, pick the
      type (SOP, contract, NDA…), and upload a <strong>PDF</strong>. Flodok reads it
      with AI vision and pre-fills a bilingual draft you review and save — no
      copy-paste, no re-typing. This is what the demo above walks through.
    </P>

    <H3 id="paste">Paste from Google Docs / Notion</H3>
    <P>
      Open your source doc, select all, copy. In Flodok, create a new
      SOP and paste into the EN side of the first block — headings,
      lists, tables, and links carry over. Flodok will translate the
      ID side on the first save. Use <strong>+ Add block</strong> to
      break the dump into logical blocks after pasting.
    </P>

    <H3 id="ai">Generate from a prompt</H3>
    <P>
      No source doc to paste or import? Click{' '}
      <strong>AI Generate</strong> in the editor toolbar and describe
      the SOP you want. Flodok drafts a fully bilingual structured doc
      (blocks, EN + ID) that you can refine. Faster than
      starting from scratch.
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

// ─── Recruitment ─────────────────────────────────────────

const HIRING_FUNNEL: ReactNode = (
  <>
    <P>
      Flodok models recruitment as a single funnel that lives alongside your
      employee directory — candidates are stored in the same table as your
      active staff, surfaced on a different page, and graduate over to the
      Employees list automatically once they start. No transfer step, no
      duplicate entry.
    </P>

    <HiringFunnelDemo />

    <H3 id="stages">The five stages</H3>
    <P>
      Every candidate sits in one of these <strong>lifecycle stages</strong>.
      The stage drives where they appear in the app and which actions are
      available. One jump is special — Prospective to Shortlisted happens{' '}
      <strong>automatically</strong> when the candidate finishes their screening
      profile (see <Link to="/help/docs/hiring-candidates">Adding a candidate</Link>).
    </P>
    <Bullets
      items={[
        <><strong>Prospective</strong> — you've added them and sent their portal link. They're filling in their screening profile; the ball is in their court, and the card reads <em>"Awaiting profile"</em> until they do.</>,
        <><strong>Shortlisted</strong> — they've completed their screening profile, so now it's <em>your</em> move: review what they submitted (age, marital status, religion, location) and decide whether to take them forward. Finishing the profile moves them here automatically; you can also shortlist by hand.</>,
        <><strong>Offered</strong> — you've made the offer; a draft contract, with a linked job description, is waiting for them to sign.</>,
        <><strong>Signed</strong> — candidate has e-signed the contract and finished onboarding; awaiting their start date.</>,
        <><strong>Talent pool</strong> — declined for now but worth keeping in touch with. Lives outside the main funnel.</>,
      ]}
    />

    <H3 id="auto-graduate">Auto-graduation to Employees</H3>
    <P>
      The moment a Signed candidate's <strong>start date</strong> arrives, they
      flip to <strong>Active</strong> and disappear from Recruitment, reappearing
      in the Employees directory. This happens lazily — on the next Recruitment
      page load and on the next time the candidate opens their portal — so
      there's no nightly job to wait for. If you set the start date for next
      Monday and they sign on Friday, Monday morning they're an employee.
    </P>

    <H3 id="filters">Board, list, and the detail drawer</H3>
    <Bullets
      items={[
        <>Recruitment opens on a <strong>board</strong> — one column per stage, each candidate a card showing where they are and whose court the ball is in. Toggle to a <strong>list</strong> view for a denser, sortable table; your choice is remembered per browser. Search and the multi-select <strong>Stage</strong> filter narrow either view.</>,
        <>Click any card or row to open the <strong>detail drawer</strong> — a slide-out with the candidate's journey, a plain-language status line, and every action: move stage, make offer, set start date, copy their portal link, or message them on <strong>WhatsApp</strong>.</>,
        <>Stage changes live in the drawer, not on the card. Most forward moves are one button (<strong>Shortlist → Make offer → Activate</strong>); the stage picker above it is for corrections (rewind, talent pool, no-show).</>,
      ]}
    />

    <Callout type="note">
      Recruitment stages and the <strong>Active / Probation / Separated</strong>{' '}
      badge you see in Employees are computed from the same data — there's
      no editable status dropdown. Probation flips to Active automatically
      when the probation end date passes; you don't need to remember to
      change it.
    </Callout>
  </>
)

const HIRING_CANDIDATES: ReactNode = (
  <>
    <P>
      The Recruitment page is designed for the actual rhythm of running interviews:
      add a candidate in 10 seconds, deal with details later.
    </P>

    <HiringCandidatesDemo />

    <H3 id="add">Adding a candidate</H3>
    <P>
      Click <strong>Add candidate</strong> on the Recruitment page. All you need
      is a <strong>name</strong> — phone is optional (add it to send the link
      over WhatsApp in one tap). Hit <strong>Create &amp; get link</strong> and
      the candidate is saved as <strong>Prospective</strong> with their personal
      <strong> portal link</strong> ready to send.
    </P>
    <Bullets
      items={[
        <><strong>Send them the link.</strong> The modal shows it right away with <strong>Copy</strong> and <strong>WhatsApp</strong> buttons. The candidate opens it and fills their own screening profile — you don't type their details for them.</>,
        <><strong>Everything else is theirs to fill.</strong> Position, department, photo, and the rest are captured through the portal, or you can add them yourself from <strong>Open full profile</strong>.</>,
        <><strong>No response, no clutter.</strong> A prospect who never opens their link simply stays in Prospective — they've self-selected out, and nothing leaks into the rest of your app.</>,
      ]}
    />

    <H3 id="edit">Editing later</H3>
    <P>
      Click any card to open the detail drawer; <strong>Open full profile</strong>{' '}
      takes you to the complete record to edit fields, photo, or notes. Stage
      changes happen in the drawer — not from inside the profile.
    </P>

    <H3 id="shortlist">Shortlisting = the screening gate</H3>
    <P>
      Shortlisting isn't a button you hunt for — it's what happens when a
      candidate <strong>completes their screening profile</strong>. A Prospective
      candidate fills in the essentials a job board can't give you (national ID,
      date of birth, gender, religion, marital status, address), and the moment
      that's done they move to <strong>Shortlisted</strong> and land back in your
      court. That's your cue to decide whether they're a fit before you spend
      time interviewing.
    </P>
    <Callout type="tip">
      Need to shortlist someone without waiting — a strong referral, say? Open
      the drawer and move them by hand, or fill their screening fields yourself
      from <strong>Open full profile</strong>. The gate keeps your board honest;
      it never traps you.
    </Callout>

    <H3 id="reject">Talent pool vs delete</H3>
    <P>
      For candidates you're saying no to:
    </P>
    <Bullets
      items={[
        <><strong>Move to talent pool</strong> — soft no. Keeps the candidate (with their notes and photo) accessible from the Talent pool tab so you can re-engage later. From there, <strong>Reconsider</strong> brings them back to Prospective.</>,
        <><strong>Delete</strong> — hard no. Destructive, no undo. Use this only when the record genuinely shouldn't exist (typo, duplicate).</>,
      ]}
    />
  </>
)

const HIRING_OFFERS: ReactNode = (
  <>
    <P>
      Making an offer in Flodok does two things in one click: flips the
      candidate to <strong>Offered</strong> and creates a draft contract
      already linked to them. A <strong>job description</strong> has to be
      linked first — that's what the candidate signs alongside the contract, so
      no offer goes out without a defined role. If you've set up a contract
      template for their job position, the draft is auto-filled from it;
      otherwise it starts blank.
    </P>

    <HiringOffersDemo />

    <H3 id="flow">The flow</H3>
    <Steps
      items={[
        <>Open the candidate's <strong>detail drawer</strong> and click <strong>Make offer</strong>. If no job description is linked yet, Flodok asks you to pick one first. The Make offer modal then shows the candidate's job position and looks up the matching template.</>,
        <>The modal tells you what'll happen: <em>"Will use 'Kitchen Staff PKWTT'"</em> if a template is set, or <em>"No template for this position. We'll create a blank draft contract."</em> if not.</>,
        <>Click <strong>Make offer & create draft</strong>. The candidate flips to Offered, a draft contract is created, and the modal switches to a success view.</>,
        <>Click <strong>Edit contract now</strong> to fill in any candidate-specific details (start date, salary tweak, etc.) and Activate & sign when ready. Or click <strong>Done</strong> to come back to it later.</>,
      ]}
    />

    <H3 id="batch">Why this is the workflow</H3>
    <P>
      The two-step split — flip stage now, finish contract later — is
      deliberate. When you're running a series of interviews, you want to
      make fast yes/no calls and not get stuck in contract editing. The
      Offered tab becomes your "needs contract finalized" queue: work
      through it in a batch, share the portal link with each candidate
      once their contract is ready.
    </P>

    <Callout type="tip">
      Rolling back is easy. From an Offered candidate's drawer you can{' '}
      <strong>withdraw the offer</strong> (back to Shortlisted, preserving
      the prior decision) or <strong>move them to the talent pool</strong>. The
      draft contract stays attached — useful if the offer comes back on,
      awkward if you wanted it gone, so delete it manually from the Contracts
      page if needed.
    </Callout>

    <H3 id="templates-link">Setting up templates first</H3>
    <P>
      Auto-filled offers only work if you've defined a template for the
      job position. See{' '}
      <Link to="/help/docs/contract-templates">Contract templates</Link>{' '}
      for how to create one. The <strong>Manage templates →</strong> link
      inside the Make offer modal jumps straight to the Contracts page so
      you can set one up if you don't have one yet.
    </P>
  </>
)

const HIRING_SEPARATION: ReactNode = (
  <>
    <P>
      When an employee leaves, Flodok records why — voluntary
      (resignation) or involuntary (termination) — along with their last
      working day and an optional reason. The employee stays in the
      directory under the <strong>Separated</strong> tab; nothing is
      deleted.
    </P>

    <HiringSeparationDemo />

    <H3 id="record">Recording a separation</H3>
    <P>
      Open the employee's profile from <strong>Employees</strong>. On the
      sidebar, below the navigation, you'll see two action buttons:
    </P>
    <Bullets
      items={[
        <><strong>Mark as resigned</strong> — voluntary departure. Captures last working day + an optional reason ("better opportunity", etc.).</>,
        <><strong>Terminate employment</strong> — involuntary separation. Same fields, distinct record.</>,
      ]}
    />
    <P>
      Both flip the employee's lifecycle stage to <strong>Separated</strong>{' '}
      and stamp the resign date. The status badge changes immediately;
      there's no separate "deactivate" step. The buttons are hidden when
      they don't apply (already separated, or still in a hiring stage).
    </P>

    <H3 id="why">Why two buttons instead of a dropdown</H3>
    <P>
      Resignation and termination have different downstream meanings —
      legally, for severance calculations, and for reporting. Storing them
      as different <code>separation_type</code> values now means later
      payroll integrations can compute pesangon correctly without you
      re-entering anything.
    </P>

    <H3 id="separated-view">Where separated employees live</H3>
    <P>
      The Employees directory still shows separated employees — they appear
      in the <strong>Separated</strong> filter (and in <strong>All</strong>{' '}
      by default no, but you can multi-select). Their portal link still
      works in read-only mode so they can pull their final payslip and
      reference letter when those features ship.
    </P>

    <Callout type="warn">
      <strong>Delete</strong> on the sidebar is destructive and permanent —
      it removes the employee row and any contracts/SOPs orphan back to no
      employee. Reserve it for genuine mistakes (duplicate row, test data).
      For real exits, always use Resign or Terminate.
    </Callout>
  </>
)

// ─── Contracts ───────────────────────────────────────────

const CONTRACTS_CREATE: ReactNode = (
  <>
    <P>
      Flodok handles employment contracts end to end: draft, e-sign, store,
      and version. Two ways to create one.
    </P>

    <ContractsCreateDemo />

    <H3 id="from-candidate">From a candidate (recommended)</H3>
    <P>
      Most contracts get created automatically when you click{' '}
      <strong>Make offer</strong> on a Recruitment candidate — the contract is
      drafted from your{' '}
      <Link to="/help/docs/contract-templates">position template</Link>{' '}
      (if you have one) and linked to that candidate. See{' '}
      <Link to="/help/docs/hiring-offers">Making an offer</Link> for the
      full flow.
    </P>

    <H3 id="from-scratch">From scratch</H3>
    <P>
      From the Documents hub, click <strong>Create → Contract</strong>. Flodok opens
      a blank <strong>PKWT</strong> draft right away in the editor; set the contract
      type (<strong>PKWT</strong> fixed-term or <strong>PKWTT</strong> permanent),
      the employee, salary, and dates in the right-hand sidebar. The bilingual
      starter comes pre-filled with the standard Indonesian clauses for that type —
      edit it like any other contract.
    </P>
    <Bullets
      items={[
        <><strong>PKWT</strong> (Perjanjian Kerja Waktu Tertentu) — fixed-term, requires an end date, no probation period under <em>UU Cipta Kerja</em>.</>,
        <><strong>PKWTT</strong> (Perjanjian Kerja Waktu Tidak Tertentu) — permanent, may include up to 3 months probation.</>,
      ]}
    />

    <H3 id="ai-generate">AI Generate</H3>
    <P>
      The editor toolbar's <strong>AI Generate</strong> button drafts a
      bilingual contract from a short prompt — useful for non-standard
      arrangements (consultancy, internship, board appointment) that
      don't fit the PKWT/PKWTT starter. The result replaces the current
      draft, so use it before you've spent time editing.
    </P>

    <H3 id="merge-fields">Merge fields</H3>
    <P>
      Contracts (and templates) support merge tags that resolve against
      the linked employee, your organization, and the contract's own
      structured fields. Use the <strong>Field</strong> button in the
      editor toolbar to insert one as an inline pill — it renders the
      resolved value (e.g. "Rp 3,400,000") while editing and serialises
      back to its token (e.g. <code>{'{{base_wage_idr}}'}</code>) on
      save, so updates to the underlying data flow through automatically.
    </P>
    <Bullets
      items={[
        <>Employee context: <code>{'{{employee_name}}'}</code>, <code>{'{{employee_phone}}'}</code>, <code>{'{{employee_address}}'}</code>, <code>{'{{employee_ktp_nik}}'}</code>, <code>{'{{employee_date_of_birth}}'}</code>, <code>{'{{employee_departments}}'}</code></>,
        <>Organization: <code>{'{{org_name}}'}</code>, <code>{'{{org_address}}'}</code></>,
        <>Contract: <code>{'{{contract_start_date}}'}</code>, <code>{'{{contract_end_date}}'}</code>, <code>{'{{base_wage_idr}}'}</code>, <code>{'{{allowance_idr}}'}</code>, <code>{'{{hours_per_day}}'}</code>, <code>{'{{days_per_week}}'}</code></>,
        <>Signatures: <code>{'{{employee_signature}}'}</code>, <code>{'{{employee_sign_date}}'}</code>, <code>{'{{employer_name}}'}</code>, <code>{'{{employer_signature}}'}</code></>,
      ]}
    />

    <H3 id="activate">Activating &amp; sending to the employee</H3>
    <P>
      A contract is <strong>Draft</strong> until the employer signs it via{' '}
      <strong>Activate &amp; sign</strong> in the editor. That action records
      your signature, flips the contract to <strong>Active</strong>, and is
      what makes it visible to the linked employee in their portal.
    </P>
    <P>
      Flodok does <strong>not</strong> send sign-request emails. Once the
      contract is Active, share the employee's portal link with them
      (WhatsApp is what most teams use). They open the link, see the
      contract, and e-sign in the portal — see{' '}
      <Link to="/help/docs/contracts-sign">E-signatures</Link>.
    </P>

    <Callout type="tip">
      Save effort across hires by defining a{' '}
      <Link to="/help/docs/contract-templates">contract template</Link>{' '}
      per job position. A new offer for that position auto-fills 90%
      of the contract; you only set start date and any candidate-specific
      tweaks.
    </Callout>
  </>
)

const CONTRACT_TEMPLATES: ReactNode = (
  <>
    <P>
      Contract templates are reusable contract drafts tied to a job
      position. When you click <strong>Make offer</strong> on a candidate
      whose position matches a template, Flodok instantiates the template
      into a fresh draft contract linked to them — start date, name, and
      any candidate-specific bits are typically all that's left to fill in.
    </P>

    <ContractTemplatesDemo />
    <P>
      Templates live in the <strong>Template gallery</strong> (open it from the
      Documents hub, at <code>/dashboard/templates</code>) with a slim editor: the
      same bilingual document shape and merge tags as a contract, minus the
      versioning, signing, and employee-link plumbing — a template is a starter,
      not an issued document. The gallery holds templates for SOPs, JDs, and NDAs
      too, not just contracts.
    </P>

    <H3 id="create">Creating a template</H3>
    <Steps
      items={[
        <>Go to <strong>Contracts</strong> and click the <strong>Templates</strong> tab.</>,
        <>Click <strong>New template</strong>. Give it a recognisable title (e.g. "Kitchen Staff PKWTT") and pick the <strong>job position</strong> it auto-fills for. The position dropdown is sourced from <Link to="/dashboard/company?tab=structure">Company → Structure</Link>; the <strong>Manage →</strong> link gets you there if you need to add a position first.</>,
        <>Pick a <strong>starter</strong>: <strong>PKWT</strong> or <strong>PKWTT</strong> seeds the template with the standard Indonesian employment clauses (bilingual, ready to customise); <strong>Blank</strong> drops you into an empty doc.</>,
        <>Click <strong>Add</strong> — you land in the template editor with a "Template" badge in place of the usual status pill.</>,
        <>Tailor the content. Use merge tags (<code>{'{{employee_name}}'}</code>, <code>{'{{contract_start_date}}'}</code>, <code>{'{{base_wage_idr}}'}</code>, etc.) for everything that varies per candidate. Set default wage/hours/days so offers pre-fill those columns too.</>,
        <>Save. The template is ready to be picked up the next time you make an offer to a candidate with that position.</>,
      ]}
    />

    <H3 id="lookup">How the lookup works</H3>
    <P>
      Templates match by exact <strong>job position</strong> on the
      candidate. If a candidate has no position set, no template is
      matched and the offer creates a blank draft. If multiple templates
      exist for the same position, the most recently updated one wins —
      so cleaning up old templates as you iterate is worth the few seconds.
    </P>

    <H3 id="any-position">"Any position" templates</H3>
    <P>
      Leaving the position blank on a template marks it as a general
      template (no auto-match). It still appears in the Templates tab and
      you can create a contract from it via the picker on{' '}
      <strong>Create Contract → From a template</strong>, but{' '}
      <strong>Make offer</strong> won't auto-pick it.
    </P>

    <Callout type="note">
      Templates aren't versioned or signed — there's no history tab and
      no Activate &amp; sign button. The latest saved content is always
      what the next offer instantiates from.
    </Callout>
  </>
)

const CONTRACTS_SIGN: ReactNode = (
  <>
    <P>
      Flodok's e-signatures are recognised under <em>UU 11/2008 (ITE)</em>{' '}
      as amended by <em>UU 19/2016</em>, and Flodok stores Customer Data
      under PP 71/2019. Each signature carries a structured audit trail
      sufficient for non-disputed cases.
    </P>

    <ContractsSignDemo />

    <H3 id="how">How signing works</H3>
    <Steps
      items={[
        <>The employer signs the contract in the dashboard via <strong>Activate &amp; sign</strong>. The contract flips from Draft to Active.</>,
        <>You share the employee's portal link with them (WhatsApp is most common). New hires walk through a guided onboarding that includes contract review &amp; sign — see <Link to="/help/docs/portal-candidate-onboarding">Candidate onboarding</Link>. Existing employees see the contract in their portal and can sign there.</>,
        <>The employee types their name, picks a signature font, and ticks a consent checkbox before signing.</>,
        <>Both signatures render inline in the rendered contract via merge fields.</>,
      ]}
    />

    <H3 id="audit">What the audit trail captures</H3>
    <P>
      Every signature row records, at the moment of signing:
    </P>
    <Bullets
      items={[
        <><strong>Typed name + signature font</strong> — what the signer entered.</>,
        <><strong>Signer role</strong> — employer or employee.</>,
        <><strong>Document hash</strong> — SHA-256 of the contract content (versioned), so any tampering after-the-fact is detectable by re-hashing.</>,
        <><strong>Consent text</strong> — the exact wording the signer agreed to, snapshotted. If you change the wording later, the historical signature still records what <em>they</em> agreed to.</>,
        <><strong>User agent</strong> — the signer's browser and OS string.</>,
        <><strong>IP address</strong> — captured server-side via Cloudflare's <code>CF-Connecting-IP</code> header (best-effort; one-shot, can't be re-stamped).</>,
        <><strong>Signer email + phone</strong> — the verified contact channels on the signer's record at sign time.</>,
        <><strong>Version number</strong> — pinned to the contract version they actually saw, so amendments don't retroactively claim signatures.</>,
      ]}
    />

    <Callout type="note">
      For documents that need stronger evidentiary weight (notarised
      agreements, registered legal filings) you'll still want a certified
      provider like Privy or VIDA, or wet-ink signing. Flodok's e-signature
      is built for the everyday employment-contract case.
    </Callout>
  </>
)

const CONTRACTS_HISTORY: ReactNode = (
  <>
    <P>
      Like SOPs, contracts are versioned automatically. Every meaningful
      save creates a new snapshot with the structured fields (wage,
      hours, dates) frozen alongside the bilingual document content.
    </P>

    <ContractsHistoryDemo />

    <H3 id="view">Viewing history</H3>
    <P>
      <strong>Contracts → [contract] → History</strong> lists every revision
      with author, timestamp, and a one-line summary. Click any version to
      preview it; click <strong>Compare</strong> to diff against another.
    </P>

    <H3 id="signatures-pin">Signatures are version-pinned</H3>
    <P>
      Each <code>contract_signatures</code> row is tied to the version
      number that was current when the signature happened. When you edit
      an active contract and save (which bumps the version), prior
      signatures remain attached to the version they were given against —
      they don't auto-apply to the new version, and the history viewer
      shows you exactly who signed what version.
    </P>

    <Callout type="warn">
      There is no formal "amendment" workflow yet. Editing a signed
      contract creates a new version but does not invalidate prior
      signatures or auto-trigger a re-sign — that's on you to manage.
      For material changes that warrant a fresh signature, the cleanest
      path today is to create a new contract referencing the original
      and have it signed.
    </Callout>
  </>
)

// ─── Performance ─────────────────────────────────────────

const RECOGNITION: ReactNode = (
  <>
    <P>
      The <strong>Performance</strong> page is your monthly recognition and rewards
      cockpit. Pick a month and you get a roster of your team, with three levers of
      recognition against each person: a <strong>pay adjustment</strong> (reward or
      penalise), <strong>badges</strong>, and <strong>XP</strong>.
    </P>

    <RecognitionDemo />

    <H3 id="rewards">Rewarding and penalising</H3>
    <P>
      <strong>Reward</strong> adds to an employee's pay for the month (<code>+Rp</code>);{' '}
      <strong>Penalise</strong> takes some away (<code>−Rp</code>). Both carry a{' '}
      <strong>reason the employee can see</strong>, and you can link the adjustment to a{' '}
      <Link to="/help/docs/tasks">task</Link> so the "why" is on record. The amount flows
      straight into that month's{' '}
      <Link to="/help/docs/payroll-overview">payroll</Link>.
    </P>
    <Bullets
      items={[
        <>Adjustments apply to the <strong>live current month</strong> only — past months are read-only.</>,
        <>Enable the feature and set a <strong>Max per adjustment</strong> cap (the largest single reward or penalty, or blank for none) in <Link to="/dashboard/settings?tab=payroll">Settings → Payroll</Link>.</>,
      ]}
    />

    <H3 id="badges">Badges</H3>
    <P>
      <strong>Award a badge</strong> to anyone in the roster. Badges are free,
      unlimited, and show on the employee's portal and profile. Define your own badge
      types — alongside the automatic ones for tenure and pay milestones — in{' '}
      <Link to="/dashboard/settings?tab=achievements">Settings → Badges</Link>; see{' '}
      <Link to="/help/docs/settings-achievements">Badges &amp; achievements</Link> for setup.
    </P>

    <H3 id="xp">XP and the leaderboard</H3>
    <P>
      Recognition builds each employee's <strong>XP</strong>, and — if the leaderboard is
      enabled — turns their rewards and penalties into a <strong>private</strong> ranking
      they see in their own portal: a quiet nudge toward the behaviour you want.
    </P>

    <Callout type="note">
      Each lever is optional. Turn pay adjustments off and Performance is a pure
      badges-and-XP board; turn badges off and it's pure pay adjustments. Both toggles
      live in Settings.
    </Callout>
  </>
)

// ─── Employee Portal ────────────────────────────────────

const PORTAL_ABOUT: ReactNode = (
  <>
    <P>
      The employee portal is each employee's private home in Flodok — their
      contract, payslips, SOPs, badges, and announcements. Each employee
      has their own URL of the form{' '}
      <code>flodok.com/portal/&lt;name-slug&gt;-&lt;token&gt;</code>, generated
      when they're added. The URL works without a login; it acts as the
      access credential.
    </P>

    <PortalAboutDemo />

    <H3 id="who-it-is-for">Who it's for</H3>
    <P>
      Every employee — including frontline staff (warehouse, retail, kitchen,
      drivers) who would never need a full Flodok account, and new candidates
      whose first interaction with the company is reviewing and signing
      their contract.
    </P>

    <H3 id="what-they-see">What they see</H3>
    <Bullets
      items={[
        'SOPs assigned to them or their department, with read-and-understood signing',
        'Their contracts (active and past versions)',
        'Their badges, credits, achievements, and any awards received',
        'Announcements (Spotlight posts) targeted at them or their department',
      ]}
    />

    <H3 id="what-they-dont">What they cannot see</H3>
    <Bullets
      items={[
        "Other employees' profiles, contracts, or compensation",
        'Internal-only documents not assigned to them',
        'Anything in Settings, Integrations, or Billing',
      ]}
    />

    <H3 id="onboarding-mode">Onboarding mode for new hires</H3>
    <P>
      When a candidate's <code>lifecycle_stage</code> is{' '}
      <strong>offered</strong> or <strong>signed</strong> (and they
      haven't reached their start date), the portal renders a guided
      onboarding flow instead of the regular dashboard — see{' '}
      <Link to="/help/docs/portal-candidate-onboarding">Candidate onboarding</Link>.
      It auto-steps aside the moment their start date arrives.
    </P>
  </>
)

const PORTAL_CANDIDATE_ONBOARDING: ReactNode = (
  <>
    <P>
      The portal onboarding flow comes in <strong>two waves</strong>, and which
      one a candidate sees depends on where they are in hiring. Before an offer
      they fill a short <strong>screening profile</strong> only; after they sign,
      they come back for the sensitive employment details. Asking for a bank
      account or an ID photo gets much easier once there's a signed contract — so
      Flodok waits until then instead of asking up front.
    </P>

    <PortalOnboardingDemo />

    <H3 id="when">Two waves, by stage</H3>
    <Bullets
      items={[
        <><strong>Prospective (pre-offer)</strong> — a short <strong>screening profile</strong> only: national ID number, date of birth, gender, religion, marital status, address. No bank details, no document uploads, no signing. Finishing it moves them to Shortlisted automatically.</>,
        <><strong>Offered → Signed</strong> — they review and e-sign the job description and contract, then continue straight into the employment details: tax &amp; banking, emergency contact, and document uploads.</>,
      ]}
    />

    <H3 id="steps">What each wave collects</H3>
    <Bullets
      items={[
        <><strong>Screening (pre-offer)</strong> — one "A bit about you" step: national ID (KTP/NIK), date of birth, place of birth, gender, religion, marital status, and address. This is what you screen on, so it's required to advance.</>,
        <><strong>Sign (post-offer)</strong> — the job description, then the contract: merge tags resolved, scroll-to-bottom required, type name, pick a signature font (4 options), tick consent, sign. Signing flips them from Offered to Signed.</>,
        <><strong>Tax &amp; banking</strong> — NPWP, bank name, account number, account holder.</>,
        <><strong>Emergency contact</strong> — one contact: name, relationship, phone. Editable later via <strong>Employees → [employee] → Personal</strong>.</>,
        <><strong>Documents</strong> — KTP photo + Surat KK photo, each saved on upload.</>,
      ]}
    />

    <H3 id="resume">Never asked twice</H3>
    <P>
      Everything a candidate already gave you is pre-filled and skipped. Someone
      who completed their screening profile before the offer isn't asked for
      those fields again after signing — the flow jumps straight to the details
      it still needs. Close the tab and come back and it resumes from the same
      portal link, right where it left off.
    </P>

    <H3 id="missing-contract">If the contract isn't ready yet</H3>
    <P>
      If the candidate opens their portal between getting the link and HR
      finishing the contract, the contract step shows{' '}
      <em>"Your contract is being prepared, please check back shortly"</em>{' '}
      instead of erroring. Avoid sharing the portal link before the
      contract is Active for the smoothest experience — finish the
      contract first, share the link second.
    </P>

    <Callout type="note">
      The signature captured here carries the same audit trail as the
      employer-side signature: document hash, consent text, user agent,
      IP, signer email/phone. See{' '}
      <Link to="/help/docs/contracts-sign">E-signatures</Link> for
      details.
    </Callout>
  </>
)

const PORTAL_SHARE: ReactNode = (
  <>
    <P>
      The portal is a single URL that anyone in your organization can use to
      access their content — no login required.
    </P>

    <PortalShareDemo />

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

    <PortalCustomizeDemo />

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

    <FirefliesDemo />

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

// ─── Settings ───────────────────────────────────────────

const SETTINGS_ORG: ReactNode = (
  <>
    <P>
      Your organization's top-level details — brand identity, time zones, and
      contact details — live on the <strong>Company</strong> page (Profile tab),
      reached from the sidebar. There is no separate "Organization" tab under
      Settings.
    </P>

    <SettingsOrgDemo />

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

    <SettingsTimezonesDemo />

    <H3 id="org-default">Organization default</H3>
    <P>
      <strong>Company → Profile → Time zone</strong>. The default applies
      to anyone who hasn't set their own. Most companies pick the time zone of
      their HQ.
    </P>

    <H3 id="branches">Across branches</H3>
    <P>
      Everyone sees times in the organization default. If you span WIB, WITA, and
      WIT, pick the zone of your main HQ and keep it consistent so schedules and
      payroll periods line up across branches.
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

    <SettingsLanguageDemo />

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
      SOPs and contracts are bilingual by design: every block has an EN
      and an ID side, side-by-side in the editor. Write either side and
      Flodok translates the missing one on save (powered by an LLM —
      results are cached per-org so repeated text doesn't re-translate).
      The editor's BubbleMenu also has a per-selection{' '}
      <strong>Translate</strong> action, and the toolbar's{' '}
      <strong>AI Generate</strong> drafts a fully bilingual doc from a
      prompt. Announcements remain single-language — write them in
      whichever language fits your audience.
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

    <BillingManageDemo />

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

    <BillingPaymentDemo />

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

    <BillingInvoicesDemo />

    <H3 id="standard">Standard invoices</H3>
    <P>
      Invoices land in your billing email and appear in <strong>Settings →
      Billing → Invoices</strong>. PDF includes your legal name, address, and
      tax ID (NPWP) if you've added one.
    </P>

    <H3 id="faktur">Faktur Pajak</H3>
    <P>
      Add your NPWP on the <strong>Company</strong> page (Profile tab) so it is on
      record for tax. If you need a formal Faktur Pajak against a paid invoice,
      contact support with your billing details.
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

const FORMS_OVERVIEW: ReactNode = (
<>
    <P>
      Forms are structured HR requests your employees submit from their
      portal — not free-form documents or emails. They're the intake layer
      that feeds your payroll and leave records, with a full audit trail
      behind every entry. Today there are two types:{' '}
      <strong>Leave Request (Cuti)</strong> and{' '}
      <strong>Overtime Request (Lembur)</strong>.
    </P>

    <LeaveJourneyDemo />

    <H3 id="why-it-matters">Why it matters</H3>
    <P>
      Forms replace the old Word-doc-emailed-to-HR routine. Instead of a
      document someone has to read, retype, and file, every request is a
      structured record that routes itself to the right approver and, once
      approved, flows straight into payroll and leave balances. Nothing gets
      lost in a chat thread, and you can always see who asked for what, who
      approved it, and when.
    </P>

    <H3 id="who-does-what">Who does what</H3>
    <Bullets
      items={[
        <><strong>Employees</strong> submit requests from the{' '}<strong>Requests</strong> tab of their portal. The portal is a shared link with no login — they just open it and fill in the form.</>,
        <><strong>The approver</strong> — a designated reviewer (typically a manager or HR) — approves or rejects each request from <strong>Dashboard → Forms</strong>.</>,
        <><strong>The owner</strong> can optionally give a final sign-off after the approver, if your organization turns on the owner-approval gate (see below).</>,
        <><strong>HR and Admins</strong> can also file a request on an employee's behalf, and they configure which form types and fields are available.</>,
      ]}
    />

    <H3 id="lifecycle">The lifecycle at a glance</H3>
    <P>
      A request moves through a fixed path:{' '}
      <strong>Submitted → approver approves → (optional) owner approves → Approved</strong>.
      The moment a request reaches <strong>Approved</strong>, it
      automatically flows into payroll and leave balances — no re-keying.
    </P>
    <Callout type="warn">
      Rejections are final. A rejected request can't be reopened or
      un-rejected — the employee submits a fresh request instead. This keeps
      the audit trail honest.
    </Callout>

    <H3 id="owner-approval">The optional owner-approval gate</H3>
    <P>
      Each organization can require a second, final sign-off from the{' '}
      <strong>owner</strong> after the approver has approved. It's an
      anti-collusion safeguard — a popular choice for Indonesian owners who
      want the last word on leave and overtime — turned on per organization
      in <strong>Settings → Approvals</strong>. With it off, an approver's
      decision is the final step.
    </P>

    <H3 id="identity-automatic">Identity is filled in automatically</H3>
    <P>
      The employee's name, ID or code, department, position, and work status
      are pulled straight from their Flodok record — never typed into a
      free-text box. Because attribution comes from the record rather than
      from what someone types, every request is tamper-resistant and reliably
      tied to a real person.
    </P>
    <Callout type="note">
      This is also why a request on someone's behalf still carries the right
      identity: HR picks the employee, and Flodok resolves their details from
      the record automatically.
    </Callout>

    <H3 id="where-to-find-it">Where to find it</H3>
    <Bullets
      items={[
        <><strong>Employees</strong> — the <strong>Requests</strong> tab of their employee portal.</>,
        <><strong>Approvers, owners, HR, and Admins</strong> — <strong>Dashboard → Forms</strong>, where requests are listed, reviewed, and filed on behalf of others.</>,
      ]}
    />

    <H3 id="next">Where to go next</H3>
    <Bullets
      items={[
        <><Link to="/help/docs/submitting-requests">Submitting requests</Link> — how an employee files Cuti or Lembur from the portal.</>,
        <><Link to="/help/docs/approving-requests">Approving requests</Link> — reviewing, approving, rejecting, and the owner sign-off.</>,
        <><Link to="/help/docs/configuring-forms">Configuring forms</Link> — fields, the approval gate, filing on behalf, and the portal landing.</>,
        <><Link to="/help/docs/forms-payroll-leave">Forms, payroll &amp; leave</Link> — what happens to balances and pay once a request is approved.</>,
        <><Link to="/help/docs/portal-about">About the portal</Link> — where employees find the Requests tab.</>,
      ]}
    />
  </>
)

const FORMS_SUBMITTING: ReactNode = (
<>
<P>
  This page shows you how to submit a leave or overtime request from the employee portal,
  what each part of the form does, and how to read the status afterwards. You file everything
  from the portal <strong>Requests</strong> tab.
</P>

<LeaveRequestDemo />

<H3 id="leave-request">Submitting a leave request (Cuti)</H3>
<P>
  A leave request books time away from work — for annual leave, sickness, a national holiday,
  and more. Your organization decides which leave types you can pick.
</P>
<Steps items={[
  <>On the <strong>Requests</strong> tab, tap <strong>New request</strong> and choose <strong>Leave Request</strong>.</>,
  <>Pick a <strong>Leave type</strong>. The options your organization has turned on appear here — for example Annual, Unpaid, National holiday, Sick (with or without a note), Short time, or Special.</>,
  <>Set your dates. Most types use a <strong>From</strong> and <strong>To</strong> date, and the total number of days is calculated for you. If you chose <strong>Short time</strong>, you instead pick a single date plus a start and end time.</>,
  <>Optionally add a <strong>reason</strong>, and name up to two replacement colleagues who will cover for you while you're away.</>,
  <>Submit. The request appears in your list with a status.</>,
]} />
<Callout type="note">
  Your organization may make the <strong>reason</strong> field required for some leave types. If so,
  you won't be able to submit until it's filled in.
</Callout>

<H3 id="overtime-request">Submitting an overtime request (Lembur)</H3>
<P>
  An overtime request records extra hours you've worked. You can log several days in one request.
</P>
<Steps items={[
  <>Tap <strong>New request</strong> and choose <strong>Overtime Request</strong>.</>,
  <>Pick your <strong>work status</strong> — Permanent, Contract, Daily, or Piecework. Your organization chooses which of these appear.</>,
  <>Add a <strong>row</strong> for each day of overtime, entering a date, a start time and an end time. The hours and totals are computed for you.</>,
  <>Tick <strong>rest day / holiday</strong> on any row where the overtime fell on a day off — it's paid at a higher rate. You can also add an optional reason per row.</>,
  <>Use <strong>Add row</strong> to log more days, then submit.</>,
]} />

<H3 id="leave-balance">Your leave balance</H3>
<P>
  The <strong>Requests</strong> tab shows your annual-leave balance as remaining out of your full
  entitlement. In Indonesia, annual leave accrues with your length of service, so the number grows
  as you stay.
</P>
<Callout type="note">
  If your organization requires it, annual leave only becomes usable after 12 months of service.
  Until then your balance shows as locked. See{' '}
  <Link to="/help/docs/forms-payroll-leave">how leave accrues</Link>{' '}
  for the full rules.
</Callout>

<H3 id="reading-statuses">Reading your request status</H3>
<P>
  Each request in your list carries a status so you always know where it stands:
</P>
<Bullets items={[
  <><strong>Submitted</strong> — waiting for the approver to review it.</>,
  <><strong>Manager approved</strong> — the manager said yes and it's waiting for owner sign-off, if your organization uses a second step.</>,
  <><strong>Approved</strong> — done. It flows through to payroll and your leave balance.</>,
  <><strong>Rejected</strong> — declined by the manager or owner. This is final.</>,
]} />
<Callout type="warn">
  You can't edit a request after submitting it — if something's wrong, just submit a new one.
  Your identity details are filled in automatically, so there's nothing to enter there.
</Callout>

<H3 id="hr-on-behalf">HR filing on behalf of an employee</H3>
<P>
  Admins and HR can submit a request for someone else from <strong>Dashboard → Forms → New request form</strong>.
  Pick the employee first, then fill in the form — the steps are identical to the ones above.
</P>

<H3 id="related">Related</H3>
<Bullets items={[
  <><Link to="/help/docs/approving-requests">Approving requests</Link></>,
  <><Link to="/help/docs/forms-payroll-leave">How requests reach payroll and leave</Link></>,
]} />
</>
)

const FORMS_APPROVING: ReactNode = (
<>
    <P>
      When an employee submits a leave or overtime request, it lands with the people responsible for signing it off. This page explains the approval chain, where you act on requests, and the safeguards that keep one person from pushing a request through on their own.
    </P>

    <ApprovingDemo />

    <H3 id="the-chain">The two-tier chain</H3>
    <P>
      Every request runs through up to two steps. First comes the{' '}
      <strong>Manager step</strong>, handled by your org's designated approver — set in{' '}
      <strong>Settings → Approvals</strong>, and defaulting to the owner if none is chosen. Then, if your org has turned on{' '}
      <strong>owner approval</strong>, the request moves to the <strong>Owner step</strong> for a final sign-off. If owner approval is off, the approver's decision on the Manager step is final.
    </P>

    <H3 id="where-to-approve">Where to approve</H3>
    <P>
      Open <strong>Dashboard → Forms</strong>, click the request to open it, then choose{' '}
      <strong>Approve</strong> or <strong>Reject</strong>. You can add an optional note with your decision. Any pending request assigned to you also shows up in your <strong>Inbox</strong>, so you don't have to go hunting.
    </P>
    <P>
      The request page shows the full workflow timeline — submitted, then the Manager step, then the Owner step — with who decided and when, so the history is always clear.
    </P>

    <H3 id="who-can-do-what">Who can do what</H3>
    <Bullets
      items={[
        <>The <strong>Manager step</strong> is decided by the designated approver (or an admin acting in their place).</>,
        <>The <strong>Owner step</strong> is decided by the owner alone — the anti-collusion final sign-off.</>,
        <>No one can approve their own request. Even if you'd normally decide a step, Flodok won't let you sign off something you submitted — it routes around you so the decision stays with someone else.</>,
      ]}
    />

    <Callout type="note">
      For small teams, the steps collapse automatically so nobody taps twice for no reason. If the approver <em>is</em> the owner, the two steps become one. And if the person submitting is also the approver, their own step is auto-stamped and the request moves on — but it never lets someone fully self-approve when an owner gate applies.
    </Callout>

    <H3 id="the-owner-gate">The owner gate</H3>
    <P>
      Turning on owner approval in <strong>Settings → Approvals</strong> means money and leave are only committed after the owner's final approval. That's the anti-collusion safeguard: HR and staff can't push a payout or a leave balance through on their own — the owner is always the last signature before anything posts.
    </P>
    <Callout type="warn">
      Changing the owner-approval setting only affects <em>new</em> requests. Anything already in flight keeps the rule it was submitted under, so flipping the toggle won't reroute or unblock requests that are mid-approval.
    </Callout>

    <H3 id="rejections">Rejections</H3>
    <P>
      A rejection is final. The employee sees the rejected status on their request, and there's no way to reopen it. To proceed, they submit a new request — which starts the chain fresh.
    </P>

    <H3 id="related">Related</H3>
    <Bullets
      items={[
        <Link to="/help/docs/configuring-forms">Configure approvals and form fields</Link>,
        <Link to="/help/docs/forms-payroll-leave">How approved requests post to payroll and leave</Link>,
      ]}
    />
  </>
)

const FORMS_PAYROLL_LEAVE: ReactNode = (
<>
<P>When you approve a Leave or Overtime request, Flodok records the financial side for you automatically — no re-keying into payroll or leave spreadsheets. This page explains exactly what gets posted, how Indonesian rules are applied, and what happens when a pay period is already closed.</P>

<PayrollDemo />

<H3 id="what-gets-recorded">What gets recorded on approval</H3>
<P>What Flodok posts depends on the request type. Once a request is <strong>Approved</strong>, it’s recorded against the right employee and period without any further action from you.</P>
<Bullets items={[
  <><strong>Overtime</strong> → a pay adjustment, calculated under Indonesian <strong>PP35/2021</strong>. The hourly rate is the employee’s monthly base wage ÷ 173 (base wage only — allowances are excluded). Multipliers stack by the hour: on a normal working day the 1st hour is 1.5× and later hours 2×; on a rest day or public holiday the rate starts at 2× and rises to 3× and 4× for the longest days. The exact steps depend on whether the employee is on a 5- or 6-day week. Marking a row as rest day or holiday on the request is what triggers the higher rates.</>,
  <><strong>Unpaid leave</strong> → a deduction from pay at the employee’s daily rate, for the days taken.</>,
  <><strong>Annual leave</strong> → decremented from the employee’s leave balance.</>,
  <><strong>Sick, national holiday, special leave</strong> → recorded for the audit trail with no pay effect.</>,
]} />

<H3 id="leave-accrual">How annual leave accrues</H3>
<P>Annual leave isn’t granted all at once — it builds up with service, following Indonesian practice.</P>
<Bullets items={[
  <>Leave accrues with service: roughly one-twelfth of the yearly entitlement per completed month, reaching the full entitlement at 12 months.</>,
  <>A configurable <strong>12-month service gate</strong> (on by default) means that until an employee completes 12 months, the balance is shown but locked — they accrue days but can’t use them yet. Admins control this on the leave form’s config page (see{' '}<Link to="/help/docs/configuring-forms">Configuring forms</Link>).</>,
]} />
<Callout type="note">Balances reset each leave year — unused annual leave does <strong>not</strong> carry over, in line with the Manpower Law. Plan time off within the year it’s earned.</Callout>

<H3 id="reference-numbers">Reference numbers</H3>
<P>Every approved request is assigned a reference number, numbered per type per year:</P>
<Bullets items={[
  <>Leave → <code>CUTI/2026/001</code></>,
  <>Overtime → <code>LEMBUR/2026/001</code></>,
]} />
<P>The reference appears on the request and on its PDF, so you can cite it in payroll records or correspondence.</P>

<H3 id="frozen-periods">Frozen periods and reposting</H3>
<Callout type="warn">If the pay period a request belongs to is already closed or settled, Flodok will <em>not</em> post into it. The request still shows <strong>Approved</strong>, but its payroll line is skipped and flagged with the reason in the request’s Payroll section.</Callout>
<P>To get a skipped request posted once the period is reopened:</P>
<Steps items={[
  <>Reopen the affected pay period for that employee.</>,
  <>Open the request and go to its <strong>Payroll</strong> section, where the skip reason is shown.</>,
  <>Press <strong>Repost</strong>. Flodok re-attempts the posting; if the period is still frozen, it simply skips again with the same flag.</>,
]} />
<Callout type="note">For an overtime request that spans two pay periods, posting is all-or-nothing: if <em>either</em> period is frozen, the whole request is held rather than half-posted. Reopen both periods before reposting.</Callout>

<H3 id="pdf">Downloading the PDF</H3>
<P>Every request can be saved as a PDF using the <strong>Download PDF</strong> button on the request page. The PDF carries the filled details, the reference number, and the approval signatures — handy for your records or for wet-signature filing.</P>

<H3 id="related">Related</H3>
<Bullets items={[
  <><Link to="/help/docs/approving-requests">Approving requests</Link></>,
  <><Link to="/help/docs/configuring-forms">Configuring forms</Link></>,
]} />
</>
)

const FORMS_CONFIG: ReactNode = (
<>
<P>
This page is for admins setting up Forms for your organization. You'll decide what each form offers, choose who approves requests, and learn how to file a request on an employee's behalf.
</P>

<ConfigDemo />

<H3 id="choosing-what-each-form-offers">Choosing what each form offers</H3>
<P>
From <strong>Dashboard → Forms</strong>, click a form-type tile (Leave Request or Overtime Request) to open its configuration page. What you can tune depends on the form:
</P>
<Bullets items={[
  <><strong>Leave Request</strong> — turn individual <strong>leave types</strong> on or off (at least one must stay on), make a <strong>reason required</strong>, and toggle the <strong>12-month service gate</strong> that governs annual leave eligibility.</>,
  <><strong>Overtime Request</strong> — turn individual <strong>work statuses</strong> on or off: Permanent, Contract, Daily, and Piecework.</>,
]} />
<Callout type="note">
  You can only narrow or require — you can't add new fields or change the calculations. The forms ship with correct Indonesian defaults, so the safest setup is to leave most things as they are and only switch off what your organization doesn't use.
</Callout>

<H3 id="setting-up-approvals">Setting up approvals</H3>
<P>
Go to <strong>Settings → Approvals</strong> to decide who signs off on requests:
</P>
<Bullets items={[
  <>Choose the <strong>approver</strong> — the team member who approves requests at the Manager step. Leave it on the default and the organization owner approves.</>,
  <>Turn <strong>Require owner approval</strong> on or off. This is the anti-collusion gate that adds a final owner sign-off before anything commits to payroll or leave. See{' '}
  <Link to="/help/docs/approving-requests">Approving Requests</Link>{' '}for exactly how the gate behaves.</>,
]} />
<Callout type="warn">
  Changing these settings only affects new requests — anything already in flight keeps the approval path it had when it was submitted.
</Callout>

<H3 id="filing-on-behalf">Filing on behalf of an employee</H3>
<P>
Admins and HR can submit a request for someone else via <strong>Dashboard → Forms → New request form</strong>. Pick the employee, then fill in the same form the employee would. This is handy for staff who don't use the portal.
</P>

<H3 id="enabling-and-permissions">Enabling Forms and who can do what</H3>
<P>
Forms can be enabled or disabled for the whole organization. Who can see and do each of the things above follows your roles — see{' '}
<Link to="/help/docs/roles">Understanding Roles</Link>{' '}for the details.
</P>

<H3 id="related">Related</H3>
<Bullets items={[
  <><Link to="/help/docs/forms-overview">Forms Overview</Link></>,
  <><Link to="/help/docs/approving-requests">Approving Requests</Link></>,
]} />
</>
)

// ─── New gap-fill doc bodies (generated) ───

const DOCUMENTS_OVERVIEW: ReactNode = (
<><P>Your Documents hub is the central place to create, organize, and track every document your team relies on. You’ll find all five document types in one unified list — SOPs, contracts, NDAs, job descriptions, and letters — with quick-create buttons, search, and filters to find what you need.</P><H3 id="create-new-doc">Creating a new document</H3><P>Click <strong>Create</strong> in the top right, then pick a document type:</P><Bullets items={[<><strong>SOP</strong> — Start a blank SOP and fill in the title, assignee, and content in the editor.</>, <><strong>Contract</strong> — Create a contract with sensible defaults (PKWT template, 12 days annual leave). Customize contract type, probation, and wages in the editor.</>, <><strong>NDA</strong> — Draft a one-way employee NDA with an effective date and survival period.</>, <><strong>Job Description</strong> — Routes to <strong>Hiring → Job Descriptions</strong> to keep all recruiting work in one place.</>, <><strong>Letter</strong> — Issue offer letters, reference letters, or announcements. Specify a recipient and sender before issuing.</>]} /><H3 id="import-existing">Importing an existing document</H3><P>Click <strong>Import existing</strong> to upload a PDF (contract, NDA, or SOP you already have). Flodok reads the file with AI, pre-fills a draft, and you review and edit it in the editor.</P><H3 id="view-recent-docs">Viewing recent documents</H3><P>Below the create band, you’ll see all your documents sorted by most recently updated. Toggle between <strong>grid</strong> (card view) and <strong>list</strong> (table view) using the toggle in the top left. Each card shows the document status (Draft, Issued, Active, or Archived), a preview of the content, version number, and update date.</P><H3 id="filter-search">Filtering and searching</H3><P>Use the filter button to narrow by:</P><Bullets items={[<><strong>Type</strong> — SOP, Contract, NDA, Letter, or Job Description (multi-select).</>, <><strong>Date range</strong> — Show documents updated between two dates.</>, <><strong>Employee</strong> — Filter to documents assigned to one person (shows in the dropdown if you have employees).</>, <><strong>Search</strong> — Type a document title to find it instantly.</>]} /><H3 id="document-actions">Working with a document</H3><P>Click any document to open it in its editor. On grid cards, click the three-dot menu to rename, duplicate, or delete a document. You can also access the document’s version history from the editor’s menu.</P><Callout type="tip">Documents belong to your organization, not to individual people. Contractors or onboarding teams can view any document you share with them, depending on their role.</Callout></>
)

const NDA_OVERVIEW: ReactNode = (
<><P>Non-disclosure agreements protect your confidential information when employees join or leave. Flodok’s NDA module handles bilingual templates, versioning, and employer signature capture.</P><H3 id="nda-creation">Creating an NDA</H3><P>From <strong>Dashboard → Documents</strong>, click <strong>Create</strong> and choose <strong>NDA</strong>. A blank NDA draft opens in the editor with a bilingual template. The initial survival period defaults to 2 years; adjust as needed.</P><H3 id="nda-required-fields">Required fields before activation</H3><P>Before you can activate and sign an NDA, you must fill in:</P><Bullets items={[<><strong>Title</strong> — e.g., "Confidentiality Agreement 2026"</>, <><strong>Employee (Receiving Party)</strong> — Who is signing the NDA. Pick from your employee list.</>, <><strong>Effective date</strong> — The date the NDA takes effect (usually the start date).</>]} /><P>The <strong>Activate & Sign</strong> button stays disabled and reads <em>"N fields needed"</em> until all three are filled (a red count also appears on the Details sidebar header when that sidebar is collapsed).</P><H3 id="nda-settings">Configuring the NDA</H3><P>In the right sidebar, set:</P><Bullets items={[<><strong>Survival period</strong> — How long confidentiality obligations last after employment ends (1, 2, 3, or 5 years).</>, <><strong>Penalty / liquidated damages</strong> — The IDR amount owed for breach (optional, for legal reference).</>, <><strong>Document number</strong> — Unique ID (e.g., "NDA/2026/001").</>, <><strong>Tags</strong> — Organize NDAs by category, department, or legal status.</>]} /><H3 id="nda-bilingual">Bilingual editing</H3><P>The editor shows Indonesian and English side-by-side (or stacked, depending on your view preference). Edit each language independently. Merge fields like <code>{'{{employee_name}}'}</code> and <code>{'{{nda_effective_date}}'}</code> resolve automatically when you export or sign.</P><H3 id="nda-activate-sign">Activating and signing</H3><P>Once all required fields are complete, click <strong>Activate & Sign</strong>. A signing panel appears where you type your name (as the employer representative), pick a signature font, and confirm. The NDA becomes <strong>Active</strong>, a signature row is recorded with a timestamp and IP address for legal verification, and a version snapshot is saved.</P><H3 id="nda-versioning">Version history</H3><P>Every time you save an NDA with content changes, a snapshot is created. Click <strong>History</strong> in the editor menu to see all versions, compare them, and view who made each change.</P><H3 id="nda-status">NDA statuses</H3><Bullets items={[<><strong>Draft</strong> — Being prepared; not signed. You can edit freely.</>, <><strong>Active</strong> — Signed by you. The current version is locked; make a new draft to revise.</>, <><strong>Archived</strong> — Hidden but preserved for records. You can restore to a new draft.</>]} /><H3 id="nda-export">Exporting to PDF</H3><P>Use <strong>⋯ → Export → PDF document</strong> (or <strong>Word document</strong>) in the editor menu. The export includes the full bilingual text (side-by-side or stacked) with all merge fields resolved for the assigned employee, effective date, and survival period. Filenames include the NDA title and version.</P><Callout type="note">Employee acknowledgement of NDAs (employee-side signing in the portal) is a future feature. For now, employer signature confirms legal intent.</Callout></>
)

const JOB_DESCRIPTIONS: ReactNode = (
<><P>Job descriptions define the roles candidates sign off on during onboarding. They live in <strong>Hiring → Job Descriptions</strong> and are drafted, published (read-only), or archived as you refine your organizational structure.</P><H3 id="jd-creation">Creating a job description</H3><P>From <strong>Dashboard → Documents</strong>, click <strong>Create</strong> and choose <strong>Job Description</strong>. This routes you to <strong>Hiring → Job Descriptions</strong>, where a new blank draft opens. Alternatively, go directly to <strong>Hiring → Job Descriptions → New</strong>.</P><P>When creating a new JD, you can optionally seed it from:</P><Bullets items={[<><strong>A hiring request</strong> — The request’s position name, department, and qualifications pre-fill the JD so you don’t start from scratch.</>, <><strong>A JD template</strong> — Use a previous JD as a starting point (company policies, role descriptions remain consistent).</>]} /><H3 id="jd-fields">Key fields</H3><P>In the sidebar, fill in:</P><Bullets items={[<><strong>Department</strong> — Required. Where the role sits (e.g., Engineering, Sales).</>, <><strong>Assignee</strong> — The employee responsible for this role (optional, updated as the role is filled).</>, <><strong>Reporting line</strong> — Who does this role report to? (optional)</>, <><strong>Job level</strong> — e.g., "Senior Developer" or "Intern"</>, <><strong>Supervised team</strong> — Titles of roles this person manages (optional).</>, <><strong>Work location</strong> — Office, remote, or hybrid.</>, <><strong>Effective date</strong> — When the JD takes effect (optional).</>, <><strong>Doc version</strong> — An internal reference code (auto-suggested based on department).</>]} /><H3 id="jd-draft-stage">Draft stage</H3><P>While a JD is in Draft, only HR can see it. Edit the title, fields, and bilingual content freely. Click <strong>Save draft</strong> to persist changes without publishing.</P><H3 id="jd-publish">Publishing</H3><P>Click <strong>Publish</strong> to freeze the JD and make it visible across your organization. Once published, the JD becomes read-only — no edits. A version snapshot is automatically saved, preserving the published state for candidates who sign it during onboarding.</P><Callout type="tip">Published JDs cannot be edited directly. To revise a published JD, archive the old one and create a new draft.</Callout><H3 id="jd-archive-restore">Archiving and restoring</H3><P>Click <strong>Archive</strong> (visible when a JD is published) to hide it from new candidates while keeping it for records. You can restore an archived JD to a new draft at any time using the document’s menu in the Documents list.</P><H3 id="jd-export">Exporting to PDF</H3><P>Use <strong>⋯ → Export</strong> in the editor menu and pick PDF or Word. The export renders the full bilingual JD (side-by-side or stacked layout) with all details resolved. Filenames include the JD title and version.</P><Callout type="note">Job descriptions are not signed by HR; candidates acknowledge them (by name and signature style) during onboarding. The acknowledgement is recorded in their onboarding checklist.</Callout></>
)

const LETTERS: ReactNode = (
<><P>Letters let you draft and issue offer letters, reference letters, and announcement letters to employees. Each letter must have a recipient and sender before it’s issued, and can optionally require the recipient to acknowledge they’ve read it in the employee portal.</P><H3 id="letter-creation">Creating a letter</H3><P>From <strong>Dashboard → Documents</strong>, click <strong>Create</strong> and choose <strong>Letter</strong>. A blank letter draft opens in the editor. The status badge shows <strong>Draft</strong>.</P><H3 id="letter-fields">Required and optional fields</H3><P>In the right sidebar, configure:</P><Bullets items={[<><strong>Recipient</strong> — Required to issue. Pick an employee from your list.</>, <><strong>Sender</strong> — Required to issue. The person issuing the letter (chosen from your organization’s users; defaults to you).</>, <><strong>Category</strong> — e.g., "Offering Letter" (display-only, helps organize letters).</>, <><strong>Type code</strong> — A short code substituted into the reference number (e.g., "OL" for Offering Letter).</>, <><strong>Reference number</strong> — Unique identifier. If left blank, Flodok auto-generates one on issue using the type code.</>, <><strong>Subject</strong> — The letter’s subject line (shown to the recipient).</>, <><strong>Response by</strong> — Optional deadline. Shown in the employee portal if the letter requires acknowledgement.</>, <><strong>Requires acknowledgement</strong> — Toggle on to force the recipient to confirm they’ve read the letter in the portal.</>]} /><H3 id="letter-bilingual">Bilingual editing</H3><P>Edit Indonesian and English independently. Use merge fields like <code>{'{{employee_name}}'}</code>, <code>{'{{sender_name}}'}</code>, and <code>{'{{today}}'}</code> to personalize each letter. Merge fields resolve automatically when you issue or export.</P><H3 id="letter-draft">Draft stage</H3><P>While a letter is in Draft, you can edit all fields and content freely. Click <strong>Save as draft</strong> to persist changes without issuing.</P><H3 id="letter-issue">Issuing a letter</H3><P>Once you have a recipient and sender, click <strong>Issue</strong>. The letter is marked <strong>Issued</strong>, a reference number is generated (if blank), and a version snapshot is saved. The recipient receives the letter in their employee portal and can view it. If acknowledgement is required, they must click to confirm they’ve read it.</P><Callout type="warn">Once issued, you cannot change the recipient or sender, and the <strong>subject</strong> locks. The reference number and the letter body stay editable — edits update the live letter, and each issued version is snapshotted for the record.</Callout><H3 id="letter-versioning">Version history</H3><P>Click <strong>History</strong> in the editor menu to view previous versions and see who issued each one.</P><H3 id="letter-export">Exporting</H3><P>Use <strong>⋯ → Export → PDF document</strong> (or Word) in the editor menu. The PDF renders the full bilingual letter (side-by-side or stacked layout) with all merge fields resolved for the recipient, sender, and today’s date. Filenames include the letter title and reference number.</P><H3 id="letter-status">Letter statuses</H3><Bullets items={[<><strong>Draft</strong> — Being prepared. You can edit all fields.</>, <><strong>Issued</strong> — Sent to the recipient and notified. The subject locks; the reference number and body stay editable, and each version is snapshotted.</>, <><strong>Archived</strong> — Hidden but kept for records. You can restore to a new draft.</>]} /><Callout type="tip">Letters are a flexible way to formalize communications — use them for offer letters, promotion announcements, exit letters, or any official notice that needs a version record.</Callout></>
)

const DOCUMENTS_EXPORT: ReactNode = (
<><P>Every document type (SOPs, contracts, NDAs, job descriptions, and letters) can be exported to <strong>PDF</strong> or <strong>Word (DOCX)</strong>. The export respects your bilingual layout preference, resolves merge fields, and downloads with a sensible filename.</P><H3 id="export-basics">How to export</H3><P>Open any document in its editor, then use the <strong>⋯ → Export</strong> submenu (top right) and choose <strong>PDF document</strong> or <strong>Word document</strong>. Flodok renders the document, resolves all merge fields, and starts the download.</P><H3 id="export-layout">Bilingual layout</H3><P>The PDF layout matches your current editor view preference:</P><Bullets items={[<><strong>Side-by-side</strong> — English on the left, Indonesian on the right, both visible at once.</>, <><strong>Stacked</strong> — English above, Indonesian below. Full width per language.</>]} /><P>To change the layout before exporting, toggle the view mode in the editor toolbar (the <strong>Side-by-side / Stacked</strong> button).</P><H3 id="export-merge-fields">Merge field resolution</H3><P>Merge fields automatically resolve based on the document context:</P><Bullets items={[<><strong>Employee fields</strong> — <code>{'{{employee_name}}'}</code>, <code>{'{{employee_ktp_nik}}'}</code>, etc., pull from the assigned employee.</>, <><strong>Organization fields</strong> — <code>{'{{org_name}}'}</code>, <code>{'{{org_address}}'}</code>, etc., pull from your company profile.</>, <><strong>Date fields</strong> — <code>{'{{today}}'}</code> resolves to the current date.</>, <><strong>Sender/signer fields</strong> — Letters use <code>{'{{sender_name}}'}</code> and <code>{'{{sender_title}}'}</code>, resolved from the assigned user.</>, <><strong>Document-specific fields</strong> — NDAs use <code>{'{{nda_effective_date}}'}</code>, <code>{'{{nda_survival_period}}'}</code>, <code>{'{{nda_penalty_idr}}'}</code>; contracts use <code>{'{{contract_type}}'}</code>, <code>{'{{annual_leave_days}}'}</code>, etc.</>]} /><P>If a merge field is not available (e.g., no employee assigned), it appears as empty or a placeholder in the PDF.</P><H3 id="export-language-priority">Language priority</H3><P>PDFs are rendered in light theme (white background, dark text) regardless of your current app theme, so they print and share cleanly. English always renders; Indonesian is included if the document has been translated (or is originally Indonesian). If Indonesian translation failed or is missing, only English appears.</P><H3 id="export-filename">Filenames</H3><P>Downloads use the document title (e.g., <code>Employment Contract.pdf</code>, <code>NDA 2026.pdf</code>) or a generic name if the title is empty (e.g., <code>Letter.pdf</code>). Version numbers and timestamps are not included in the filename.</P><H3 id="export-for-signing">Exporting for wet signature</H3><P>For contracts and NDAs that will be printed and wet-signed, export the PDF, print it, sign by hand, and return the marked-up copy. Flodok will record the digital signature separately when the employer signs in the app.</P><Callout type="tip">Use <strong>Export</strong> to create shareable, archival copies of any document. The PDF is a snapshot at download time; later edits to the draft do not update previously downloaded files.</Callout></>
)

const HIRING_REQUESTS: ReactNode = (
<>
  <P>Submit hiring requests to open a new role. Requests route through department managers and your owner for approval before moving to recruitment.</P>

  <H3 id="submitting-a-request">Submitting a request</H3>
  <Steps items={[
    <>Go to <strong>Hiring → Requests</strong></>,
    <>Click <strong>New request</strong> at the top right</>,
    <>Fill in position details: position name, department, employment type (permanent / fixed-term / freelance), hiring date, and remuneration (salary, allowances, benefits)</>,
    <>Add supporting context: required qualifications, reason for the hire, whether it’s budgeted or not, and any other details for approvers</>,
    <>Click <strong>Save as draft</strong> to save without submitting, or <strong>Submit for approval</strong> when ready</>,
  ]} />

  <H3 id="understanding-status">Understanding request status</H3>
  <Bullets items={[
    <><strong>Draft</strong> — you can still edit the request</>,
    <><strong>Awaiting manager</strong> — your department manager is reviewing it</>,
    <><strong>Awaiting owner</strong> — the owner is reviewing it after manager approval</>,
    <><strong>Approved</strong> — green-lit and ready to move to recruitment</>,
    <><strong>Rejected</strong> — either the manager or owner declined it (you’ll see their note)</>,
    <><strong>Filled</strong> — you’ve hired someone for this role</>,
  ]} />

  <H3 id="approval-workflow">How approval works</H3>
  <P>Requests follow a two-step approval path:</P>
  <Bullets items={[
    <>If you manage the department, submitting auto-records your manager approval and sends it straight to the owner</>,
    <>Otherwise, your department manager reviews it first, then passes to the owner for final sign-off</>,
    <>Managers and owners can add notes to approvals for context</>,
  ]} />

  <H3 id="managing-requests">Managing your requests</H3>
  <P>Go to <strong>Hiring → Requests</strong> to see:</P>
  <Bullets items={[
    <><strong>My requests</strong> — requests you’ve submitted (draft, submitted, or awaiting owner approval). Edit drafts or duplicate them to speed up similar requests</>,
    <><strong>Approvals</strong> — requests awaiting your decision as a manager or owner (only visible if you can approve)</>,
    <><strong>All</strong> — the full pipeline (only visible to owners and HR)</>,
  ]} />
  <P>Use the search box to find requests by position name, department, or requester.</P>

  <H3 id="drafting-a-job-description">Drafting a job description</H3>
  <P>Once a request is approved, HR can draft a job description from it. Open the request detail view, click <strong>Draft job description</strong>, and either start blank or pick from your templates. The request’s position details will pre-fill the JD.</P>

  <Callout type="tip">Duplicate a request to reuse most of its fields for similar roles. You’ll land in the edit form as a new draft, so you can tweak the details before submitting.</Callout>

  <Callout type="note">Department managers are determined in <strong>Company → Structure</strong>. Only users linked to an employee record can be set as managers.</Callout>
</>
  
)

const EMPLOYEES_DIRECTORY: ReactNode = (
<>
  <P>The Employees page is your team roster. Switch between list and card views, filter by status, department, role, and branch, and take bulk actions like import and export.</P>

  <H3 id="views">Switching views</H3>
  <Bullets items={[
    <><strong>List view</strong> — sortable table with 20+ column options (departments, phone, status, portal link, personal info, employment details, documents). Pick which columns to show</>,
    <><strong>Card view</strong> — visual grid showing name, photo, departments, phone, and portal link for each employee</>,
  ]} />

  <H3 id="filtering-and-sorting">Filtering and sorting</H3>
  <P>Click <strong>Filter</strong> to refine by:</P>
  <Bullets items={[
    <><strong>Status</strong> — active, probation, or separated</>,
    <><strong>Department</strong> — multi-select (only if departments are set in <strong>Company → Structure</strong>)</>,
    <><strong>Job position</strong>, <strong>Job level</strong>, <strong>Class</strong> — pick from values configured in your company structure</>,
    <><strong>Sort</strong> — by name, recently added, oldest, or by other fields</>,
  ]} />
  <P>In list view, click a column header to sort by that field. Use the search box to find by name, phone, email, department, or position.</P>

  <H3 id="employee-actions">Employee actions</H3>
  <P>Click an employee to open their full profile. From the list or card view, right-click (list view) or use the menu (card view) to:</P>
  <Bullets items={[
    <><strong>Edit</strong> — open the employee record to update personal, employment, education, experience, and other details</>,
    <><strong>Duplicate</strong> — copy an employee’s record as a new entry (useful for quickly adding similar employees); you’ll be prompted for a new name and phone</>,
    <><strong>Delete</strong> — move the employee and their linked documents (SOPs, contracts) to Trash (recoverable for 30 days)</>,
  ]} />

  <H3 id="bulk-actions">Bulk actions</H3>
  <P>In list view, select multiple employees with the checkboxes. A bar appears with options:</P>
  <Bullets items={[
    <>Clear selection or <strong>Delete</strong> (move selected employees to Trash)</>,
  ]} />

  <H3 id="import-export">Import and export</H3>
  <Bullets items={[
    <><strong>Export</strong> — download current employees as Excel (filtered by your search and status)</>,
    <><strong>Import</strong> — upload an Excel file to create or update employees in bulk (guided import, maps columns automatically)</>,
  ]} />

  <H3 id="portal-link">Portal link</H3>
  <P>In list view, the <strong>Portal link</strong> column shows each employee’s personal link. Click the link text to copy it, or use the copy icon next to it. Share this link with the employee to let them access their documents, contracts, and forms from the employee portal.</P>

  <Callout type="tip">To show more columns in list view (e.g. address, KTP/NIK, passport, notes), click <strong>Columns</strong> and check the ones you need. Your choice is saved.</Callout>

  <Callout type="note">Status is derived automatically from probation end date, resignation date, and separation type. It’s read-only in the list — update it by editing the employee record’s employment section.</Callout>
</>
  
)

const EMPLOYEE_PROFILE: ReactNode = (
<>
  <P>The employee profile is your central place to record everything about a team member: personal details, employment history, education, experience, and linked documents.</P>

  <H3 id="accessing-profile">Accessing the profile</H3>
  <P>From <strong>Employees</strong>, click an employee’s name or card to open their full profile. Click the employee’s name in the sidebar to return to the employees list.</P>

  <H3 id="sections">Profile sections</H3>
  <Bullets items={[
    <><strong>Personal</strong> — name, avatar, phone, email, departments, date of birth, place of birth, gender, religion, marital status, blood type, address, KTP/NIK, passport, plus emergency contacts and family members</>,
    <><strong>Employment</strong> — branch, job position, job level, class, employment type, join date, probation end date, and active contract info</>,
    <><strong>Education</strong> — schools, majors, dates attended, and certificates</>,
    <><strong>Experience</strong> — previous employers, roles, dates, and descriptions</>,
    <><strong>Additional</strong> — custom fields you define, plus free-text notes</>,
    <><strong>Documents</strong> — uploaded files (contracts, certificates, letters, etc.)</>,
    <><strong>Compensation</strong> — read-only view of the employee’s active contract and pay components</>,
  ]} />

  <H3 id="editing-fields">Editing fields</H3>
  <P>Click into any section to edit. Most fields update on blur (when you click away); some require you to click <strong>Save</strong>. If you lack permission to edit, fields will be read-only.</P>
  <P>New employees default to probation status. As they complete probation or if they resign or are terminated, update their status in the <strong>Employment</strong> section:</P>
  <Bullets items={[
    <>Click <strong>Resign</strong> to set a resignation date, separation type (resigned / terminated), and reason</>,
    <>Click <strong>Terminate</strong> for the same flow (separation type auto-sets to terminated)</>,
  ]} />

  <H3 id="departments">Setting departments</H3>
  <P>In the <strong>Personal</strong> section, click the department field to pick from your configured departments (or type to create a new one). Set one as primary (you’ll see a highlight). This affects their appearance in department filters across the app.</P>

  <H3 id="avatar">Uploading a photo</H3>
  <P>Click the avatar area in the sidebar to upload a photo (JPEG, PNG, or WebP, max 2 MB). Click <strong>Change</strong> to replace it or <strong>Remove</strong> to delete it.</P>

  <H3 id="documents">Adding documents</H3>
  <P>Go to the <strong>Documents</strong> section to upload files (passports, certificates, IDs, etc.). Click <strong>Upload</strong>, pick a file, and optionally add a label. Files are kept here for easy reference.</P>

  <H3 id="discard-new">New employee flow</H3>
  <P>When you create a new employee, you land in the profile with a <strong>Discard</strong> button in the top right. Fill in at least the required fields (name, phone), then click <strong>Save</strong> or navigate away. If you click <strong>Discard</strong>, the employee record is permanently deleted.</P>

  <H3 id="separation">Resignation and termination</H3>
  <P>Click <strong>Resign</strong> or <strong>Terminate</strong> in the sidebar. A modal asks for the last day of work, separation type, and reason. Once confirmed, the employee moves to separated status and their profile reflects the resignation date.</P>

  <Callout type="tip">Download or print the employee’s portal link (in the sidebar) to share with them. They can access their SOPs, contracts, and forms from that link.</Callout>

  <Callout type="warn">Deleting an employee from the Trash moves it permanently. Employee records deleted from Trash cannot be recovered.</Callout>
</>
  
)

const COMPANY_STRUCTURE: ReactNode = (
<>
  <P>Organize your company hierarchy, define job roles, and manage payroll settings in the <strong>Company</strong> section.</P>

  <H3 id="navigating">Accessing company settings</H3>
  <P>Click <strong>Company</strong> in the sidebar, then select a tab:</P>
  <Bullets items={[
    <><strong>Profile</strong> — company name, logo, address, tax info (NPWP, BPJS, KLU), and payroll settings</>,
    <><strong>Structure</strong> — departments, branches, job positions, levels, and classes</>,
    <><strong>Assets</strong> — (coming soon)</>,
    <><strong>Activity</strong> — (coming soon)</>,
  ]} />

  <H3 id="profile-tab">Profile tab</H3>
  <Bullets items={[
    <><strong>Branding</strong> — upload a company logo, set legal and display names</>,
    <><strong>Contact info</strong> — phone, email, website, industry, company size range</>,
    <><strong>Address</strong> — street, city, province, postal code</>,
    <><strong>Tax info</strong> — NPWP (15 & 16 digit), NITKU, taxable date, tax person name and NPWP, BPJS number, JKK rate, KLU code, registration & business license numbers</>,
    <><strong>Payroll settings</strong> — pay day (1–28, or last day of month) and timezone (WIB, WITA, or WIT)</>,
  ]} />
  <P>Only admins can edit the profile. Click <strong>Save</strong> to update.</P>

  <H3 id="structure-tab">Structure tab</H3>
  <P>Four main sections, each with add, edit, and delete:</P>

  <H3 id="departments">Departments</H3>
  <Bullets items={[
    <>Type a name and click <strong>Add</strong> to create a new department</>,
    <>Click <strong>Edit</strong> on a department to rename it</>,
    <>Click <strong>Delete</strong> to remove it (employees linked to the department won’t lose it, but new hires can’t select it)</>,
    <>Set a <strong>Manager</strong> (dropdown) — pick from users who are also linked to an employee record</>,
  ]} />
  <P>Departments are used to route hiring requests to the right approvers and to organize the employees list.</P>

  <H3 id="branches">Branches</H3>
  <Bullets items={[
    <>Add branches to represent physical or operational locations</>,
    <>Assign branches to employees in their employment section</>,
    <>Delete a branch to remove it from all employee records</>,
  ]} />

  <H3 id="job-roles">Job positions, levels, and classes</H3>
  <Bullets items={[
    <><strong>Job positions</strong> — e.g., Senior Engineer, HR Manager (denormalized onto each employee)</>,
    <><strong>Job levels</strong> — e.g., Senior, Junior, IC4, M2</>,
    <><strong>Classes</strong> — e.g., Level A, Tier 1 (for internal classification)</>,
  ]} />
  <P>Add, edit, or delete each one. When you edit a value (e.g., rename "Senior Engineer" to "Senior Software Engineer"), the change automatically updates all employee records using that value. Deleting a value clears it from affected employee records.</P>

  <Callout type="note">When you delete a department, branch, job position, level, or class, any SOPs that target it as an audience will be detached, and employees using that value will have it cleared.</Callout>

  <Callout type="tip">Set up departments early so hiring requests route correctly. Department managers must be users linked to an employee record — the system enforces this to ensure approvers can actually log in.</Callout>
</>
  
)

const PAYROLL_OVERVIEW: ReactNode = (
<>
  <P>
    Run your organization's monthly payroll in one place. The Payroll page previews every employee's pay for the month, lets you freeze and run it, and gives each person a downloadable payslip.
  </P>

  <H3 id="access-payroll-page">
    Go to the Payroll page
  </H3>
  <P>
    <strong>Dashboard → Payroll</strong> (owner/admin only). Pick a month from the top strip to see a preview, or stay on the current month to run it.
  </P>

  <H3 id="payroll-summary">
    What you see at the top
  </H3>
  <Bullets items={[
    <><strong>Total payout</strong> for the month, with a <em>vs last month</em> trend tile</>,
    <><strong>Total bonuses</strong> (rewards) and <strong>Total deductions</strong> (penalties) applied this month</>,
    <>An expandable <strong>analytics</strong> panel with payout and adjustment bar charts</>,
  ]} />
  <P>
    The month strip carries a <strong>"needs run"</strong> dot on any month that still has employees to settle — so a month you reopened, or a past month you never ran, is easy to spot.
  </P>

  <H3 id="per-employee-breakdown">
    Per-employee line breakdown
  </H3>
  <P>
    The roster shows each employee's base salary, allowances, adjustments (rewards/penalties), and final payout — as a table or cards, with search, filters, and sort. Expand a row to see the exact line items: base, each allowance (fixed or variable), and any adjustments that month. You can <strong>freeze</strong> or <strong>reopen</strong> an individual employee from their row.
  </P>

  <H3 id="freeze-and-run">
    Freeze & Run Payroll
  </H3>
  <Steps items={[
    <>Go to <strong>Dashboard → Payroll</strong> for the month you want to finalize.</>,
    <>Click the <strong>Freeze & run payroll</strong> button at the top right.</>,
    <>The dialog shows how many employees will run, a reconcile note if the headcount looks off, and an irreversibility warning. Tick the <strong>acknowledgement checkbox</strong> to confirm.</>,
    <>Run it. When it finishes, those employees show as settled and their payslips become downloadable.</>,
  ]} />
  <Callout type="note">
    Running a month <em>freezes</em> the employees you run. You can <strong>reopen</strong> a month — or a single employee — later if something needs to change, then run it again; the "needs run" dot on the month strip reminds you when that is outstanding.
  </Callout>

  <H3 id="download-payslips">
    Download payslips
  </H3>
  <P>
    After payroll is frozen & run, each employee row shows a <strong>Payslip</strong> button. Click it to download that employee’s PDF payslip for the month.
  </P>
  <P>
    To download <em>all</em> payslips at once, open the <strong>⋯ More</strong> menu (top right) and choose <strong>Download all</strong> — a ZIP with one PDF per settled employee. The same menu holds a <strong>CSV export</strong> and a link to <strong>Payroll settings</strong>.
  </P>

  <H3 id="navigate-months">
    Browsing past months
  </H3>
  <P>
    Use the month strip to jump across the past 12 months. A fully settled month is a read-only record — but if a month still has open employees (its "needs run" dot is showing), you can run it. Adjustments (rewards/penalties) can only be added to the live current month.
  </P>

  <H3 id="no-contract-warning">
    Employees with no contract
  </H3>
  <P>
    If an employee has no active contract, they will appear in the roster with a "No contract" label underneath their name. They cannot be included in payroll until an active contract is assigned.
  </P>

  <Bullets items={[
    <><Link to="/help/docs/manage-employees">Link an employee to a contract</Link></>,
    <><Link to="/help/docs/pay-components">Configure pay components (allowances)</Link></>,
  ]} />
</>
)

const PAY_COMPONENTS: ReactNode = (
<>
  <P>
    Pay components are the line items that make up each employee’s paycheck — base salary, allowances (housing, transport), bonuses, deductions, and benefits. You configure the catalog once, then assign amounts per employee on their contract.
  </P>

  <H3 id="access-components">
    Go to Pay Components
  </H3>
  <P>
    <strong>Settings → Payroll tab → Pay Components</strong> (admin only).
  </P>

  <H3 id="component-types">
    Types of pay components
  </H3>
  <Bullets items={[
    <>Earning — salary, allowances, bonuses, overtime pay (adds to gross)</>,
    <>Deduction — tax, loan, BPJS contributions (subtracts from gross)</>,
    <>Benefit — insurance, pension, food vouchers (tracked but depends on your payroll integration)</>,
  ]} />

  <H3 id="fixed-vs-variable">
    Fixed vs. variable
  </H3>
  <P>
    Mark a component <strong>Fixed</strong> if it’s the same every month (e.g., housing allowance). Mark it <strong>Variable</strong> if the amount changes (e.g., commission, overtime). The distinction helps Flodok know whether to prompt for an amount when you’re setting up a contract.
  </P>

  <H3 id="add-component">
    Add a new component
  </H3>
  <Steps items={[
    <>Click the <strong>+ Add</strong> button at the bottom of the components list.</>,
    <>Type a name (e.g., "Mobile Allowance", "Health Insurance").</>,
    <>Choose the kind (Earning, Deduction, Benefit) and category (Base, Allowance, Bonus, etc.).</>,
    <>Toggle Fixed or Variable, and Taxable (whether it counts toward income tax).</>,
    <>Enter the Talenta name if you’re exporting payroll to Talenta. Leave blank if you’re not using Talenta yet.</>,
  ]} />

  <H3 id="talenta-sync">
    Sync with Talenta
  </H3>
  <P>
    If you use Talenta for payroll, the "In Talenta" badge tracks which components you’ve already set up there. Once you’ve created a component in both Flodok and Talenta:
  </P>
  <Steps items={[
    <>Go back to <strong>Settings → Payroll → Pay Components</strong>.</>,
    <>Find the component and click the "In Talenta" badge to check it off.</>,
    <>The component is now ready to export when you run payroll.</>,
  ]} />
  <Callout type="tip">
    Only components marked "In Talenta" will be exported when you sync payroll data. This acts as a safety checklist — ensure your Flodok components match your Talenta setup before exporting.
  </Callout>

  <H3 id="edit-component">
    Edit or delete a component
  </H3>
  <P>
    Click the component card to edit its name, kind, or flags. Click the × icon to delete it. Deleting a component does not affect payroll history — only future payrolls.
  </P>

  <Bullets items={[
    <><Link to="/help/docs/payroll-overview">View monthly payroll</Link></>,
    <><Link to="/help/docs/manage-employees">Set up employee contracts with allowances</Link></>,
  ]} />
</>
)

const FORMS_LEAVE_RULES: ReactNode = (
<>
  <P>
    Indonesian labor law requires annual leave to accrue monthly based on continuous service. Flodok automates this so employees can’t take more leave than they’ve earned, and ensures the statutory 12-month gate is respected.
  </P>

  <H3 id="annual-leave-accrual">
    How annual leave accrues
  </H3>
  <P>
    Employees earn annual leave each month they work:
  </P>
  <Bullets items={[
    <>In the first year of service: accrue 1/12th of their annual entitlement each month (pro-rated by join date)</>,
    <>After 12 months of continuous service: the full annual entitlement becomes available and resets yearly</>,
    <>No carry-over: any unused annual leave expires at the end of the leave year (no rollover to the next year)</>,
  ]} />

  <H3 id="service-gate">
    The 12-month service gate
  </H3>
  <P>
    By default, annual leave is <em>locked</em> until an employee completes 12 months of service. During the first year:
  </P>
  <Bullets items={[
    <>Leave accrues in the background each month, but the employee cannot submit a leave request</>,
    <>The leave request form shows "Available after 12 months of service" as a locked notice</>,
    <>Once 12 months are up, all accrued leave becomes usable at once</>,
  ]} />
  <Callout type="note">
    Your organization can turn off the 12-month service gate on the <strong>Leave Request</strong> form's config page (Dashboard → Forms → the Leave Request tile) if your policy is different. The default respects Indonesian statutory requirements.
  </Callout>

  <H3 id="leave-types">
    Leave types employees can request
  </H3>
  <Bullets items={[
    <>Annual leave (Cuti Tahunan) — paid, counts against the annual entitlement</>,
    <>Unpaid leave / permission (Cuti Tidak Dibayar / Izin) — no pay impact, unlimited (subject to approval)</>,
    <>National holiday substitution (Libur Nasional / Penggantian) — when work falls on a holiday</>,
    <>Sick leave without doctor’s note (Cuti Sakit tanpa Surat Dokter) — usually 1–2 days, no documentation required</>,
    <>Sick leave with doctor’s note (Cuti Sakit dengan Surat Dokter) — longer illnesses, requires medical proof</>,
    <>Short time (Datang Terlambat / Pulang Cepat) — partial day off (e.g., late arrival or early departure with hours specified)</>,
    <>Special leave (Cuti Khusus) — marriage, bereavement, religious observance, etc.</>,
  ]} />

  <H3 id="work-statuses">
    Work status & entitlements
  </H3>
  <P>
    An employee’s leave entitlements depend on their contract work status:
  </P>
  <Bullets items={[
    <>Permanent (PKWPT) — full annual entitlement; accrual rules apply</>,
    <>Contract (PKWT) — annual entitlement pro-rated by contract length; accrual still applies</>,
    <>Daily — may have reduced or no annual leave; check your organization’s policy</>,
    <>Piece-rate — usually no paid leave; treated as unpaid leave requests</>,
  ]} />

  <H3 id="submit-leave-request">
    Submitting a leave request
  </H3>
  <P>
    Employees go to their portal's <strong>Requests</strong> tab and click <strong>New Request</strong>, then pick a leave type. The form collects:
  </P>
  <Bullets items={[
    <>Leave type (dropdown) and dates</>,
    <>For short-time leaves: the clock-in and clock-out times</>,
    <>Reason (optional but encouraged)</>,
    <>Up to 2 replacement employees (optional) if the work needs to be covered</>,
  ]} />
  <P>
    Once submitted, the request goes to the manager for approval, then the owner (if two-step approval is enabled). Approved leave is auto-posted to the employee’s leave balance.
  </P>

  <H3 id="check-leave-balance">
    Check an employee’s leave balance
  </H3>
  <P>
    In a leave or overtime request detail view, scroll to <strong>Payroll section → Annual leave balance</strong>. You’ll see:
  </P>
  <Bullets items={[
    <>Entitlement: the full annual allocation from their contract</>,
    <>Used: days already taken this leave year</>,
    <>Remaining: days left to use</>,
    <>A note if they’re still in the first year and the service gate is active</>,
  ]} />

  <Bullets items={[
    <><Link to="/help/docs/manage-forms">Review and approve leave requests</Link></>,
    <><Link to="/help/docs/payroll-overview">View payroll & posted leave</Link></>,
  ]} />
</>
)

const DASHBOARD_OVERVIEW: ReactNode = (
<>
  <P>The <strong>Dashboard → Overview</strong> page is your action-first operations hub: what needs your attention today, the pulse of recent activity, and upcoming milestones — at a glance.</P>
  <H3 id="quick-actions">Quick actions</H3>
  <P>Three buttons jump you straight to common workflows:</P>
  <Bullets items={[<><strong>New task</strong> — open Tasks to add a to-do</>, <><strong>New employee</strong> — add a team member</>, <><strong>New document</strong> — create an SOP, contract, or other document</>]} />
  <H3 id="action-cards">What needs you</H3>
  <P>Up to four cards surface what is waiting on you — roster head-counts were deliberately dropped so the page is about action, not vanity metrics:</P>
  <Bullets items={[<><strong>Present today</strong> — who is clocked in, shown only when <Link to="/help/docs/attendance-overview">Attendance</Link> is on and you can manage people</>, <><strong>Awaiting signature</strong> — SOPs and contracts employees have not signed</>, <><strong>Pending updates</strong> — SOP change proposals from meetings awaiting your review</>, <><strong>Approvals</strong> — leave/overtime and hiring requests waiting on a decision (opens the Inbox; managers only)</>]} />
  <Callout type="note">If a payroll month still needs running, a <strong>payroll reminder</strong> sits at the top of the page, linking straight to <Link to="/help/docs/payroll-overview">Payroll</Link>.</Callout>
  <H3 id="activity-pulse">Activity pulse</H3>
  <P>A stacked bar chart shows activity over the last 30 days, broken down by:</P>
  <Bullets items={[<><em>Blue</em> — SOPs updated or assigned</>, <><em>Green</em> — signatures (SOPs, contracts, job descriptions signed)</>, <><em>Orange</em> — employee events (onboarded, hired, etc.)</>, <><em>Purple</em> — contracts updated or assigned</>]} />
  <P>Hover over a day to see exact counts. This helps you spot busy periods and slow weeks at a glance.</P>
  <H3 id="signature-coverage">Signature coverage</H3>
  <P>A slim card near the bottom shows what share of assigned SOPs and contracts have been signed — a percentage, a progress bar, and a per-type breakdown — appearing only when there is something to cover.</P>
  <Bullets items={[<><em>Green</em> (90%+) — most of your documents are signed</>, <><em>Amber</em> (60–89%) — good progress, follow up on stragglers</>, <><em>Red</em> (below 60%) — send reminders or chase unsigned docs</>]} />
  <H3 id="team-composition">Team composition</H3>
  <P>A donut chart shows your headcount by department. The center number is true headcount (employees in one department only count once). If an employee is tagged in multiple departments, they appear in each slice, so the slice total may exceed the center number — hover the info icon to learn more.</P>
  <H3 id="upcoming-calendar">Upcoming calendar</H3>
  <P>A <strong>90-day</strong> look-ahead of employee birthdays and work anniversaries. Filter by type and click an employee to open their record.</P>
  <H3 id="recent-activity">Recent activity</H3>
  <P>A timeline of your org's most recent events (signatures, SOP updates, new hires, and more). Click a filter pill to narrow by type, and <strong>Load more</strong> to page back.</P>
  <H3 id="recognition-moments">Recognition moments (if enabled)</H3>
  <P>With badges enabled, an ambient strip shows a recent achievement unlock and an upcoming milestone. Click an employee to open their profile.</P>
  <H3 id="compensation-total">Compensation total</H3>
  <P>A summary of monthly payroll costs: base wages (blue) + allowances (green) across all active employees with active contracts. Useful for budgeting and payroll planning.</P>
  <Callout type="tip">Bookmark this page — it’s the first place to check on a busy day.</Callout>
</>
)

// ─── Attendance ────────────────────────────────────────

const ATTENDANCE: ReactNode = (
  <>
    <P>
      Attendance lets your team clock in and out from their phone with a selfie
      and their location, and gives you a log of who was where, and when. It's{' '}
      <strong>off by default</strong> — switch it on per organization when you're
      ready, and only then does the clock-in tab appear for employees.
    </P>

    <H3 id="setup">Turning it on</H3>
    <P>
      Open <Link to="/dashboard/settings?tab=attendance">Settings → Attendance</Link>{' '}
      and switch on <strong>Employee clock-in</strong>. Two more controls live here:
    </P>
    <Bullets
      items={[
        <><strong>Auto clock-out</strong> — a safety cap (1–24 hours, default 16) that closes a forgotten clock-in so it doesn't run overnight. Auto-generated clock-outs are tagged <em>"Auto"</em> in the log.</>,
        <><strong>Locations</strong> — add your office geofences (a point + radius) and, optionally, your office network(s), and mark one as the primary. These are what "on-site" is measured against.</>,
      ]}
    />

    <H3 id="clock-in">How employees clock in</H3>
    <P>
      Once it's on, employees get an <strong>Attendance</strong> tab in their{' '}
      <Link to="/help/docs/portal-about">portal</Link>: a live clock and a single
      button that already knows whether they're clocking in or out (from their last
      event that day).
    </P>
    <Bullets
      items={[
        <>Clocking in takes a quick <strong>selfie</strong> (the camera needs a secure <code>https</code> connection) and their <strong>location</strong>.</>,
        <>Being <strong>outside</strong> the office area doesn't block them — it's recorded and flagged so you can see it. Having <strong>no location at all</strong> does block the submit.</>,
      ]}
    />

    <H3 id="confidence">The confidence signal</H3>
    <P>
      Every clock-in gets a <strong>confidence badge</strong> — <strong>On-site</strong>,{' '}
      <strong>Off-site</strong>, <strong>Unclear</strong>, or none — worked out by
      comparing the reported distance (and GPS accuracy) against your geofence. If the
      device is on a recognised <strong>office network</strong>, that confirms on-site
      on its own, independent of GPS.
    </P>

    <H3 id="log">The attendance log</H3>
    <P>
      The <strong>Attendance</strong> page (owners, admins, and HR) is your read-only
      record. Four cards summarise today — <em>Clocked in</em>, <em>Currently in</em>,{' '}
      <em>Flagged</em>, and <em>On-site rate</em> — over a filterable table:
    </P>
    <Bullets
      items={[
        <>Filter by <strong>employee</strong>, <strong>status</strong>, <strong>geofence confidence</strong>, and <strong>date range</strong>.</>,
        <>Each row shows time, in/out, location (with <strong>View on map</strong>), the confidence badge, and the <strong>selfie</strong> (opens in a modal).</>,
      ]}
    />

    <Callout type="note">
      Clock-ins are <strong>server-verified</strong>: the selfie is stored privately,
      and identity and the geofence check are resolved on the server, not trusted from
      the phone. Attendance stays completely inert until you enable it — no tab, no
      prompts — so you can roll it out when it suits you.
    </Callout>
  </>
)

// ─── Tasks ─────────────────────────────────────────────

const TASKS: ReactNode = (
  <>
    <P>
      Tasks is a Reminders-style to-do list for you and your team — capture something
      in seconds, give it a due date, assign it to an employee, and optionally link it
      to a document. Assigned tasks can appear in that employee's{' '}
      <Link to="/help/docs/portal-about">portal</Link>, so it doubles as a lightweight
      way to hand work out.
    </P>

    <H3 id="lists">Lists and projects</H3>
    <P>
      The left rail holds <strong>smart lists</strong> that fill themselves —{' '}
      <strong>Today</strong>, <strong>Scheduled</strong>, <strong>Flagged</strong>,{' '}
      <strong>All Tasks</strong>, <strong>Inbox</strong>, and <strong>Completed</strong>{' '}
      — plus your own colour-coded <strong>Projects</strong> for grouping related work.
      Each list shows a live count.
    </P>

    <H3 id="views">Three views</H3>
    <P>Switch views from the top right; your choice is remembered per browser.</P>
    <Bullets
      items={[
        <><strong>List</strong> — checkable circles; drag to reorder.</>,
        <><strong>Board</strong> — columns by status; drag a card between them.</>,
        <><strong>Calendar</strong> — drag a task to reschedule, or click a day to create one on it.</>,
      ]}
    />

    <H3 id="fields">What a task holds</H3>
    <Bullets
      items={[
        <><strong>Title</strong> and <strong>notes</strong> (links in notes are clickable).</>,
        <><strong>Due date</strong> plus an optional <strong>due time</strong>.</>,
        <><strong>Priority / flag</strong> — none, low, medium, or high.</>,
        <><strong>Assignee</strong> (an employee), a <strong>project</strong>, an external <strong>URL</strong>, and a <strong>linked document</strong> (an SOP, contract, or other doc).</>,
      ]}
    />

    <H3 id="assigning">Assigning to your team</H3>
    <P>
      Assign a task to an employee and it appears in their portal's{' '}
      <strong>Tasks</strong> tab. A phone glyph on the task marks it as
      portal-visible, so you can tell at a glance which tasks your team can see.
    </P>

    <H3 id="from-meetings">Tasks from your meetings</H3>
    <P>
      If you've connected{' '}
      <Link to="/help/docs/integrations-fireflies">Fireflies</Link>, action items
      pulled from your meeting transcripts arrive as <strong>Suggested tasks</strong>{' '}
      on the <Link to="/help/docs/pending">Pending</Link> page. Review each one — tweak
      the title, assignee, due date, or project — and <strong>Add to tasks</strong>{' '}
      turns it into a real task (portal-visible if you assign it to an employee).
    </P>

    <Callout type="note">
      Deleting a task is a soft delete — it goes to{' '}
      <Link to="/help/docs/trash">Trash</Link> and can be restored within the 30-day
      window.
    </Callout>
  </>
)

const INBOX: ReactNode = (
<>
  <P>The <strong>Dashboard → Inbox</strong> page is your action list. Items surface here because they need a decision from you or they’re waiting on someone else. It’s organized by urgency and type.</P>
  <H3 id="inbox-tabs">Tabs (urgency buckets)</H3>
  <P>Four tabs organize your inbox:</P>
  <Bullets items={[<><strong>All</strong> — every item, unfiltered</>, <><strong>Action Required</strong> — decisions sitting with you (review a pending update, approve a form, decide on a probation case)</>, <><strong>Awaiting Others</strong> — you’ve sent them (contracts/SOPs awaiting employee signature)</>, <><strong>Upcoming</strong> — heads up on things coming soon (probation ending in 7–30 days, passport expiring soon)</>]} />
  <H3 id="categories">Category filters</H3>
  <P>Within each tab, click a category pill to narrow further:</P>
  <Bullets items={[<><strong>Contract</strong> — contracts awaiting your or the employee’s signature</>, <><strong>SOP</strong> — SOPs awaiting employee signature</>, <><strong>Probation</strong> — probation decisions due or probation ending soon</>, <><strong>Document</strong> — passports expiring soon</>, <><strong>Pending Update</strong> — SOP changes from meeting transcripts to review</>, <><strong>Form</strong> — leave requests and overtime requests awaiting approval</>, <><strong>Task</strong> — meeting action items (from Fireflies) awaiting review</>, <><strong>Recruitment</strong> — start-date nudges for signed hires: set a date, ready to start, starting soon</>]} />
  <H3 id="item-actions">Item actions</H3>
  <P>Each item has three controls:</P>
  <Bullets items={[<><strong>Action button</strong> (right side) — opens the document or decision screen (Review, Open Contract, Open SOP, etc.)</>, <><strong>Due date</strong> (hidden on mobile) — red if overdue, gray if upcoming</>, <><strong>Menu (three dots)</strong> — snooze for 7 days or dismiss</>]} />
  <H3 id="snooze-dismiss">Snooze vs. dismiss</H3>
  <Bullets items={[<><strong>Snooze (7 days)</strong> — hides the item for a week, then it reappears. Good for <>I’ll get to this later</></>, <><strong>Dismiss</strong> — hides it permanently. The item still exists (e.g., the contract is still unsigned); it just won’t bother you again unless the underlying situation changes (e.g., the contract is signed, or a new contract is assigned)</>]} />
  <H3 id="search">Search</H3>
  <P>Use the search box to find items by title (document name, employee name, etc.).</P>
  <Callout type="tip">Action Required and Awaiting Others are the most urgent — check those first thing.</Callout>
  <Callout type="note">Inbox items are computed from live data, not stored. Dismiss an item without acting on it, and if the situation changes (e.g., the contract gets assigned), it may reappear.</Callout>
</>
)

const PENDING: ReactNode = (
<>
  <P>The <strong>Dashboard → Pending</strong> page is where AI-extracted items from your meetings wait for review: <strong>SOP update proposals</strong> and <strong>suggested tasks</strong>. Review, edit, then accept or reject each one.</P>
  <H3 id="pending-section">Pending updates</H3>
  <P>Unresolved proposals appear here, newest first. Each item shows:</P>
  <Bullets items={[<><strong>Employee avatar</strong> — whose SOP is being updated</>, <><strong>Title × timestamp</strong> — which employee and when the meeting was</>, <><strong>Source meeting</strong> — Fireflies meeting name (if available)</>, <><strong>AI summary</strong> — what changed (e.g., <>Added daily standup requirement</>)</>]} />
  <P>Click any proposal to expand it.</P>
  <H3 id="review-workflow">Review workflow</H3>
  <Steps items={["Expand a proposal by clicking its row", "If the proposal is unmatched (no employee yet), pick one from the dropdown at the top", <>Review the <strong>diff</strong> panel showing what changed (old on the left, new on the right)</>, <>Read the <strong>final version</strong> in the markdown editor — you can tweak wording here before approval</>, <>Click <strong>Approve</strong> to apply the new version to that employee’s SOP, or <strong>Reject</strong> to discard it</>]} />
  <Callout type="tip">The editor is plain Markdown. If the extracted text looks weird, fix it here before approving — your edit will be recorded in the SOP version history.</Callout>
  <H3 id="resolved-section">Resolved updates</H3>
  <P>Below the pending section, a <strong>Resolved</strong> section shows all approved, rejected, and auto-applied updates (if any). Filter by employee, status, or date range. Click an item to see the before–after diff.</P>
  <Bullets items={[<><strong>Approved</strong> — you accepted it, and the new version is live</>, <><strong>Rejected</strong> — you declined it; the SOP was not changed</>, <><strong>Auto-applied</strong> — the system auto-approved it (rare; usually requires manual review)</>]} />
  <H3 id="check-for-updates">Check for updates button</H3>
  <P>Click the blue <strong>Check for Updates</strong> button (top right) to poll your Fireflies account for new meeting transcripts. The app fetches recently recorded meetings, runs them through the AI extraction pipeline, and creates pending proposals.</P>
  <Bullets items={["Requires an active Fireflies account (free plan works for API access)", "Looks for meetings from the last 7 days", "May take a few seconds — the button shows a spinner while checking"]} />
  <H3 id="suggested-tasks">Suggested tasks</H3>
  <P>The same meeting pipeline also surfaces <strong>action items</strong> as suggested tasks lower on the page. Review each — edit its title, notes, assignee, due date, project, or priority — and click <strong>Add to tasks</strong> to turn it into a real <Link to="/help/docs/tasks">task</Link> (visible in that employee's portal if you assign it to them), or reject it.</P>
  <Callout type="note">Automatic polling isn’t turned on by default — you must click this button to trigger an update fetch.</Callout>
</>
)

const SPOTLIGHT: ReactNode = (
<>
  <P>The <strong>Dashboard → Spotlight</strong> page lets you post internal announcements to your team. Posts can be drafted, scheduled for a future time, published immediately, or archived. Employees see them in a notification bell and optionally must acknowledge them.</P>
  <H3 id="post-status">Post status</H3>
  <P>Every post has one of four statuses:</P>
  <Bullets items={[<><strong>Draft</strong> — saved but not sent to anyone yet</>, <><strong>Scheduled</strong> — will be published at a future date/time you set</>, <><strong>Published</strong> — live and visible to your audience</>, <><strong>Archived</strong> — hidden from employees (but kept in Spotlight for your records)</>]} />
  <H3 id="priority-levels">Priority levels</H3>
  <P>Mark each post as:</P>
  <Bullets items={[<><strong>Critical</strong> — red pill; urgent, must read</>, <><strong>Important</strong> — blue pill; significant news</>, <><strong>FYI</strong> — gray pill; nice to know, low urgency</>]} />
  <H3 id="display-modes">Display modes</H3>
  <P>Choose how employees see your post:</P>
  <Bullets items={[<><strong>Modal</strong> — full-screen popup when they open Flodok</>, <><strong>Banner</strong> — sticky bar at the top of the page</>, <><strong>Bell only</strong> — only in the notification bell; no interruption</>]} />
  <H3 id="acknowledgement">Acknowledgement</H3>
  <P>If you check <strong>Requires Acknowledgement</strong>, employees must click 'I’ve read this' before it goes away. The post card shows a counter (e.g., '12 / 45 acknowledged') so you know who’s still pending.</P>
  <H3 id="visibility">Visibility</H3>
  <P>Control who sees the post:</P>
  <Bullets items={[<><strong>Org-wide</strong> — everyone</>, <><strong>Specific departments</strong> — e.g., Engineering & Product</>, <><strong>Specific employees</strong> — e.g., Sam, Kristi, Jan</>]} />
  <H3 id="post-actions">Post actions</H3>
  <P>Each post card has a menu (three dots). Options vary by status:</P>
  <Bullets items={[<><strong>Draft</strong> — Publish or Delete</>, <><strong>Published</strong> — Republish (re-send to audience), Archive, or Delete</>, <><strong>Archived</strong> — Unarchive or Delete</>]} />
  <H3 id="republish">Republish</H3>
  <P>If you edit a published post’s content and want employees to see the update, click <strong>Republish</strong>. This re-fires the announcement to your audience. A counter tracks how many times a post has been republished.</P>
  <H3 id="create-new">Create a new post</H3>
  <P>Click the blue <strong>New</strong> button (top right) to open the editor.</P>
  <Bullets items={[<><strong>Title & description</strong> — what happened and what to do about it</>, <><strong>Image</strong> — optional header image (drag & drop or click to upload, up to 5 MB, JPEG/PNG/WebP/GIF)</>, <><strong>Posted as</strong> — your name or your org’s name</>, <><strong>Priority</strong> — critical / important / FYI</>, <><strong>Display mode</strong> — modal / banner / bell only</>, <><strong>Requires acknowledgement</strong> — check to force read confirmation</>, <><strong>Visibility</strong> — org-wide / specific departments / specific employees</>, <><strong>Publish at</strong> — leave blank to publish now, or set a future date/time to schedule</>]} />
  <P>Click <strong>Save Draft</strong> (keep working later), <strong>Schedule</strong> (if you set a future date), or <strong>Publish</strong> (send now).</P>
  <Callout type="tip">Use Critical priority and Modal display for time-sensitive announcements (outages, policy changes). Save FYI posts as drafts and batch-publish them during team meetings.</Callout>
</>
)

const TRASH: ReactNode = (
<>
  <P>The <strong>Dashboard → Trash</strong> page shows all soft-deleted items in your org. Nothing is truly gone for 30 days — you can restore it or permanently purge it.</P>
  <H3 id="what-soft-deletes">What gets soft-deleted</H3>
  <P>These item types end up in Trash:</P>
  <Bullets items={["Employees (active staff & candidates)", "SOPs, Contracts, NDAs, Job Descriptions, Letters", "Tasks", "Hiring Requests", "Spotlight posts (announcements)"]} />
  <H3 id="trash-table">Trash table</H3>
  <P>Each row shows:</P>
  <Bullets items={[<><strong>Type</strong> — item type (SOP, Contract, Employee, etc.)</>, <><strong>Name</strong> — title or employee name</>, <><strong>Deleted by</strong> — who deleted it</>, <><strong>Days left</strong> — countdown to permanent deletion (shown in red if ≤ 3 days)</>, <><strong>Restore</strong> — bring it back to active</>, <><strong>Delete forever</strong> — skip the wait and purge now (requires confirmation)</>]} />
  <H3 id="filters">Filters</H3>
  <P>Use the filter dropdown to narrow by type:</P>
  <Bullets items={["All, Employees, Candidates, SOPs, Contracts, Letters, Tasks, Job Descriptions, Hiring Requests, Spotlight"]} />
  <P>Search by name to find a specific item.</P>
  <H3 id="recovery-window">Recovery window</H3>
  <P>Every deleted item gets a 30-day grace period. After 30 days, it’s automatically and permanently purged. The <strong>Days left</strong> column counts down.</P>
  <H3 id="restore">Restore</H3>
  <P>Click <strong>Restore</strong> to bring an item back to active use. It reappears in its original location (Employees, Documents, etc.) with no data loss.</P>
  <H3 id="permanent-delete">Permanent delete</H3>
  <P>Click <strong>Delete forever</strong> to skip the 30-day wait and purge the item immediately. This is irreversible — you cannot recover it later. You’ll be asked to confirm.</P>
  <H3 id="empty-all">Empty all (admin only)</H3>
  <P>The <strong>Empty trash</strong> button (top right, visible to admins only) permanently deletes everything in Trash right now. Useful for housekeeping before exporting data. Requires confirmation.</P>
  <Callout type="warn">Permanent deletion cannot be undone. Be careful when clicking <strong>Delete forever</strong> or <strong>Empty trash</strong>.</Callout>
  <Callout type="tip">Don’t panic if you delete something by mistake — it’s in Trash for 30 days. Restore it immediately or wait if you need to verify it’s safe to bring back.</Callout>
</>
)

const SETTINGS_APPROVALS: ReactNode = (
<>
  <P>Request approvals govern the workflow for leave and overtime forms. You can assign a manager to handle initial approvals and optionally require the owner to sign off as well.</P>

  <H3 id="default-approver">Set the default approver</H3>
  <P>The default approver is the person who reviews leave and overtime requests first. Go to <strong>Settings → Approvals</strong> and use the <strong>Default approver</strong> dropdown to pick a team member. If you don’t assign anyone, the owner approves all requests.</P>

  <H3 id="owner-approval-gate">Require owner approval</H3>
  <P>Toggle <strong>Require owner approval</strong> to add a second sign-off step. When on, requests move from the manager to the owner for final approval before they take effect. This is useful if the owner wants visibility over all leave and overtime decisions.</P>

  <H3 id="how-it-works">How the workflow works</H3>
  <Bullets items={[
    "An employee submits a leave or overtime request from their portal.",
    "The form goes to the default approver (or owner if unset). They can approve, reject, or request changes.",
    "If owner approval is required, it then goes to the owner for final sign-off.",
    "Once both steps are complete (or just the manager step if owner approval is off), the request is marked approved."
  ]} />

  <Callout type="note">These settings apply organization-wide. You can further customize which fields are required for each form type in the per-form configuration pages.</Callout>
</>
)

const SETTINGS_ACHIEVEMENTS: ReactNode = (
<>
  <P>Badges are awards your team earns for hitting milestones, ranking high on leaderboards, or special recognition. They appear in the employee portal and on the manager dashboard’s Performance page.</P>

  <H3 id="enable-badges">Turn badges on or off</H3>
  <P>Go to <strong>Settings → Badges</strong>. Use the <strong>Enable badges</strong> toggle to switch the feature on or off for your organization. When off, no new badges are awarded and the Badges tab disappears from the employee portal. Existing badges remain in the database; they reappear if you turn badges back on.</P>

  <H3 id="badge-types">Types of badges</H3>
  <Bullets items={[
    <><strong>Tenure badges</strong> — awarded automatically for service milestones (e.g., 1 day, 1 month, 1 year).</>,
    <><strong>Compensation badges</strong> — awarded when salary or allowances hit a milestone (e.g., first salary, 5M IDR base).</>,
    <><strong>Leaderboard badges</strong> — earned by ranking #1, top 3, or consistently topping credits/performance metrics.</>,
    <><strong>Custom badges</strong> — you create these manually. Award them whenever you choose via the Performance page.</>
  ]} />

  <H3 id="manage-badges">Manage existing badges</H3>
  <P>The badge list groups them by type. For each badge you can:</P>
  <Bullets items={[
    <><strong>Toggle Active</strong> — stop awarding a badge without deleting it.</>,
    <><strong>Mark as Featured</strong> — highlight the badge as special (shows a <>featured</> label in the portal).</>,
    <><strong>Edit</strong> — change the name, description, or icon (for custom badges only; built-in badges are managed by Flodok).</>
  ]} />

  <Callout type="tip">Built-in badges (tenure, compensation, leaderboard) have their names and descriptions set by Flodok. You can still toggle them active, mark them featured, or turn the entire badges feature off if you don’t want them.</Callout>
</>
)

const INTEGRATIONS_OVERVIEW: ReactNode = (
<>
  <P>Integrations let Flodok pull data from and push actions to external services — so meeting notes and action items stay in sync across your tools.</P>

  <H3 id="available-integrations">Available integrations</H3>
  <Bullets items={[
    <><strong>Fireflies</strong> — auto-fetch meeting transcripts and extract action items into Flodok for follow-up.</>,
    <><strong>Asana</strong> — create Asana tasks from action items Flodok finds in meeting notes.</>
  ]} />

  <H3 id="connect-fireflies">Connect Fireflies</H3>
  <P>Go to <strong>Settings → Integrations → Fireflies</strong> and click <strong>Connect</strong>. You’ll need a Fireflies API key from your Fireflies account settings.</P>
  <Bullets items={[
    <><strong>Free plan:</strong> Flodok polls your Fireflies account every 5 minutes for new transcripts. No webhook setup needed.</>,
    <><strong>Business plan:</strong> You can optionally set up a webhook so Flodok gets transcripts in real-time. Paste the webhook URL from Flodok into Fireflies → Settings → Webhooks.</>
  ]} />

  <H3 id="connect-asana">Connect Asana</H3>
  <P>Go to <strong>Settings → Integrations → Asana</strong> and click <strong>Connect</strong>. You’ll need:</P>
  <Bullets items={[
    "An Asana personal access token (create one at app.asana.com/0/my-apps).",
    "Your Asana workspace GID and project GID — both are numbers you’ll find in your Asana project URL."
  ]} />

  <H3 id="review-mode">Review API updates (optional)</H3>
  <P>At the top of the Integrations page, toggle <strong>Require approval for API-submitted updates</strong> to control how Flodok handles data from your integrations. When on, updates sit in a Pending queue for you to review before they go live. When off, Flodok applies API updates immediately.</P>

  <H3 id="disconnect">Disconnect an integration</H3>
  <P>Find the integration in <strong>Settings → Integrations</strong> and click <strong>Disconnect</strong>. Flodok will stop pulling data from that service. Existing data stays in Flodok; only future syncs stop.</P>

  <Callout type="note">Only admins can connect and manage integrations. Billing access may be required to enable or modify integrations.</Callout>
</>
)


export const sections: DocSection[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    description: "The basics: the dashboard, account, plans, roles, and inviting your team.",
    topics: [
      {
        slug: "quickstart",
        title: "Quickstart",
        description: "Everything you need to know to start running your operation on Flodok in ten minutes.",
        iconKey: "sparkles",
        body: QUICKSTART,
      },
      {
        slug: "dashboard-overview",
        title: "Overview",
        description: "See your org at a glance: employee count, active documents, signature coverage, recent activity, and team composition.",
        iconKey: "sparkles",
        body: DASHBOARD_OVERVIEW,
      },
      {
        slug: "plans",
        title: "Plans & Pricing",
        description: "Compare Flodok's three plans, what's in each, and how billing works.",
        iconKey: "card",
        body: PLANS,
      },
      {
        slug: "roles",
        title: "Understanding Roles",
        description: "Admins, managers, employees, and portal-only access — what each can see and do.",
        iconKey: "shield",
        body: ROLES,
      },
      {
        slug: "invite-team",
        title: "Inviting Your Team",
        description: "Email invites, bulk uploads, and sharing the public portal link.",
        iconKey: "users",
        body: INVITES,
      },
    ],
  },
  {
    id: "documents",
    title: "Documents",
    description: "One home for every document — SOPs, contracts, NDAs, job descriptions, and letters — plus importing, exporting, templates, and version control.",
    topics: [
      {
        slug: "documents-overview",
        title: "Documents Hub",
        description: "Unified hub for SOPs, contracts, NDAs, job descriptions, and letters with filtering and search.",
        iconKey: "file",
        body: DOCUMENTS_OVERVIEW,
      },
      {
        slug: "sop-create",
        title: "Creating an SOP",
        description: "Use the bilingual editor and AI Generate to write SOPs your team will actually read.",
        iconKey: "pen",
        body: SOP_CREATE,
      },
      {
        slug: "sop-versioning",
        title: "SOP Versioning",
        description: "How history, diffs, and acknowledgements stay in sync as you update.",
        iconKey: "history",
        body: SOP_VERSIONING,
      },
      {
        slug: "contracts-create",
        title: "Creating Contracts",
        description: "PKWT vs PKWTT, merge fields, and how the candidate flow auto-creates contracts.",
        iconKey: "file",
        body: CONTRACTS_CREATE,
      },
      {
        slug: "contract-templates",
        title: "Contract Templates",
        description: "Define a reusable contract per job position so new offers auto-fill in seconds.",
        iconKey: "briefcase",
        body: CONTRACT_TEMPLATES,
      },
      {
        slug: "contracts-sign",
        title: "E-signatures",
        description: "Legally enforceable e-signing under UU 11/2008 (ITE), with structured audit trail.",
        iconKey: "pen",
        body: CONTRACTS_SIGN,
      },
      {
        slug: "contracts-history",
        title: "Contract History",
        description: "Versioning and signature pinning for signed contracts.",
        iconKey: "history",
        body: CONTRACTS_HISTORY,
      },
      {
        slug: "nda-overview",
        title: "NDAs",
        description: "One-way employee NDAs with effective date, survival period, and employer signing.",
        iconKey: "lock",
        body: NDA_OVERVIEW,
      },
      {
        slug: "job-descriptions",
        title: "Job Descriptions",
        description: "Role blueprints that candidates review on onboarding; create under Hiring → Job Descriptions.",
        iconKey: "briefcase",
        body: JOB_DESCRIPTIONS,
      },
      {
        slug: "letters",
        title: "Letters",
        description: "Offer, reference, and announcement letters with recipients, senders, and acknowledgement tracking.",
        iconKey: "mail",
        body: LETTERS,
      },
      {
        slug: "sop-import",
        title: "Importing SOPs",
        description: "Move from Google Docs, Notion, or Word with formatting preserved.",
        iconKey: "upload",
        body: SOP_IMPORT,
      },
      {
        slug: "documents-export",
        title: "Exporting to PDF",
        description: "Download documents in bilingual PDF format with merge fields resolved and custom layouts.",
        iconKey: "upload",
        body: DOCUMENTS_EXPORT,
      },
    ],
  },
  {
    id: "hiring",
    title: "Recruitment",
    description: "From a hiring request to a signed employee — requests, the candidate funnel, offers, and separations.",
    topics: [
      {
        slug: "hiring-requests",
        title: "Hiring requests",
        description: "Submit and approve role requests through your pre-hiring approval workflow.",
        iconKey: "workflow",
        body: HIRING_REQUESTS,
      },
      {
        slug: "hiring-funnel",
        title: "The hiring funnel",
        description: "How lifecycle stages work, what each one means, and how candidates auto-graduate to employees.",
        iconKey: "workflow",
        body: HIRING_FUNNEL,
      },
      {
        slug: "hiring-candidates",
        title: "Adding & managing candidates",
        description: "Adding candidates fast, shortlisting, the talent pool, and inline status changes.",
        iconKey: "users",
        body: HIRING_CANDIDATES,
      },
      {
        slug: "hiring-offers",
        title: "Making an offer",
        description: "How Make offer creates a draft contract from your position template and links it to the candidate.",
        iconKey: "handshake",
        body: HIRING_OFFERS,
      },
      {
        slug: "hiring-separation",
        title: "Resignations & terminations",
        description: "Recording an employee leaving — voluntary vs involuntary — and where their record goes.",
        iconKey: "door-out",
        body: HIRING_SEPARATION,
      },
    ],
  },
  {
    id: "employees",
    title: "Employees",
    description: "Your team directory and individual employee records.",
    topics: [
      {
        slug: "employees-directory",
        title: "Employees directory",
        description: "View, filter, and manage your team in list or card view.",
        iconKey: "users",
        body: EMPLOYEES_DIRECTORY,
      },
      {
        slug: "employee-profile",
        title: "Employee profile",
        description: "Edit employee personal, employment, education, and document information.",
        iconKey: "users",
        body: EMPLOYEE_PROFILE,
      },
    ],
  },
  {
    id: "company",
    title: "Company",
    description: "Your organization structure — departments, branches, positions, and the company profile.",
    topics: [
      {
        slug: "company-structure",
        title: "Company structure",
        description: "Set up and manage departments, branches, job positions, levels, and classes.",
        iconKey: "globe",
        body: COMPANY_STRUCTURE,
      },
    ],
  },
  {
    id: "performance",
    title: "Performance",
    description: "Recognition, badges, and rewards.",
    topics: [
      {
        slug: "recognition",
        title: "Recognition & rewards",
        description: "Reward or penalise pay, award badges, and track XP from the monthly Performance cockpit.",
        iconKey: "star",
        body: RECOGNITION,
      },
    ],
  },
  {
    id: "forms",
    title: "Forms & Requests",
    description: "Employee-fillable leave and overtime requests — submission, approval, payroll, and setup.",
    topics: [
      {
        slug: "forms-overview",
        title: "Forms Overview",
        description: "What Forms are, who does what, and how a request flows from an employee's portal into payroll and leave.",
        iconKey: "workflow",
        body: FORMS_OVERVIEW,
      },
      {
        slug: "submitting-requests",
        title: "Submitting a request",
        description: "How employees submit leave and overtime requests from the portal, read their status, and how HR files on their behalf.",
        iconKey: "clock",
        body: FORMS_SUBMITTING,
      },
      {
        slug: "approving-requests",
        title: "Approving requests",
        description: "How the two-tier approval chain works, where to approve or reject, and who can act at each step.",
        iconKey: "handshake",
        body: FORMS_APPROVING,
      },
      {
        slug: "forms-payroll-leave",
        title: "How requests reach payroll & leave",
        description: "What Flodok records automatically once a Leave or Overtime request is approved — overtime pay under PP35/2021, leave accrual and balances, reference numbers, and frozen-period reposting.",
        iconKey: "wallet",
        body: FORMS_PAYROLL_LEAVE,
      },
      {
        slug: "forms-leave-rules",
        title: "Leave rules & accrual (Indonesia)",
        description: "Understand annual leave accrual by months of service, the 12-month service gate, leave types, and work statuses.",
        iconKey: "clock",
        body: FORMS_LEAVE_RULES,
      },
      {
        slug: "configuring-forms",
        title: "Configuring Forms",
        description: "Admin setup for Forms — what each form offers, who approves, the owner gate, and filing on behalf.",
        iconKey: "settings",
        body: FORMS_CONFIG,
      },
    ],
  },
  {
    id: "payroll",
    title: "Payroll",
    description: "Run monthly payroll, configure pay components, and issue payslips.",
    topics: [
      {
        slug: "payroll-overview",
        title: "Monthly payroll & payslips",
        description: "Preview employee payouts, freeze & run monthly payroll, download individual and bulk payslips.",
        iconKey: "wallet",
        body: PAYROLL_OVERVIEW,
      },
      {
        slug: "pay-components",
        title: "Configure pay components & allowances",
        description: "Set up fixed and variable allowances, bonuses, deductions, and benefits that feed into monthly payroll.",
        iconKey: "wallet",
        body: PAY_COMPONENTS,
      },
    ],
  },
  {
    id: "attendance",
    title: "Attendance",
    description: "Selfie + GPS clock-in from the portal, the attendance log, and setup.",
    topics: [
      {
        slug: "attendance-overview",
        title: "Attendance & clock-in",
        description: "Turn on selfie + GPS clock-in, read the on-site confidence signal, and review the attendance log.",
        iconKey: "clock",
        body: ATTENDANCE,
      },
    ],
  },
  {
    id: "workspace",
    title: "Your Workspace",
    description: "Day-to-day surfaces: your tasks, inbox, pending SOP updates, announcements, and trash.",
    topics: [
      {
        slug: "tasks",
        title: "Tasks",
        description: "A Reminders-style to-do list — lists, projects, board and calendar views, and portal-visible assignments.",
        iconKey: "workflow",
        body: TASKS,
      },
      {
        slug: "inbox",
        title: "Inbox",
        description: "Track what's waiting: contracts, SOPs, forms, and decisions that need your attention.",
        iconKey: "mail",
        body: INBOX,
      },
      {
        slug: "pending",
        title: "Pending",
        description: "Review and approve SOP changes suggested by your meeting transcripts.",
        iconKey: "history",
        body: PENDING,
      },
      {
        slug: "spotlight",
        title: "Spotlight",
        description: "Send internal announcements with priority levels, acknowledgement tracking, and scheduling.",
        iconKey: "star",
        body: SPOTLIGHT,
      },
      {
        slug: "trash",
        title: "Trash & recovery",
        description: "Restore accidentally deleted items or permanently purge them within the 30-day recovery window.",
        iconKey: "door-out",
        body: TRASH,
      },
    ],
  },
  {
    id: "portal",
    title: "Employee Portal",
    description: "The public, login-free page your team and candidates use.",
    topics: [
      {
        slug: "portal-about",
        title: "About the Portal",
        description: "What the employee portal is, who it's for, and what each employee sees.",
        iconKey: "globe",
        body: PORTAL_ABOUT,
      },
      {
        slug: "portal-candidate-onboarding",
        title: "Candidate onboarding",
        description: "The guided flow new hires walk through before their start date — contract review, sign, personal info, documents.",
        iconKey: "sparkles",
        body: PORTAL_CANDIDATE_ONBOARDING,
      },
      {
        slug: "portal-share",
        title: "Sharing the Portal",
        description: "Distribute employee portal links via WhatsApp, QR code, or print.",
        iconKey: "eye",
        body: PORTAL_SHARE,
      },
      {
        slug: "portal-customize",
        title: "Customizing the Portal",
        description: "Branding, sections, language, and pinned announcements.",
        iconKey: "settings",
        body: PORTAL_CUSTOMIZE,
      },
    ],
  },
  {
    id: "integrations",
    title: "Integrations",
    description: "Connect Flodok to the tools your team already uses.",
    topics: [
      {
        slug: "integrations-overview",
        title: "Connect external integrations",
        description: "Link Flodok to Fireflies and Asana to automate meeting notes and task creation.",
        iconKey: "plug",
        body: INTEGRATIONS_OVERVIEW,
      },
      {
        slug: "integrations-fireflies",
        title: "Fireflies",
        description: "Pipe meeting transcripts and action items straight into your 1:1s.",
        iconKey: "plug",
        body: INTEGRATIONS_FIREFLIES,
      },
    ],
  },
  {
    id: "settings",
    title: "Settings",
    description: "Organization details, time zones, language, approvals, and badges.",
    topics: [
      {
        slug: "settings-org",
        title: "Organization Settings",
        description: "Legal name, display name, logo, address, and contact roles.",
        iconKey: "settings",
        body: SETTINGS_ORG,
      },
      {
        slug: "settings-timezones",
        title: "Time Zones (WIB / WITA / WIT)",
        description: "Indonesia's three time zones, how the org default works, and per-user overrides.",
        iconKey: "clock",
        body: SETTINGS_TIMEZONES,
      },
      {
        slug: "settings-language",
        title: "Languages (Bahasa & English)",
        description: "Per-user and org-default language. How content authoring relates to UI language.",
        iconKey: "language",
        body: SETTINGS_LANGUAGE,
      },
      {
        slug: "settings-approvals",
        title: "Set up request approvals",
        description: "Configure who approves leave and overtime requests, and whether owner sign-off is required.",
        iconKey: "handshake",
        body: SETTINGS_APPROVALS,
      },
      {
        slug: "settings-achievements",
        title: "Enable and manage badges",
        description: "Set up achievement badges — awards for tenure, compensation milestones, leaderboard rank, and custom recognitions.",
        iconKey: "star",
        body: SETTINGS_ACHIEVEMENTS,
      },
    ],
  },
  {
    id: "billing",
    title: "Account & Billing",
    description: "Plans, payment methods, and invoices with Faktur Pajak.",
    topics: [
      {
        slug: "billing-manage",
        title: "Managing Billing",
        description: "Upgrade, downgrade, cancel, and what happens to your data if you leave.",
        iconKey: "wallet",
        body: BILLING_MANAGE,
      },
      {
        slug: "billing-payment",
        title: "Payment Methods",
        description: "BCA, Mandiri, e-wallets, QRIS, credit cards, and international wires.",
        iconKey: "card",
        body: BILLING_PAYMENT,
      },
      {
        slug: "billing-invoices",
        title: "Invoices & Faktur Pajak",
        description: "Standard invoices, e-Faktur for PKP organizations, and kuitansi on demand.",
        iconKey: "receipt",
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
        a: <P>Yes — the Free plan covers organizations of up to 2 employees forever, with 1 SOP and 1 contract per employee plus the public portal. Beyond that you'll need Pro, which uses graduated per-employee pricing starting at Rp 300,000/month for 3 employees.</P>,
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
        a: <P>Add your NPWP on the Company page (Profile tab) and it appears on your invoices. For a formal Faktur Pajak on a paid invoice, contact support.</P>,
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
    id: 'hiring',
    title: 'Recruitment',
    items: [
      {
        q: 'How does recruitment work in Flodok?',
        a: <P>Candidates and employees live in the same database — what changes is their <em>lifecycle stage</em>. Add a candidate, move them through Prospective → Shortlisted → Offered → Signed → Active. The Recruitment page surfaces the funnel; once a candidate's start date arrives they auto-graduate to the Employees directory. See <Link to="/help/docs/hiring-funnel">The hiring funnel</Link>.</P>,
      },
      {
        q: 'Do I need to fill out a contract for every offer on the spot?',
        a: <P>No. Click <strong>Make offer</strong> and Flodok creates a draft contract from your <Link to="/help/docs/contract-templates">job-position template</Link>. The candidate flips to Offered immediately so you keep moving through interviews; come back later to finalise the contract in a batch and share their portal link when ready.</P>,
      },
      {
        q: "What if I haven't set up a contract template?",
        a: <P>Make offer still works — it just creates a blank draft. You'll spend a few minutes filling in standard clauses. The next offer for the same position is the right time to save your work as a template so future offers auto-fill.</P>,
      },
      {
        q: 'How does the candidate sign the contract?',
        a: <P>Once you Activate the contract, share the candidate's portal link (most teams use WhatsApp). They open the link, walk through the onboarding flow — contract review → typed signature → personal info → upload KTP/KK — and they're set for day one. See <Link to="/help/docs/portal-candidate-onboarding">Candidate onboarding</Link>.</P>,
      },
      {
        q: "What about candidates we don't hire?",
        a: <P>Two options: <strong>Move to talent pool</strong> keeps them as a soft no — searchable, re-engageable later. <strong>Delete</strong> removes the record permanently. Most teams use the talent pool generously and reserve delete for typos.</P>,
      },
      {
        q: 'How do I record an employee leaving?',
        a: <P>Open the employee's profile and use <strong>Mark as resigned</strong> (voluntary) or <strong>Terminate employment</strong> (involuntary) on the sidebar. Both capture last working day + an optional reason. The employee moves to the Separated tab; nothing is deleted.</P>,
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
