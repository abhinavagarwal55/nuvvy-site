/**
 * WhatsApp configuration and message templates
 */

// Read WhatsApp number from environment variable
export const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "";

// Pre-written message templates for different CTAs
export const WHATSAPP_MESSAGES = {
  balconyAssessment: "Hi, I'd like to book a free 30-minute consultation with a horticulturist about my balcony and understand what would work best for my space.",
  pricingInquiry: "Hi, I'm interested in your garden care plans and would like to get exact pricing for my balcony.",
  generalChat: "Hi I'm exploring garden care for my balcony and would like to chat with your team.",
} as const;

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
