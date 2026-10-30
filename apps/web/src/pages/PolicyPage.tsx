import { Link } from 'react-router-dom';
import { BookOpen, RotateCcw, ShieldCheck } from 'lucide-react';
import kriscelKSrc from '../assets/kriscel-k.jpeg';
type PolicyPageProps = {
  type: 'terms' | 'privacy' | 'refund';
};

const sections = {
  terms: {
    title: 'Terms and Conditions',
    updated: 'Last updated: October 30, 2026',
    introduction:
      'These Terms and Conditions govern your access to and use of Kriscel WA, operated by Kriscel Tech Private Limited (CIN: U63121DL2026PTC462568). By creating an account, purchasing a plan, or using the service, you agree to these terms.',
    content: [
      {
        heading: 'The service and your account',
        paragraphs: [
          'Kriscel WA is a B2B SaaS platform that provides tools for managing customer conversations, WhatsApp Business API integration, CRM, contacts, campaigns, message templates, chatbot automation, team inboxes, analytics, and related account features. The features available to you depend on your selected plan.',
          'You are responsible for providing accurate account information, protecting your sign-in credentials, and all activity conducted through your workspace. Notify us promptly at Info@kriscel.com if you believe your account has been accessed without permission.',
        ],
      },
      {
        heading: 'Plans, billing, and included messaging',
        paragraphs: [
          'Plan features, limits, price, currency, and billing interval are shown before you confirm a purchase. Plan prices charged in INR use the configured USD-to-INR conversion rate. Checkout adds GST at the applicable rate (currently 18%) to the converted plan price and shows the base price, GST amount, and total before payment.',
          `Each plan includes a defined monthly message allowance. Applicable Meta WhatsApp conversation charges for messages sent within your plan's allowance are included in the subscription price. Messages are counted against your plan limit as they are sent. Once the monthly allowance is reached, further outbound messages are blocked until the allowance resets or you upgrade to a higher plan. No additional per-message charges are applied beyond the subscription price for usage within the allowance.`,
          'Recurring subscription purchases renew for the selected billing interval until cancelled. You can request cancellation from the Billing page in your account. Cancellation takes effect at the end of the current paid billing period, and access continues until then.',
          'Prepaid plan purchases are one-time payments for the selected one-month or one-year term and do not automatically renew. Access ends when the paid term expires unless you purchase another term.',
          'Payment processing is handled by the payment provider shown at checkout (currently Razorpay or Cashfree). You authorize the applicable provider to process the payment for the amount displayed before you confirm. By completing a purchase, you acknowledge that you have read and agree to these Terms and Conditions, the Privacy Policy, and the Return/Refund/Cancellation Policy.',
        ],
      },
      {
        heading: 'Consent-based messaging and acceptable use',
        paragraphs: [
          'You must obtain explicit, informed consent from each end user before sending them messages through Kriscel WA. Campaigns can only be sent to contacts recorded as explicitly opted in; contacts with unknown consent status or an opt-out are automatically excluded. You must maintain records of how and when consent was obtained and honour opt-out requests promptly.',
          'You must use Kriscel WA in compliance with applicable law, including the Information Technology Act 2000 and any applicable data-protection regulations, as well as the terms and policies of WhatsApp, Meta, and any other services you connect. You are responsible for having the permissions and consents required to contact your end users.',
          `Do not use the service to send unlawful, deceptive, abusive, or unsolicited messages, interfere with the service, or attempt to access another person's account or data. Prohibited activities include spamming, phishing, distributing malware, and sending messages that violate WhatsApp's Commerce Policy or Business Messaging Policy. We may restrict or suspend access where reasonably necessary to protect users, the service, or comply with law.`,
          'Third-party services, including WhatsApp, Meta, and payment providers, are governed by their own terms and availability. Kriscel WA does not control changes, interruptions, or decisions made by those providers.',
        ],
      },
      {
        heading: 'Limitation of liability and indemnification',
        paragraphs: [
          'To the maximum extent permitted by applicable law, Kriscel Tech Private Limited shall not be liable for indirect, incidental, special, consequential, or punitive damages arising out of or related to your use of the service, including but not limited to loss of profits, data, business opportunity, or goodwill.',
          'You agree to indemnify and hold harmless Kriscel Tech Private Limited, its directors, employees, and agents from and against any claims, damages, losses, and expenses arising out of your use of the service, your violation of these terms, or your violation of any rights of a third party.',
        ],
      },
      {
        heading: 'Governing law and disputes',
        paragraphs: [
          'These terms are governed by the laws of India. Any dispute arising out of or in connection with these terms shall be subject to the exclusive jurisdiction of the courts in New Delhi, India.',
        ],
      },
      {
        heading: 'Service changes and contact',
        paragraphs: [
          'We may update the service or these terms from time to time. Material changes will be posted on this page with an updated date; continued use of the service after an update means you accept the updated terms.',
          'Kriscel WA is operated by Kriscel Tech Private Limited, Plot No 229, Bharthal, Near Dada Deepu Chowk, Sector 26, Dwarka, South West Delhi, 110077, India. CIN: U63121DL2026PTC462568, GSTIN: 07AAMCK5483E1Z9. For questions about these terms or your account, contact Info@kriscel.com or +91 99713 64324.',
        ],
      },
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    updated: 'Last updated: October 30, 2026',
    introduction:
      'This Privacy Policy describes how Kriscel Tech Private Limited (CIN: U63121DL2026PTC462568), which operates Kriscel WA, collects, uses, shares, and protects information when you use our B2B customer-support, WhatsApp Business API integration, and CRM software.',
    content: [
      {
        heading: 'Information we collect',
        paragraphs: [
          'Account information: your name, work email address, phone number, company name, job title, login credentials, workspace settings, and billing-related details such as billing address and tax identification number.',
          'Workspace data: when you use the service, we process the content and information you choose to manage in your workspace, including customer contact records (names, phone numbers, email addresses, custom fields), WhatsApp conversations and message history, message templates, campaign content, chatbot flow configurations, analytics and delivery reports, and related usage records.',
          'Technical information: we automatically collect device type, browser type, IP address, access timestamps, and general usage patterns to operate and improve the service.',
          'Payment information: payment card and bank details are processed directly by the payment provider presented at checkout (currently Razorpay or Cashfree). We receive transaction identifiers, payment status, order amounts, and invoice information needed to manage billing. Do not send full card or bank details to us by email.',
        ],
      },
      {
        heading: 'How we use information',
        paragraphs: [
          'We use the information we collect to: provide, operate, and maintain the service; authenticate users and manage workspace access; process plan purchases and billing; deliver messages through the WhatsApp Business API on your behalf; show usage, analytics, and billing information; enforce plan limits and usage policies; protect the service against fraud, abuse, and security threats; and respond to your support requests.',
          'If you connect WhatsApp, Meta, or another third-party service, information is exchanged with that provider as needed to deliver the features you choose. Those providers process information under their own terms and privacy policies. We process WhatsApp conversations and contact data solely for the purpose of providing the service features you use.',
        ],
      },
      {
        heading: 'Sharing and disclosure',
        paragraphs: [
          'We share information with: infrastructure and hosting providers that help operate the service; payment providers (Razorpay, Cashfree) to process transactions; Meta and WhatsApp to deliver messages through the WhatsApp Business API; and analytics tools to understand service usage.',
          'We may disclose information when required by law, legal process, or government request, or when necessary to protect the rights, property, or safety of our users, the public, or the service.',
          `We do not sell your personal information or your customers' personal information to third parties.`,
        ],
      },
      {
        heading: 'Data security',
        paragraphs: [
          'We use industry-standard safeguards to protect information, including encrypted data transmission (TLS/HTTPS), access controls, and secure credential storage. Payment provider API keys are encrypted at rest.',
          'No internet-based service can guarantee absolute security. Workspace owners are responsible for managing team-member access permissions and the customer information they upload or transmit through the service. You should use strong passwords and enable any available security features on your account.',
        ],
      },
      {
        heading: 'Data retention and deletion',
        paragraphs: [
          'Account and workspace data is retained for as long as your account is active and as needed to provide the service. After account closure or cancellation, we retain data for a reasonable period to meet legal obligations, resolve disputes, and enforce agreements, after which it is deleted or anonymised.',
          'You may request deletion of your account and associated data by contacting Info@kriscel.com. We will process deletion requests within a reasonable timeframe, subject to any legal retention requirements. Certain data that has already been shared with third-party services (such as messages delivered through WhatsApp) cannot be recalled.',
        ],
      },
      {
        heading: 'Your rights and choices',
        paragraphs: [
          'You may access, correct, or update your account information through the Settings page in your workspace. You may request a copy of the personal data we hold about you, or request its deletion, by contacting Info@kriscel.com.',
          'If you are in a jurisdiction that grants additional privacy rights (such as the right to data portability or the right to object to processing), you may exercise those rights by contacting us at the details below.',
        ],
      },
      {
        heading: 'Grievance officer and contact',
        paragraphs: [
          'In accordance with the Information Technology Act 2000 and applicable rules, the Grievance Officer for Kriscel WA is: Sunny (Director), Email: info@kriscel.com, Phone: +91 99713 64324. The Grievance Officer can be contacted for any complaints or concerns regarding the processing of personal information.',
          'Kriscel WA is operated by Kriscel Tech Private Limited, Plot No 229, Bharthal, Near Dada Deepu Chowk, Sector 26, Dwarka, South West Delhi, 110077, India. CIN: U63121DL2026PTC462568, GSTIN: 07AAMCK5483E1Z9. Email: Info@kriscel.com, Phone: +91 99713 64324.',
        ],
      },
      {
        heading: 'Changes to this policy',
        paragraphs: [
          'We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated date. Continued use of the service after changes are posted constitutes acceptance of the updated policy.',
        ],
      },
    ],
  },
  refund: {
    title: 'Return/Refund/Cancellation Policy',
    updated: 'Last updated: October 30, 2026',
    introduction:
      'This policy explains how cancellation and refund requests work for Kriscel WA purchases made through Kriscel Tech Private Limited. Please review it before completing a payment.',
    content: [
      {
        heading: 'Refund request window and process',
        paragraphs: [
          'You may submit a refund request within 7 calendar days of the payment date. To request a refund, email Info@kriscel.com with the following details: your account email address, the transaction or order reference number, the payment date, the amount paid, and a brief explanation of your request.',
          'We will review each request and notify you of the decision by email. Submitting a refund request does not by itself cancel an active subscription; you must request cancellation separately from the Billing page in your account to prevent future renewals.',
          'If a refund is approved, it will be returned through the original payment method within 5-7 business days of approval. The exact time for funds to appear in your account may vary depending on your bank or financial institution.',
        ],
      },
      {
        heading: 'Refund eligibility and already-consumed services',
        paragraphs: [
          'Refund eligibility is assessed based on the circumstances of each request. Factors considered include: whether the service was activated, the amount of usage during the subscription period (messages sent, contacts added, features used), and the reason for the request.',
          'If the service was used during the period for which a refund is requested, the refund amount may be adjusted to account for the value of services already consumed. Any such adjustment will be communicated to you before the refund is processed.',
          'No undisclosed deductions or non-refundable fees will be applied. The refund amount will be clearly stated in the approval communication.',
        ],
      },
      {
        heading: 'Cancelling a subscription',
        paragraphs: [
          'You can cancel a recurring subscription from the Billing page in your account at any time. Cancellation stops future renewals at the end of the current paid billing period; your plan features remain available until that period ends.',
          'Cancellation alone does not automatically issue a refund. You may separately request a refund within the 7-calendar-day window described above.',
          'After cancellation takes effect, your workspace will revert to free-tier limits. Data stored in your workspace is retained for a reasonable period as described in our Privacy Policy.',
        ],
      },
      {
        heading: 'Prepaid plans',
        paragraphs: [
          'Prepaid plan purchases are one-time payments for the selected one-month or one-year term and do not auto-renew. The plan remains available through its displayed validity period.',
          'You may submit a refund request for a prepaid plan within 7 calendar days of the payment date using the process above. Refund eligibility for prepaid plans follows the same criteria as for recurring subscriptions, including consideration of services already consumed.',
          'Purchasing another term is required to continue service after the current term expires.',
        ],
      },
      {
        heading: 'Failed activation and duplicate payments',
        paragraphs: [
          'If you were charged but the plan or service was not activated, contact Info@kriscel.com with the transaction reference. We will investigate and, if the activation failure is confirmed, either activate the service or process a full refund.',
          'If you see a duplicate charge for the same plan or purchase, contact Info@kriscel.com with the transaction references for both charges. Confirmed duplicate charges will be refunded in full.',
          'If you do not recognize a payment from Kriscel WA or Kriscel Tech Private Limited on your statement, contact us before disputing the charge with your bank so we can resolve the matter directly.',
        ],
      },
      {
        heading: 'Statutory rights',
        paragraphs: [
          'Nothing in this policy limits or excludes any mandatory consumer-protection rights or statutory remedies available to you under applicable Indian law, including the Consumer Protection Act 2019 and the Information Technology Act 2000. Where this policy conflicts with a mandatory statutory right, the statutory right prevails.',
        ],
      },
      {
        heading: 'Contact',
        paragraphs: [
          'For all refund and cancellation enquiries, contact Kriscel Tech Private Limited at Info@kriscel.com or +91 99713 64324. Address: Plot No 229, Bharthal, Near Dada Deepu Chowk, Sector 26, Dwarka, South West Delhi, 110077, India.',
        ],
      },
    ],
  },
};

export default function PolicyPage({ type }: PolicyPageProps) {
  const policy = sections[type];
  const PolicyIcon = type === 'terms' ? BookOpen : type === 'privacy' ? ShieldCheck : RotateCcw;

  return (
    <main className="min-h-screen bg-[var(--apple-bg)] px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
           
          <Link to="/pricing" className="font-semibold text-[#14532D] flex items-center gap-3 hover:opacity-80">
             <img src={kriscelKSrc} alt="Kriscel" className="rounded-full object-contain shrink-0 w-9 h-9" />Kriscel WA
          </Link>
          <nav aria-label="Policy pages" className="flex flex-wrap gap-4 text-sm">
            <Link to="/contact" className="text-secondary-apple hover:text-wa-green">
              Contact Us
            </Link>
            <Link to="/terms" className="text-secondary-apple hover:text-wa-green">
              Terms and Conditions
            </Link>
            <Link to="/privacy" className="text-secondary-apple hover:text-wa-green">
              Privacy Policy
            </Link>
            <Link to="/refund-policy" className="text-secondary-apple hover:text-wa-green">
              Refund/Cancellation
            </Link>
            <Link to="/pricing" className="text-secondary-apple hover:text-wa-green">
              Pricing
            </Link>
          </nav>
        </header>

        <article className="card-apple p-6 sm:p-10">
          <p className="text-sm text-secondary-apple">{policy.updated}</p>
          <h1 className="mt-2 flex items-center gap-3 text-3xl font-bold text-primary-apple">
            <PolicyIcon aria-hidden="true" className="h-7 w-7 text-wa-green" />
            {policy.title}
          </h1>
          <p className="mt-5 leading-7 text-secondary-apple">{policy.introduction}</p>

          <div className="mt-8 space-y-8">
            {policy.content.map((section) => (
              <section key={section.heading}>
                <h2 className="text-lg font-semibold text-primary-apple">{section.heading}</h2>
                <div className="mt-3 space-y-3">
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph} className="leading-7 text-secondary-apple">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </article>
      </div>
    </main>
  );
}
