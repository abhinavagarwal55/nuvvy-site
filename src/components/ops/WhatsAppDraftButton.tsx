"use client";

import { MessageCircle } from "lucide-react";

export default function WhatsAppDraftButton({
  message,
  phone,
  label = "Open WhatsApp Draft",
}: {
  message: string;
  phone: string;
  label?: string;
}) {
  const cleanPhone = phone.replace(/[^0-9]/g, "");
  const link = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;

  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-center gap-2 w-full py-2.5 bg-[#25D366] text-white rounded-xl text-sm font-medium hover:bg-[#20BD5A] transition-colors"
    >
      <MessageCircle size={16} />
      {label}
    </a>
  );
}
