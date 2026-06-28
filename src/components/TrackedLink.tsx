'use client'

import type { AnchorHTMLAttributes, ReactNode } from "react";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

type TrackedLinkProps = {
  href: string;
  event: string;
  cta: string;
  children: ReactNode;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "onClick">;

/**
 * Anchor wrapper that fires a GA4 event (labeled by `cta`) on click — only when
 * gtag is present (public surface). Navigation is never blocked.
 * Used for WhatsApp (whatsapp_click) and tap-to-call (call_click) CTAs.
 */
export default function TrackedLink({ href, event, cta, children, ...rest }: TrackedLinkProps) {
  function handleClick() {
    if (typeof window !== "undefined" && typeof window.gtag === "function") {
      window.gtag("event", event, { cta_location: cta });
    }
  }

  return (
    <a href={href} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
}
