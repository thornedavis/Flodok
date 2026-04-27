import { LegalPage } from '../../components/PublicSiteLayout'

export function Dpa() {
  return (
    <LegalPage
      title="Data Processing Agreement"
      lastUpdated="April 27, 2026"
      intro={
        <p>
          This Data Processing Agreement ("<strong>DPA</strong>") forms part of the agreement between
          you ("<strong>Customer</strong>", acting as Data Controller) and Flodok (acting as Data
          Processor) for the processing of personal data through the Service. It is designed to
          comply with Indonesia's UU 27/2022 (UU PDP) and to provide GDPR-equivalent safeguards.
        </p>
      }
      sections={[
        {
          id: 'definitions',
          label: '1. Definitions',
          heading: '1. Definitions',
          body: (
            <ul>
              <li><strong>Personal Data</strong> — any information relating to an identified or identifiable natural person.</li>
              <li><strong>Processing</strong> — any operation performed on Personal Data, manual or automated.</li>
              <li><strong>Data Subject</strong> — the individual to whom Personal Data relates (typically Customer's employees, contractors, or end users).</li>
              <li><strong>Subprocessor</strong> — a third party engaged by Flodok to process Personal Data on behalf of Customer.</li>
              <li><strong>Personal Data Breach</strong> — a confirmed breach of security leading to unlawful destruction, loss, alteration, or unauthorized disclosure of Personal Data.</li>
            </ul>
          ),
        },
        {
          id: 'subject',
          label: '2. Subject matter',
          heading: '2. Subject matter & duration',
          body: (
            <>
              <p>
                Flodok processes Personal Data on behalf of Customer solely for the purpose of
                providing the Service as described in our <a href="/terms">Terms of Service</a>.
                Categories of Personal Data and Data Subjects are described in <strong>Annex I</strong>{' '}
                below.
              </p>
              <p>
                Processing continues for the duration of Customer's subscription. On termination,
                Personal Data is retained for 30 days for export, then deleted as described in
                Section 12.
              </p>
            </>
          ),
        },
        {
          id: 'instructions',
          label: '3. Instructions',
          heading: '3. Customer instructions',
          body: (
            <p>
              Flodok processes Personal Data only on documented instructions from Customer, including
              with regard to international transfers. Customer's use of the Service constitutes its
              instructions to Flodok. Flodok will inform Customer if it believes an instruction
              violates applicable data protection law.
            </p>
          ),
        },
        {
          id: 'confidentiality',
          label: '4. Confidentiality',
          heading: '4. Confidentiality of personnel',
          body: (
            <p>
              Flodok ensures that personnel authorized to process Personal Data are bound by written
              confidentiality obligations and have received appropriate data protection training.
              Access is limited to personnel who need it to perform their duties.
            </p>
          ),
        },
        {
          id: 'security',
          label: '5. Security',
          heading: '5. Security measures',
          body: (
            <p>
              Flodok implements appropriate technical and organizational measures to protect Personal
              Data against unauthorized or unlawful processing, accidental loss, destruction, or
              damage. A summary is set out in <strong>Annex II</strong> below; details are available
              on our <a href="/security">Security page</a>.
            </p>
          ),
        },
        {
          id: 'subprocessors',
          label: '6. Subprocessors',
          heading: '6. Subprocessing',
          body: (
            <>
              <p>
                Customer authorizes Flodok to engage Subprocessors listed in{' '}
                <strong>Annex III</strong>. Flodok will:
              </p>
              <ul>
                <li>Impose data protection obligations on Subprocessors no less protective than those in this DPA;</li>
                <li>Remain liable for Subprocessor performance;</li>
                <li>Notify Customer of changes to Subprocessors at least 30 days in advance, giving Customer the right to object on reasonable data protection grounds.</li>
              </ul>
            </>
          ),
        },
        {
          id: 'rights',
          label: '7. Data subject rights',
          heading: '7. Assistance with data subject rights',
          body: (
            <p>
              Flodok will assist Customer in fulfilling Customer's obligations to respond to Data
              Subject requests (access, correction, deletion, portability, restriction, objection)
              within the timelines set by UU PDP. Most requests can be fulfilled by Customer directly
              through the Service's admin tools.
            </p>
          ),
        },
        {
          id: 'breach',
          label: '8. Personal data breach',
          heading: '8. Personal data breach notification',
          body: (
            <>
              <p>
                Flodok will notify Customer without undue delay, and in any event within{' '}
                <strong>72 hours</strong>, after becoming aware of a Personal Data Breach affecting
                Customer's data. The notification will include:
              </p>
              <ul>
                <li>Nature of the breach (categories and approximate number of Data Subjects and records affected);</li>
                <li>Likely consequences;</li>
                <li>Measures taken or proposed to address the breach and mitigate effects;</li>
                <li>Contact for further information.</li>
              </ul>
              <p>
                Flodok will assist Customer in meeting its own breach-notification obligations to
                regulators and affected Data Subjects under UU PDP Article 46.
              </p>
            </>
          ),
        },
        {
          id: 'dpia',
          label: '9. DPIAs',
          heading: '9. Data protection impact assessments',
          body: (
            <p>
              On reasonable request, Flodok will provide Customer with information necessary to
              fulfil obligations to conduct data protection impact assessments and to consult with
              supervisory authorities, taking into account the nature of processing and information
              available to Flodok.
            </p>
          ),
        },
        {
          id: 'audits',
          label: '10. Audits',
          heading: '10. Audits',
          body: (
            <p>
              Customer may audit Flodok's compliance with this DPA once per year, on reasonable prior
              notice and during business hours, with reasonable steps to minimize disruption. Flodok
              may satisfy audit obligations by providing third-party audit reports (e.g., SOC 2 Type
              II) where appropriate. Customer bears its own audit costs.
            </p>
          ),
        },
        {
          id: 'transfers',
          label: '11. International transfers',
          heading: '11. International data transfers',
          body: (
            <p>
              Where Personal Data is transferred outside Indonesia, Flodok ensures appropriate
              safeguards are in place — including UU PDP-equivalent contractual clauses, transfers
              to jurisdictions with adequacy decisions, or Data Subject consent where appropriate.
              Primary processing occurs in Indonesia and Singapore.
            </p>
          ),
        },
        {
          id: 'deletion',
          label: '12. Deletion',
          heading: '12. Deletion or return of data',
          body: (
            <p>
              On termination of the Service, Flodok will delete or return all Personal Data
              processed on behalf of Customer within 30 days, except to the extent applicable law
              requires retention. Customer may export Personal Data through the Service's export
              tools at any time before deletion.
            </p>
          ),
        },
        {
          id: 'liability',
          label: '13. Liability',
          heading: '13. Liability',
          body: (
            <p>
              Each party's liability under this DPA is subject to the limitations and exclusions in
              the <a href="/terms">Terms of Service</a>. Nothing in this DPA limits liability that
              cannot lawfully be limited under applicable data protection law.
            </p>
          ),
        },
        {
          id: 'annex-i',
          label: 'Annex I — Subject matter',
          heading: 'Annex I — Subject matter, nature & purpose of processing',
          body: (
            <>
              <p><strong>Subject matter</strong>: SOP, contract, and people-management services.</p>
              <p><strong>Nature & purpose</strong>: storing, organizing, retrieving, displaying, transmitting, and deleting Personal Data as part of the Service.</p>
              <p><strong>Categories of Data Subjects</strong>:</p>
              <ul>
                <li>Customer's employees, contractors, and former employees;</li>
                <li>Customer's administrators and authorized users;</li>
                <li>Visitors to Customer's public employee portal.</li>
              </ul>
              <p><strong>Categories of Personal Data</strong>:</p>
              <ul>
                <li>Identification: name, email, phone, photo, employee ID;</li>
                <li>Employment: job title, department, start date, contract details, compensation (if uploaded);</li>
                <li>Performance: review notes, ratings, 1:1 records;</li>
                <li>Communications: messages, comments within the Service.</li>
              </ul>
            </>
          ),
        },
        {
          id: 'annex-ii',
          label: 'Annex II — Security',
          heading: 'Annex II — Technical & organizational measures',
          body: (
            <ul>
              <li><strong>Encryption</strong>: TLS 1.3 in transit, AES-256 at rest.</li>
              <li><strong>Access control</strong>: role-based access with least-privilege principles, MFA for all production access.</li>
              <li><strong>Authentication</strong>: bcrypt-hashed passwords, optional SSO and MFA for users.</li>
              <li><strong>Network security</strong>: firewall, DDoS protection, isolated production environment.</li>
              <li><strong>Logging & monitoring</strong>: audit logs of admin actions retained 12 months, intrusion detection.</li>
              <li><strong>Backups</strong>: encrypted daily backups, 30-day retention, tested restore procedures.</li>
              <li><strong>Vulnerability management</strong>: automated dependency scanning, quarterly penetration testing.</li>
              <li><strong>Personnel</strong>: background checks, confidentiality agreements, annual security training.</li>
              <li><strong>Incident response</strong>: documented playbook, on-call rotation, 72-hour breach notification SLA.</li>
              <li><strong>Physical</strong>: production data hosted in SOC 2 Type II certified data centres.</li>
            </ul>
          ),
        },
        {
          id: 'annex-iii',
          label: 'Annex III — Subprocessors',
          heading: 'Annex III — Authorized subprocessors',
          body: (
            <>
              <p>
                The following subprocessors are authorized to process Personal Data on behalf of
                Flodok in the provision of the Service:
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Subprocessor</th>
                    <th>Purpose</th>
                    <th>Location</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td>Supabase</td><td>Database, authentication, storage</td><td>Singapore</td></tr>
                  <tr><td>Cloudflare</td><td>CDN, DDoS protection, edge functions</td><td>Global (Indonesia POPs)</td></tr>
                  <tr><td>AWS</td><td>Backup storage</td><td>Singapore (ap-southeast-1)</td></tr>
                  <tr><td>Resend</td><td>Transactional email</td><td>United States</td></tr>
                  <tr><td>Midtrans</td><td>Payment processing (IDR)</td><td>Indonesia</td></tr>
                  <tr><td>Stripe</td><td>Payment processing (international)</td><td>United States, Singapore</td></tr>
                  <tr><td>Sentry</td><td>Error monitoring</td><td>United States</td></tr>
                  <tr><td>Plausible</td><td>Privacy-preserving analytics</td><td>European Union</td></tr>
                </tbody>
              </table>
              <p>
                Updates to this list will be communicated via email to billing contacts and
                published on this page at least 30 days before any new Subprocessor begins
                processing.
              </p>
            </>
          ),
        },
      ]}
    />
  )
}
