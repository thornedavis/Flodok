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
      Go to <strong>Documents → SOPs → New SOP</strong>. Write the EN
      side of the first block (or hit <strong>AI Generate</strong> and
      describe what you want) — Flodok translates the ID side on save,
      and you can edit either language directly. Save as draft, then
      click <strong>Publish</strong> when ready. Your team sees it
      immediately on their portal.
    </P>

    <H3 id="hiring">5. Bring on your first hire</H3>
    <P>
      When you're ready to interview candidates, head to{' '}
      <strong>Hiring</strong>. You can add candidates in seconds (just a
      name + phone), make decisions through the funnel (Prospective →
      Shortlisted → Offered), and once you click <strong>Make offer</strong>{' '}
      Flodok auto-creates a draft contract from your{' '}
      <Link to="/help/docs/contract-templates">position template</Link>{' '}
      and a portal link the candidate uses to e-sign and submit their
      personal info.
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
      Flodok's editor is bilingual by design — every SOP is authored in
      both English and Bahasa Indonesia, paired block-by-block. The
      editor renders the two languages side-by-side or stacked (your
      choice, remembered per-doc), so reviewers can keep the two
      versions aligned as the document evolves.
    </P>

    <H3 id="create">Creating a new SOP</H3>
    <Steps
      items={[
        <>From the dashboard, go to <strong>Documents</strong>, choose the <strong>SOPs</strong> tab, and click <strong>New SOP</strong>.</>,
        <>Give it a title and (optionally) a department. Both are searchable.</>,
        <>Write the EN side; Flodok translates the missing ID side on save (and vice versa). Or fill in both — the editor's BubbleMenu has a <strong>Translate</strong> action for the selected text.</>,
        <>Group related sentences into the same <strong>block</strong> so translation parity stays clean. Hit <strong>+ Block</strong> for a new paired block, or <strong>+ Section</strong> to start a new titled section.</>,
        <>Click <strong>Save draft</strong> to come back later, or <strong>Publish</strong> to make it live.</>,
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
        <>Use <strong>section titles</strong> generously — they become the document's outline and survive reordering.</>,
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
      pages, or Word files. The bilingual editor is structured (paired
      EN/ID per block), so importing is a slightly more deliberate act
      than dumping a markdown file — but in practice it's still quick.
    </P>

    <H3 id="paste">Paste from Google Docs / Notion</H3>
    <P>
      Open your source doc, select all, copy. In Flodok, create a new
      SOP and paste into the EN side of the first block — headings,
      lists, tables, and links carry over. Flodok will translate the
      ID side on the first save. Use <strong>+ Section</strong> to
      break the dump into logical sections after pasting.
    </P>

    <H3 id="ai">Generate from a prompt</H3>
    <P>
      If you don't have an existing doc to paste, click{' '}
      <strong>AI Generate</strong> in the editor toolbar and describe
      the SOP you want. Flodok drafts a fully bilingual structured doc
      (sections + blocks, EN + ID) that you can refine. Faster than
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

// ─── Hiring ──────────────────────────────────────────────

const HIRING_FUNNEL: ReactNode = (
  <>
    <P>
      Flodok models hiring as a single funnel that lives alongside your
      employee directory — candidates are stored in the same table as your
      active staff, surfaced on a different page, and graduate over to the
      Employees list automatically once they start. No transfer step, no
      duplicate entry.
    </P>

    <H3 id="stages">The five stages</H3>
    <P>
      Every candidate sits in one of these <strong>lifecycle stages</strong>.
      The stage drives where they appear in the app and which actions are
      available on them.
    </P>
    <Bullets
      items={[
        <><strong>Prospective</strong> — you've met them or added their info; no decision yet.</>,
        <><strong>Shortlisted</strong> — interviewer says yes, awaiting final sign-off from a higher-up. Skip this stage if you don't have multi-stakeholder hiring.</>,
        <><strong>Offered</strong> — final yes, draft contract created and waiting for you to finish.</>,
        <><strong>Signed</strong> — candidate has e-signed the contract; awaiting their start date.</>,
        <><strong>Talent pool</strong> — declined for now but worth keeping in touch with. Lives outside the main funnel.</>,
      ]}
    />

    <H3 id="auto-graduate">Auto-graduation to Employees</H3>
    <P>
      The moment a Signed candidate's <strong>start date</strong> arrives, they
      flip to <strong>Active</strong> and disappear from Hiring, reappearing in
      the Employees directory. This happens lazily — on the next Hiring page
      load and on the next time the candidate opens their portal — so
      there's no nightly job to wait for. If you set the start date for next
      Monday and they sign on Friday, Monday morning they're an employee.
    </P>

    <H3 id="filters">Tabs, filters, and inline status changes</H3>
    <Bullets
      items={[
        <>The tabs at the top of <strong>Hiring</strong> are quick filters with live counts. The <strong>Stage</strong> dropdown next to search is multi-select for combining stages (e.g. Shortlisted + Offered).</>,
        <>The status badge in each row is a <em>dropdown</em> — click it to switch a candidate's stage in one tap. Use the row's <strong>Actions</strong> menu for stage transitions that have side effects (Make offer creates a contract; Delete is destructive).</>,
        <>The WhatsApp icon on every row opens <code>wa.me/&lt;phone&gt;</code> in a new tab — handy for pinging the candidate before or after the interview.</>,
      ]}
    />

    <Callout type="note">
      Hiring stages and the <strong>Active / Probation / Separated</strong>{' '}
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
      The Hiring page is designed for the actual rhythm of running interviews:
      add a candidate in 10 seconds, deal with details later.
    </P>

    <H3 id="add">Adding a candidate</H3>
    <P>
      Click <strong>Add candidate</strong> on the Hiring page. The minimum
      is just a name; phone, position, department, photo, and notes are
      optional. The candidate is saved as <strong>Prospective</strong> and
      shows up immediately on the list.
    </P>
    <Bullets
      items={[
        <><strong>Job position</strong> and <strong>Department</strong> are dropdowns sourced from your <Link to="/dashboard/company?tab=structure">Company → Structure</Link> lists. Each field has a <strong>Manage →</strong> link if you need to add a value first.</>,
        <><strong>Photo</strong> uploads after the candidate row exists, so you can pick one when adding or come back later via the Edit modal.</>,
        <><strong>Notes</strong> is a free-text scratchpad — anything worth remembering for the next conversation.</>,
      ]}
    />

    <H3 id="edit">Editing later</H3>
    <P>
      Click any row to reopen the same modal in edit mode and update fields,
      photo, or notes. Stage changes happen via the badge dropdown or the
      Actions menu — not from inside the modal.
    </P>

    <H3 id="shortlist">Shortlisting</H3>
    <P>
      For organizations where the front-line interviewer recommends but a
      higher-up decides, use the <strong>Shortlist</strong> action on a
      Prospective candidate. Shortlisted candidates are amber-badged and
      live in their own tab. From Shortlisted, the next step is{' '}
      <strong>Make offer</strong> (the final yes) or back to Prospective if
      the conversation reopens.
    </P>
    <Callout type="tip">
      If you're a one-person operation, skip Shortlisted and go straight
      from Prospective → Make offer. The stage is optional and only useful
      when there's a real review step.
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
      already linked to them. If you've set up a contract template for
      their job position, the draft is auto-filled from it; otherwise it
      starts blank.
    </P>

    <H3 id="flow">The flow</H3>
    <Steps
      items={[
        <>On the candidate row (Prospective or Shortlisted), open <strong>Actions → Make offer</strong>. The Make offer modal shows the candidate's job position and looks up the matching template.</>,
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
      Rolling back is easy. From an Offered candidate, the Actions menu
      has <strong>Withdraw offer</strong> (back to Shortlisted, preserving
      the prior decision) or <strong>Move to talent pool</strong>. The
      draft contract stays attached to them — useful if the offer comes
      back on, awkward if you wanted it gone, so delete it manually from
      the Contracts page if needed.
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

    <H3 id="from-candidate">From a candidate (recommended)</H3>
    <P>
      Most contracts get created automatically when you click{' '}
      <strong>Make offer</strong> on a Hiring candidate — the contract is
      drafted from your{' '}
      <Link to="/help/docs/contract-templates">position template</Link>{' '}
      (if you have one) and linked to that candidate. See{' '}
      <Link to="/help/docs/hiring-offers">Making an offer</Link> for the
      full flow.
    </P>

    <H3 id="from-scratch">From scratch on the Contracts page</H3>
    <P>
      <strong>Contracts → Create Contract</strong>. Pick a contract type
      (<strong>PKWT</strong> fixed-term or <strong>PKWTT</strong> permanent),
      enter the basics (employee, salary, dates), and Flodok seeds the
      new contract with a fully bilingual structured starter — both EN
      and ID sides pre-filled with the standard Indonesian clauses for
      that type. You can then edit it like any other contract.
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
    <P>
      Templates live in their own area (the <strong>Templates</strong>{' '}
      tab under Contracts) with a slim editor: same bilingual document
      shape and merge tags as contracts, minus the versioning, signing,
      and employee-link plumbing — a template is a starter, not an
      issued document.
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
      The employee portal is each employee's private home in Flodok — their
      contract, payslips, SOPs, badges, and announcements. Each employee
      has their own URL of the form{' '}
      <code>flodok.com/portal/&lt;name-slug&gt;-&lt;token&gt;</code>, generated
      when they're added. The URL works without a login; it acts as the
      access credential.
    </P>

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
      When a new hire opens their portal link before their start date,
      they're walked through a guided onboarding flow before getting
      the regular portal. Six steps, one screen at a time, mobile-first.
    </P>

    <H3 id="when">When the flow appears</H3>
    <P>
      The portal detects the candidate's <strong>lifecycle stage</strong> on
      load. If they're <strong>Offered</strong> or <strong>Signed</strong>{' '}
      and haven't dismissed the flow this session, the onboarding takes
      over. The moment their <strong>start date</strong> passes (or they
      click <strong>Enter your portal</strong> on the Done screen), the
      regular portal renders instead.
    </P>

    <H3 id="steps">The six steps</H3>
    <Bullets
      items={[
        <><strong>1. Welcome</strong> — branded greeting with the org name; one-button start.</>,
        <><strong>2. Sign your contract</strong> — embedded contract with merge tags resolved; the signer must scroll to the bottom before the sign button enables. Type their name, pick a signature font (4 options), tick the consent checkbox, sign. On signing, their lifecycle flips from Offered to Signed.</>,
        <><strong>3. A bit about you</strong> — KTP NIK, date of birth, place of birth, current address, postal code.</>,
        <><strong>4. Tax &amp; banking</strong> — NPWP (15 or 16 digit), bank name, account number, account holder. Skip-friendly.</>,
        <><strong>5. Emergency contact</strong> — one contact: name, relationship, phone. Editable later via <strong>Employees → [employee] → Personal</strong>. Skip-friendly (all-blank submit advances).</>,
        <><strong>6. Upload your documents</strong> — KTP photo + Surat KK photo. Each upload persists immediately. <strong>Skip for now</strong> available to defer.</>,
      ]}
    />

    <H3 id="resume">Resuming mid-flow</H3>
    <P>
      If a candidate closes the tab and comes back, the flow remembers
      where to start: signed candidates skip the contract step, and the
      personal-info / docs steps are pre-filled with whatever's already
      on their record (so re-entering only changes things they re-type).
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
    id: 'hiring',
    title: 'Hiring',
    description: 'The candidate-to-employee funnel — interview decisions, offers, and onboarding.',
    topics: [
      {
        slug: 'hiring-funnel',
        title: 'The hiring funnel',
        description: 'How lifecycle stages work, what each one means, and how candidates auto-graduate to employees.',
        iconKey: 'workflow',
        body: HIRING_FUNNEL,
      },
      {
        slug: 'hiring-candidates',
        title: 'Adding & managing candidates',
        description: 'Adding candidates fast, shortlisting, the talent pool, and inline status changes.',
        iconKey: 'users',
        body: HIRING_CANDIDATES,
      },
      {
        slug: 'hiring-offers',
        title: 'Making an offer',
        description: 'How Make offer creates a draft contract from your position template and links it to the candidate.',
        iconKey: 'handshake',
        body: HIRING_OFFERS,
      },
      {
        slug: 'hiring-separation',
        title: 'Resignations & terminations',
        description: 'Recording an employee leaving — voluntary vs involuntary — and where their record goes.',
        iconKey: 'door-out',
        body: HIRING_SEPARATION,
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
        description: 'Use the bilingual editor and AI Generate to write SOPs your team will actually read.',
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
    description: 'Draft, sign, and store Indonesian employment contracts (PKWT and PKWTT) — with reusable templates.',
    topics: [
      {
        slug: 'contracts-create',
        title: 'Creating Contracts',
        description: 'PKWT vs PKWTT, merge fields, and how the candidate flow auto-creates contracts.',
        iconKey: 'file',
        body: CONTRACTS_CREATE,
      },
      {
        slug: 'contract-templates',
        title: 'Contract Templates',
        description: 'Define a reusable contract per job position so new offers auto-fill in seconds.',
        iconKey: 'briefcase',
        body: CONTRACT_TEMPLATES,
      },
      {
        slug: 'contracts-sign',
        title: 'E-signatures',
        description: "Legally enforceable e-signing under UU 11/2008 (ITE), with structured audit trail.",
        iconKey: 'pen',
        body: CONTRACTS_SIGN,
      },
      {
        slug: 'contracts-history',
        title: 'Contract History',
        description: 'Versioning and signature pinning for signed contracts.',
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
        description: "What the employee portal is, who it's for, and what each employee sees.",
        iconKey: 'globe',
        body: PORTAL_ABOUT,
      },
      {
        slug: 'portal-candidate-onboarding',
        title: 'Candidate onboarding',
        description: "The guided flow new hires walk through before their start date — contract review, sign, personal info, documents.",
        iconKey: 'sparkles',
        body: PORTAL_CANDIDATE_ONBOARDING,
      },
      {
        slug: 'portal-share',
        title: 'Sharing the Portal',
        description: 'Distribute employee portal links via WhatsApp, QR code, or print.',
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
    id: 'hiring',
    title: 'Hiring',
    items: [
      {
        q: 'How does hiring work in Flodok?',
        a: <P>Candidates and employees live in the same database — what changes is their <em>lifecycle stage</em>. Add a candidate, move them through Prospective → Shortlisted → Offered → Signed → Active. The Hiring page surfaces the funnel; once a candidate's start date arrives they auto-graduate to the Employees directory. See <Link to="/help/docs/hiring-funnel">The hiring funnel</Link>.</P>,
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
