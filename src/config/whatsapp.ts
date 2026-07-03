/**
 * WhatsApp configuration and message templates
 */

// Read WhatsApp number from environment variable
export const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "";

// Display-formatted Indian phone, e.g. "+91 99011 53781"
export const PHONE_DISPLAY = WHATSAPP_NUMBER && WHATSAPP_NUMBER.length === 12
  ? `+${WHATSAPP_NUMBER.slice(0, 2)} ${WHATSAPP_NUMBER.slice(2, 7)} ${WHATSAPP_NUMBER.slice(7)}`
  : "";

// Call number for tap-to-dial CTAs — independently configurable, falls back to
// the WhatsApp number when NEXT_PUBLIC_CALL_NUMBER is unset (no behavior change).
// Sanitize to digits so a stray "+" or spaces in the env value don't break the
// tel: link or hide the CTA.
export const CALL_NUMBER = (process.env.NEXT_PUBLIC_CALL_NUMBER || WHATSAPP_NUMBER || "").replace(/\D/g, "");

// Display-formatted call number. Uses the 12-digit "+91 XXXXX XXXXX" format
// when possible; otherwise falls back to "+<digits>" so a set number always
// renders (never an empty string that would hide the Call CTAs).
export const CALL_DISPLAY = CALL_NUMBER.length === 12
  ? `+${CALL_NUMBER.slice(0, 2)} ${CALL_NUMBER.slice(2, 7)} ${CALL_NUMBER.slice(7)}`
  : CALL_NUMBER
    ? `+${CALL_NUMBER}`
    : "";

// Pre-written message templates for different CTAs
export const WHATSAPP_MESSAGES = {
  balconyAssessment: "Hi, I'd like to book a free 30-minute consultation with a horticulturist about my balcony and understand what would work best for my space.",
  pricingInquiry: "Hi, I'm interested in your garden care plans and would like to get exact pricing for my balcony.",
  generalChat: "Hi I'm exploring garden care for my balcony and would like to chat with your team.",
} as const;

// CE3: catalog bottom CTA — pre-fills a custom-shortlist request
export const CATALOG_SHORTLIST_REQUEST = `Hi Nuvvy! I'd love a custom plant shortlist for my balcony.

A few quick things about my space:
- Direction: [North / South / East / West / Not sure]
- Light: [Full sun / Partial / Mostly shade]
- Experience: [First-time plant parent / Some plants / Confident]

Looking forward to your recommendations!`;

// Plant detail CTA — pre-fills a request for a specific plant
export function getCatalogPlantRequest(plantName: string, plantUrl?: string): string {
  const link = plantUrl ? `\n\n${plantUrl}` : "";
  return `Hi Nuvvy! I'd like to get ${plantName} for my balcony via Nuvvy. Can you help me arrange this?${link}`;
}

/**
 * Generate a WhatsApp deep link with a pre-filled message
 * @param message - The message to pre-fill in WhatsApp
 * @returns WhatsApp deep link URL, or "#" if number is missing
 */
export function getWhatsAppLink(message: string): string {
  if (!WHATSAPP_NUMBER) {
    if (typeof window !== "undefined") {
      console.warn("NEXT_PUBLIC_WHATSAPP_NUMBER is not set. WhatsApp links will not work.");
    }
    return "#";
  }

  const encodedMessage = encodeURIComponent(message);
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodedMessage}`;
}
