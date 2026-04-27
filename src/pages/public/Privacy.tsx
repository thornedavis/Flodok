import { LegalPage } from '../../components/PublicSiteLayout'

export function Privacy() {
  return (
    <LegalPage
      title="Privacy Policy"
      lastUpdated="April 27, 2026"
      intro={
        <p>
          This Privacy Policy explains how Flodok ("<strong>Flodok</strong>",
          "<strong>we</strong>", "<strong>us</strong>") collects, uses, shares, and protects your
          personal information. We comply with Indonesia's Personal Data Protection Law
          (Undang-Undang No. 27/2022 tentang Pelindungan Data Pribadi — "<strong>UU PDP</strong>")
          and apply GDPR-equivalent practices for international users.
        </p>
      }
      sections={[
        {
          id: 'who-we-are',
          label: '1. Who we are',
          heading: '1. Who we are',
          body: (
            <p>
              Flodok is a software-as-a-service platform for SOP, contract, and people management,
              operated by Flodok, headquartered in Jakarta, Indonesia. For purposes of UU PDP, Flodok
              is a <strong>Data Controller</strong> for personal data of account holders, and a{' '}
              <strong>Data Processor</strong> for personal data uploaded by Customers about their
              employees and contractors (governed by our{' '}
              <a href="/dpa">Data Processing Agreement</a>).
            </p>
          ),
        },
        {
          id: 'information-collected',
          label: '2. Information we collect',
          heading: '2. Information we collect',
          body: (
            <>
              <h3>2.1 Information you provide</h3>
              <ul>
                <li><strong>Account information</strong>: name, email, phone number, password (hashed), profile photo.</li>
                <li><strong>Organization information</strong>: company name, time zone, billing address, tax ID (NPWP).</li>
                <li><strong>Customer Data</strong>: SOPs, contracts, employee records, performance reviews you upload or create.</li>
                <li><strong>Payment information</strong>: handled by our payment processors (Midtrans, Stripe). Flodok does not store full card numbers.</li>
                <li><strong>Support communications</strong>: messages you send to support@flodok.com.</li>
              </ul>

              <h3>2.2 Information collected automatically</h3>
              <ul>
                <li><strong>Usage data</strong>: pages visited, features used, timestamps, referring URLs.</li>
                <li><strong>Device data</strong>: IP address, browser type, operating system, device identifiers.</li>
                <li><strong>Cookies</strong>: see Section 9.</li>
              </ul>

              <h3>2.3 Information from third parties</h3>
              <p>
                If you sign in via Google Workspace or another SSO provider, we receive basic profile
                information (name, email, photo) from that provider. We don't access your email,
                calendar, or other Google data without explicit permission.
              </p>
            </>
          ),
        },
        {
          id: 'how-we-use',
          label: '3. How we use information',
          heading: '3. How we use your information',
          body: (
            <>
              <p>We use personal data to:</p>
              <ul>
                <li>Provide, maintain, and improve the Service;</li>
                <li>Process payments and manage subscriptions;</li>
                <li>Send transactional communications (security alerts, billing notices, service updates);</li>
                <li>Respond to support requests;</li>
                <li>Detect and prevent fraud, abuse, or security incidents;</li>
                <li>Comply with legal obligations (tax, regulatory, court orders);</li>
                <li>Send product updates and marketing — only with your consent, and you can opt out anytime.</li>
              </ul>
              <p>
                We do <strong>not</strong> sell your personal data. We do <strong>not</strong> use
                Customer Data to train AI models or for marketing purposes.
              </p>
            </>
          ),
        },
        {
          id: 'legal-basis',
          label: '4. Legal basis',
          heading: '4. Legal basis for processing (UU PDP, GDPR)',
          body: (
            <>
              <p>We process personal data on the following legal bases:</p>
              <ul>
                <li><strong>Contract performance</strong> — to provide the Service you've subscribed to.</li>
                <li><strong>Legitimate interest</strong> — to operate, secure, and improve our service, where not overridden by your rights.</li>
                <li><strong>Consent</strong> — for marketing communications and optional features (you can withdraw consent anytime).</li>
                <li><strong>Legal obligation</strong> — to comply with Indonesian law, tax, and regulatory requirements.</li>
              </ul>
            </>
          ),
        },
        {
          id: 'sharing',
          label: '5. Sharing & disclosure',
          heading: '5. Sharing & disclosure',
          body: (
            <>
              <p>We share personal data only with:</p>
              <ul>
                <li><strong>Subprocessors</strong> who help us deliver the Service (hosting, email delivery, analytics, payment processing). Listed in our <a href="/dpa">DPA</a>.</li>
                <li><strong>Other users in your organization</strong>, as needed for the Service to function (e.g., your manager can see your performance review).</li>
                <li><strong>Authorities</strong>, when required by Indonesian law or valid legal process. We notify Customers of any government request unless legally prohibited.</li>
                <li><strong>Successors</strong>, in the event of a merger, acquisition, or asset sale — we will notify you and apply equivalent protections.</li>
              </ul>
              <p>We do not share, rent, or sell personal data to third-party advertisers.</p>
            </>
          ),
        },
        {
          id: 'transfers',
          label: '6. International transfers',
          heading: '6. International data transfers',
          body: (
            <p>
              Flodok hosts primary infrastructure on servers located in Indonesia and Singapore.
              Some subprocessors (e.g., transactional email, error monitoring) operate outside
              Indonesia. When transferring data internationally we apply contractual safeguards
              (Standard Contractual Clauses or equivalents) and ensure recipient countries provide
              adequate protection consistent with UU PDP Article 56.
            </p>
          ),
        },
        {
          id: 'retention',
          label: '7. Retention',
          heading: '7. Data retention',
          body: (
            <>
              <p>We retain personal data only as long as necessary for the purposes described:</p>
              <ul>
                <li><strong>Active accounts</strong> — for the duration of the subscription.</li>
                <li><strong>Cancelled accounts</strong> — Customer Data is retained for 30 days after termination, then permanently deleted (unless legally required to retain longer).</li>
                <li><strong>Billing records</strong> — 10 years, per Indonesian tax law.</li>
                <li><strong>Audit logs</strong> — 12 months.</li>
                <li><strong>Inactive free accounts</strong> — deleted after 12 months of inactivity, with 30 days' notice.</li>
              </ul>
            </>
          ),
        },
        {
          id: 'rights',
          label: '8. Your rights',
          heading: '8. Your rights under UU PDP',
          body: (
            <>
              <p>As a data subject, you have the right to:</p>
              <ul>
                <li><strong>Access</strong> your personal data;</li>
                <li><strong>Correct</strong> inaccurate or incomplete data;</li>
                <li><strong>Delete</strong> your data ("right to erasure");</li>
                <li><strong>Restrict or object</strong> to processing in certain circumstances;</li>
                <li><strong>Withdraw consent</strong> at any time, where consent is the legal basis;</li>
                <li><strong>Data portability</strong> — receive your data in a structured, machine-readable format;</li>
                <li><strong>Lodge a complaint</strong> with the Indonesian Personal Data Protection Authority (Lembaga PDP) or a relevant supervisory authority.</li>
              </ul>
              <p>
                To exercise any of these rights, email{' '}
                <a href="mailto:privacy@flodok.com">privacy@flodok.com</a>. We respond within 30 days
                as required by UU PDP Article 5.
              </p>
            </>
          ),
        },
        {
          id: 'cookies',
          label: '9. Cookies',
          heading: '9. Cookies & similar technologies',
          body: (
            <>
              <p>We use cookies and similar technologies for:</p>
              <ul>
                <li><strong>Essential</strong>: authentication, security, session management. Cannot be disabled.</li>
                <li><strong>Analytics</strong>: aggregate, privacy-preserving usage analytics (Plausible) — no third-party cookies, no cross-site tracking.</li>
                <li><strong>Preferences</strong>: remembering your theme (light/dark) and language (EN/ID).</li>
              </ul>
              <p>We do not use advertising or tracking cookies.</p>
            </>
          ),
        },
        {
          id: 'security',
          label: '10. Security',
          heading: '10. Security',
          body: (
            <p>
              We protect personal data with industry-standard measures: TLS 1.3 in transit, AES-256
              at rest, encrypted database backups, role-based access control with least-privilege,
              audit logging, and regular security reviews. Read more on our{' '}
              <a href="/security">Security page</a>. No system is 100% secure — in the unlikely event
              of a breach, we will notify affected users and authorities within 72 hours as required
              by UU PDP Article 46.
            </p>
          ),
        },
        {
          id: 'children',
          label: '11. Children',
          heading: '11. Children',
          body: (
            <p>
              Flodok is not directed to individuals under 18. We don't knowingly collect personal
              data from children. If you believe we've collected data from a child, please contact us
              and we will delete it.
            </p>
          ),
        },
        {
          id: 'changes',
          label: '12. Changes',
          heading: '12. Changes to this Policy',
          body: (
            <p>
              We may update this Privacy Policy. The "Last updated" date at the top reflects the most
              recent version. For material changes, we will notify you in product or by email at
              least 14 days in advance.
            </p>
          ),
        },
        {
          id: 'contact',
          label: '13. Contact',
          heading: '13. Contact us',
          body: (
            <>
              <p>
                Privacy questions, requests, or complaints can be sent to:
              </p>
              <ul>
                <li><strong>Data Protection Officer</strong>: <a href="mailto:dpo@flodok.com">dpo@flodok.com</a></li>
                <li><strong>General privacy</strong>: <a href="mailto:privacy@flodok.com">privacy@flodok.com</a></li>
                <li><strong>Security disclosures</strong>: <a href="mailto:security@flodok.com">security@flodok.com</a></li>
              </ul>
            </>
          ),
        },
      ]}
    />
  )
}
