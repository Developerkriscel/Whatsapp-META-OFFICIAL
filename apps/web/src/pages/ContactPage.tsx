import { Link } from 'react-router-dom';
import { Mail, MapPin, Phone } from 'lucide-react';

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-[var(--apple-bg)] px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <Link to="/pricing" className="font-semibold text-wa-green hover:opacity-80">
            Kriscel WA
          </Link>
          <nav aria-label="Public pages" className="flex flex-wrap gap-4 text-sm">
            <Link to="/pricing" className="text-secondary-apple hover:text-wa-green">Pricing</Link>
            <Link to="/terms" className="text-secondary-apple hover:text-wa-green">Terms</Link>
            <Link to="/privacy" className="text-secondary-apple hover:text-wa-green">Privacy</Link>
            <Link to="/refund-policy" className="text-secondary-apple hover:text-wa-green">Refunds</Link>
          </nav>
        </header>

        <article className="card-apple p-6 sm:p-10">
          <p className="text-sm font-medium text-wa-green">Customer and merchant support</p>
          <h1 className="mt-2 text-3xl font-bold text-primary-apple">Contact Us</h1>
          <p className="mt-4 leading-7 text-secondary-apple">
            Contact us about Kriscel WA, plans, billing, privacy, or payment questions.
          </p>

          <h2 className="mt-8 text-xl font-semibold text-primary-apple">Kriscel Tech Private Limited</h2>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-secondary-apple">
            <span><span className="font-medium text-primary-apple">CIN:</span> U63121DL2026PTC462568</span>
            <span><span className="font-medium text-primary-apple">GSTIN:</span> 07AAMCK5483E1Z9</span>
          </div>
          <address className="mt-5 space-y-5 not-italic">
            <p className="flex items-start gap-3 text-secondary-apple">
              <MapPin aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-wa-green" />
              <span>Plot No 229, Bharthal, Near Dada Deepu Chowk, Sector 26, Dwarka, South West Delhi, 110077, India</span>
            </p>
            <p className="flex items-center gap-3 text-secondary-apple">
              <Phone aria-hidden="true" className="h-5 w-5 shrink-0 text-wa-green" />
              <a className="hover:text-wa-green" href="tel:+919971364324">+91 99713 64324</a>
            </p>
            <p className="flex items-center gap-3 text-secondary-apple">
              <Mail aria-hidden="true" className="h-5 w-5 shrink-0 text-wa-green" />
              <a className="hover:text-wa-green" href="mailto:Info@kriscel.com">Info@kriscel.com</a>
            </p>
          </address>

          <hr className="my-8 border-black/5" />

          <h2 className="text-xl font-semibold text-primary-apple">Grievance Officer</h2>
          <div className="mt-4 space-y-3 text-secondary-apple">
            <p><span className="font-medium text-primary-apple">Name:</span> Sunny (Director)</p>
            <p className="flex items-center gap-3">
              <Mail aria-hidden="true" className="h-5 w-5 shrink-0 text-wa-green" />
              <a className="hover:text-wa-green" href="mailto:info@kriscel.com">info@kriscel.com</a>
            </p>
            <p className="flex items-center gap-3">
              <Phone aria-hidden="true" className="h-5 w-5 shrink-0 text-wa-green" />
              <a className="hover:text-wa-green" href="tel:+919971364324">+91 99713 64324</a>
            </p>
          </div>
        </article>
      </div>
    </main>
  );
}
