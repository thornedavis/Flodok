import { LegalPage } from '../../components/PublicSiteLayout'

export function Terms() {
  return (
    <LegalPage
      title="Terms of Service"
      lastUpdated="April 27, 2026"
      intro={
        <p>
          These Terms of Service ("<strong>Terms</strong>") govern your access to and use of
          Flodok, a software-as-a-service platform operated by Flodok ("<strong>Flodok</strong>",
          "<strong>we</strong>", "<strong>us</strong>"). By creating an account or using the service,
          you agree to these Terms. If you don't agree, don't use Flodok.
        </p>
      }
      sections={[
        {
          id: 'acceptance',
          label: '1. Acceptance',
          heading: '1. Acceptance of Terms',
          body: (
            <>
              <p>
                By accessing or using Flodok, you confirm that you have read, understood, and agree to
                be bound by these Terms and our <a href="/privacy">Privacy Policy</a>. If you are using
                Flodok on behalf of an organization, you represent that you have authority to bind that
                organization to these Terms.
              </p>
              <p>
                We may update these Terms from time to time. Material changes will be communicated
                through the product or by email at least 14 days in advance. Continued use after the
                effective date constitutes acceptance.
              </p>
            </>
          ),
        },
        {
          id: 'definitions',
          label: '2. Definitions',
          heading: '2. Definitions',
          body: (
            <ul>
              <li><strong>Account</strong> — your registered Flodok user account.</li>
              <li><strong>Customer</strong> — the organization or individual that subscribes to Flodok.</li>
              <li><strong>Customer Data</strong> — any content uploaded to or generated within Flodok by Customer or its end users.</li>
              <li><strong>End User</strong> — any individual authorized by Customer to use Flodok (employees, contractors, viewers).</li>
              <li><strong>Service</strong> — the Flodok web application, employee portal, APIs, and related services.</li>
            </ul>
          ),
        },
        {
          id: 'eligibility',
          label: '3. Eligibility',
          heading: '3. Eligibility',
          body: (
            <p>
              You must be at least 18 years old and capable of entering into a legally binding contract
              under Indonesian law. You may not use the Service if you are barred from doing so under
              applicable law, or if your account has previously been terminated for breach.
            </p>
          ),
        },
        {
          id: 'account',
          label: '4. Accounts',
          heading: '4. Account Registration & Security',
          body: (
            <>
              <p>
                To access most features, you must register an account with accurate, current, and
                complete information. You are responsible for maintaining the confidentiality of your
                credentials and for all activity under your account.
              </p>
              <p>
                Notify us immediately at <a href="mailto:security@flodok.com">security@flodok.com</a> of
                any unauthorized access. We are not liable for losses caused by your failure to keep
                credentials secure.
              </p>
            </>
          ),
        },
        {
          id: 'subscription',
          label: '5. Plans & Billing',
          heading: '5. Subscription Plans & Billing',
          body: (
            <>
              <p>
                Flodok is offered on subscription plans described on our{' '}
                <a href="/pricing">pricing page</a>. By selecting a paid plan you authorize us, or our
                payment processor, to charge the applicable fees.
              </p>
              <p>
                Fees are quoted in Indonesian Rupiah (IDR) and exclude applicable taxes (PPN). Monthly
                plans renew automatically each month. Annual plans renew automatically each year unless
                cancelled at least 7 days before the renewal date.
              </p>
              <p>
                We may revise pricing with at least 30 days' notice, effective at the start of your next
                billing period. Outstanding balances unpaid for more than 30 days may result in
                suspension of the Service.
              </p>
            </>
          ),
        },
        {
          id: 'free-trial',
          label: '6. Free Plan & Trials',
          heading: '6. Free Plan & Trials',
          body: (
            <p>
              The Starter plan is free for organizations of up to 10 employees. Trials of paid plans
              may be offered at our discretion. We may modify or discontinue free plans and trials at
              any time. Free accounts inactive for 12 months may be deleted with 30 days' notice.
            </p>
          ),
        },
        {
          id: 'customer-data',
          label: '7. Customer Data',
          heading: '7. Customer Data & Ownership',
          body: (
            <>
              <p>
                You retain all rights to Customer Data. By using the Service, you grant Flodok a
                limited, non-exclusive, worldwide licence to host, copy, transmit, display, and process
                Customer Data solely as needed to operate and improve the Service.
              </p>
              <p>
                You are solely responsible for the accuracy, legality, and content of Customer Data,
                including obtaining all necessary consents from your employees and contractors before
                uploading their personal information.
              </p>
              <p>
                Our processing of personal data is governed by the{' '}
                <a href="/dpa">Data Processing Agreement</a> and our{' '}
                <a href="/privacy">Privacy Policy</a>.
              </p>
            </>
          ),
        },
        {
          id: 'license',
          label: '8. Licence to Use',
          heading: '8. Licence to Use Flodok',
          body: (
            <>
              <p>
                Subject to these Terms and your payment of applicable fees, Flodok grants you a
                limited, non-exclusive, non-transferable, revocable licence to access and use the
                Service for your internal business purposes during your subscription term.
              </p>
              <p>The licence does not permit you to:</p>
              <ul>
                <li>Reverse engineer, decompile, or attempt to derive source code from the Service;</li>
                <li>Resell, sublicense, or commercially exploit the Service except as expressly permitted;</li>
                <li>Use the Service to build a competing product;</li>
                <li>Remove or alter any proprietary notices.</li>
              </ul>
            </>
          ),
        },
        {
          id: 'acceptable-use',
          label: '9. Acceptable Use',
          heading: '9. Acceptable Use',
          body: (
            <>
              <p>You agree not to use the Service to:</p>
              <ul>
                <li>Violate any applicable law or third-party right;</li>
                <li>Upload malware, viruses, or any harmful code;</li>
                <li>Send spam or unsolicited communications;</li>
                <li>Attempt to gain unauthorized access to systems or accounts;</li>
                <li>Interfere with or disrupt the integrity or performance of the Service;</li>
                <li>Harass, threaten, or harm other users;</li>
                <li>Upload content that is unlawful, defamatory, obscene, or infringing.</li>
              </ul>
              <p>We may suspend or terminate accounts for violations.</p>
            </>
          ),
        },
        {
          id: 'confidentiality',
          label: '10. Confidentiality',
          heading: '10. Confidentiality',
          body: (
            <p>
              Each party agrees to protect the other's Confidential Information using the same degree
              of care it uses to protect its own (and at least reasonable care). Confidential
              Information does not include information that is publicly available, independently
              developed, or rightfully received from a third party without confidentiality obligations.
            </p>
          ),
        },
        {
          id: 'termination',
          label: '11. Termination',
          heading: '11. Termination',
          body: (
            <>
              <p>
                You may cancel your subscription at any time from the billing settings. Cancellation
                takes effect at the end of the current billing period; we don't refund partial months.
              </p>
              <p>
                We may suspend or terminate your access immediately if you breach these Terms, fail to
                pay fees when due, or use the Service in a way that creates legal liability or risk to
                other users.
              </p>
              <p>
                On termination, you may export your Customer Data within 30 days. After that, we may
                permanently delete it.
              </p>
            </>
          ),
        },
        {
          id: 'warranties',
          label: '12. Warranties',
          heading: '12. Warranties & Disclaimers',
          body: (
            <p>
              The Service is provided <strong>"as is" and "as available"</strong>. To the maximum
              extent permitted by law, Flodok disclaims all warranties, express or implied, including
              merchantability, fitness for a particular purpose, and non-infringement. We don't
              warrant that the Service will be uninterrupted, error-free, or completely secure.
            </p>
          ),
        },
        {
          id: 'liability',
          label: '13. Liability',
          heading: '13. Limitation of Liability',
          body: (
            <p>
              To the maximum extent permitted by law, Flodok's aggregate liability arising out of or
              relating to the Service shall not exceed the fees paid by you to Flodok in the twelve
              (12) months preceding the event giving rise to the claim. In no event shall Flodok be
              liable for indirect, incidental, special, consequential, or punitive damages (including
              lost profits, lost data, or business interruption), even if advised of the possibility.
            </p>
          ),
        },
        {
          id: 'indemnification',
          label: '14. Indemnification',
          heading: '14. Indemnification',
          body: (
            <p>
              You agree to indemnify and hold harmless Flodok, its officers, employees, and agents
              from any claims, damages, losses, and expenses (including legal fees) arising from your
              use of the Service, your Customer Data, or your breach of these Terms.
            </p>
          ),
        },
        {
          id: 'governing-law',
          label: '15. Governing Law',
          heading: '15. Governing Law & Disputes',
          body: (
            <p>
              These Terms are governed by the laws of the Republic of Indonesia, without regard to
              conflict-of-law principles. Disputes arising from these Terms shall be resolved through
              good-faith negotiation; failing resolution, exclusively by the District Court of Central
              Jakarta (Pengadilan Negeri Jakarta Pusat).
            </p>
          ),
        },
        {
          id: 'changes',
          label: '16. Changes',
          heading: '16. Changes to Terms',
          body: (
            <p>
              We may update these Terms from time to time. We'll post the revised version with an
              updated "Last updated" date and, for material changes, notify you in product or by
              email at least 14 days before they take effect.
            </p>
          ),
        },
        {
          id: 'contact',
          label: '17. Contact',
          heading: '17. Contact',
          body: (
            <p>
              Questions about these Terms? Email{' '}
              <a href="mailto:legal@flodok.com">legal@flodok.com</a> or write to us at Flodok,
              Jakarta, Indonesia.
            </p>
          ),
        },
      ]}
    />
  )
}
