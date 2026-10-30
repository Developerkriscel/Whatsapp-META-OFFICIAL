import { Link } from 'react-router-dom';
import { BookOpen, RotateCcw, ShieldCheck } from 'lucide-react';
import kriscelKSrc from '../assets/kriscel-k.jpeg';
type PolicyPageProps = {
  type: 'terms' | 'privacy' | 'refund';
};

const sections = {
  terms: {
    title: 'Terms and Conditions',
    updated: 'Last updated: October 12, 2026',
    introduction:
      'These Terms and Conditions govern your access to and use of Kriscel WA, operated by Kriscel Tech Pvt Ltd. By creating an account, purchasing a plan, or using the service, you agree to these terms.',
    content: [
      {
        heading: 'The service and your account',
        paragraphs: [
          'Kriscel WA provides tools for managing WhatsApp conversations, contacts, campaigns, templates, chatbot flows, analytics, and related account features. The features available to you depend on your selected plan.',
          'You are responsible for providing accurate account information, protecting your sign-in credentials, and activity conducted through your workspace. Tell us promptly if you believe your account has been accessed without permission.',
        ],
      },
      {
        heading: 'Plans, billing, and cancellation',
        paragraphs: [
          'Plan features, limits, price, currency, and billing interval are shown before you confirm a purchase. Plan prices charged in INR use the configured USD-to-INR conversion rate. Checkout adds GST at the configured 18% rate to the converted plan price and shows the base price, GST, and total before payment.',
          'Recurring subscription purchases renew for the selected billing interval until cancelled. You can request cancellation from Billing in your account. Cancellation takes effect at the end of the current paid billing period, and access continues until then.',
          'Prepaid plan purchases are one-time payments for the selected one-month or one-year term and do not automatically renew. Access ends when the paid term expires unless you purchase another term.',
          'Payment processing is handled by the payment provider shown at checkout. You authorize the applicable provider to process the payment for the amount displayed before you confirm.',
        ],
      },
      {
        heading: 'Acceptable use and third-party services',
        paragraphs: [
          'You must use Kriscel WA in compliance with applicable law and the terms and policies of WhatsApp, Meta, and any other services you connect. You are responsible for having the permissions and consents required to contact your end users. Campaigns can only be sent to active contacts recorded as explicitly opted in; contacts with unknown consent or an opt-out are excluded.',
          'Do not use the service to send unlawful, deceptive, abusive, or unsolicited messages, interfere with the service, or attempt to access another person’s account or data. We may restrict or suspend access where reasonably necessary to protect users, the service, or comply with law.',
          'Third-party services are governed by their own terms and availability. Kriscel WA does not control changes, interruptions, or decisions made by those providers.',
        ],
      },
      {
        heading: 'Service changes and contact',
        paragraphs: [
          'We may update the service or these terms. Changes will be posted on this page; continued use after an update means you accept the updated terms.',
          'Kriscel WA is operated by Kriscel Tech Pvt Ltd, 229, Bharthal, Sector 26, Dwarka, South West Delhi, 110077, India. For questions about these terms or your account, contact Info@kriscel.com or +91 99713 64324.',
        ],
      },
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    updated: 'Last updated: October 12, 2026',
    introduction:
      'This Privacy Policy describes how Kriscel Tech Pvt Ltd, which operates Kriscel WA, handles information when you use our B2B customer-support and CRM software.',
    content: [
      {
        heading: 'Information processed',
        paragraphs: [
          'Account information may include your name, work email, phone number, company details, login and workspace settings, and billing-related details.',
          'When you use the service, we process the content and information you choose to manage in your workspace, such as customer contact details, WhatsApp conversations, message templates, campaign content, chatbot flows, and related delivery or usage records.',
          'Payment details are processed by the payment provider presented at checkout. We receive payment and order status information needed to manage billing; do not send full card details to us by email.',
        ],
      },
      {
        heading: 'How information is used',
        paragraphs: [
          'We use information to provide and maintain the service, authenticate users, support customer workspaces, process plan purchases, show usage and billing information, protect the service, and respond to support requests.',
          'If you connect WhatsApp, Meta, or another third-party service, information may be exchanged with that provider as needed to deliver the features you choose. Those providers process information under their own terms and privacy policies.',
        ],
      },
      {
        heading: 'Disclosure and security',
        paragraphs: [
          'Information may be processed by providers that help operate the service, including hosting, payment, and connected platform providers, and may be disclosed when required by law or necessary to protect users and the service.',
          'We use safeguards intended to protect information. No internet service can guarantee absolute security. Workspace owners are responsible for managing team access and the customer information they upload or send.',
        ],
      },
      {
        heading: 'Retention, choices, and contact',
        paragraphs: [
          'Information is retained as needed to provide the service, meet legal and operational requirements, resolve disputes, and enforce agreements. To ask a privacy question or request help with account information, contact Info@kriscel.com.',
          'Kriscel WA is operated by Kriscel Tech Pvt Ltd. You can reach us at 229, Bharthal, Sector 26, Dwarka, South West Delhi, 110077, India, or by phone at +91 99713 64324.',
        ],
      },
    ],
  },
  refund: {
    title: 'Return/Refund/Cancellation Policy',
    updated: 'Last updated: October 12, 2026',
    introduction:
      'This policy explains how cancellation and refund requests work for Kriscel WA purchases. Please review it before completing a payment.',
    content: [
      {
        heading: 'Refund request window',
        paragraphs: [
          'You may submit a refund request within 7 calendar days of the payment date. Include the account email, transaction or order reference, purchase date, and a short explanation when you contact Info@kriscel.com.',
          'We will review each request and notify you of the decision. Submitting a request does not itself cancel an active subscription; request cancellation separately from Billing in your account to prevent future renewals.',
          'If a refund is approved, it will be returned through the original payment method within 5-7 business days of approval. The exact time for the funds to appear in your account may vary depending on your financial institution.',
        ],
      },
      {
        heading: 'Cancelling a subscription',
        paragraphs: [
          'You can cancel a subscription from the Billing page in your account. Cancellation stops future renewals at the end of the current paid billing period; your plan remains available until that period ends.',
          'Cancellation alone does not automatically issue a refund. You may separately request a refund within the 7-calendar-day window described above.',
        ],
      },
      {
        heading: 'Prepaid plans',
        paragraphs: [
          'Prepaid plan purchases are one-time payments for the selected one-month or one-year term and do not auto-renew. The plan remains available through its displayed validity period.',
          'You may submit a refund request within 7 calendar days of the payment date using the process above. Purchasing another term is required to continue service after the current term expires.',
        ],
      },
      {
        heading: 'Failed, duplicate, or unrecognized payments',
        paragraphs: [
          'If you were charged but the purchase was not activated, see a duplicate charge, or do not recognize a payment, contact Info@kriscel.com with the transaction reference so we can investigate.',
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
