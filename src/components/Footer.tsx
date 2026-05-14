import { WHATSAPP_NUMBER, PHONE_DISPLAY, WHATSAPP_MESSAGES, getWhatsAppLink } from "@/config/whatsapp";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    // Site-wide footer
    <footer className="bg-surface border-t border-border">
      <div className="container mx-auto px-6 lg:px-8 py-12">
        <div className="grid gap-8 md:grid-cols-3">
          {/* Brand blurb */}
          <div>
            <div className="text-2xl font-display font-semibold text-ink">Nuvvy</div>
            <p className="mt-2 text-text-muted max-w-sm">
              We turn balconies into lush, low-effort green sanctuaries — designed to feel calm, fresh, and beautifully made.
            </p>
          </div>

          {/* Quick links */}
          <nav aria-label="Footer" className="grid grid-cols-2 gap-3 text-sm">
            <a href="/design" className="text-text-muted hover:text-ink">Design</a>
            <a href="/maintenance" className="text-text-muted hover:text-ink">Maintenance</a>
            <a href="/contact" className="text-text-muted hover:text-ink">Contact</a>
          </nav>

          {/* Contact */}
          <div className="md:text-right text-sm">
            <p className="text-text-muted">Questions? We&apos;re happy to help.</p>
            {PHONE_DISPLAY && (
              <p className="mt-2">
                <a
                  href={`tel:+${WHATSAPP_NUMBER}`}
                  className="text-ink hover:text-green-700 font-medium"
                >
                  {PHONE_DISPLAY}
                </a>
              </p>
            )}
            {WHATSAPP_NUMBER && (
              <p className="mt-1">
                <a
                  href={getWhatsAppLink(WHATSAPP_MESSAGES.generalChat)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-text-muted hover:text-ink"
                >
                  Chat on WhatsApp
                </a>
              </p>
            )}
          </div>
        </div>

        <div className="mt-10 flex items-center justify-between border-t border-border/70 pt-6 text-xs text-text-muted">
          <p>© {year} Nuvvy. All rights reserved.</p>
          <a href="#hero" className="hover:text-ink">Back to top ↑</a>
        </div>
      </div>
    </footer>
  );
}