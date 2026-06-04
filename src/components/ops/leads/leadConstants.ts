// Single source of truth for every user-facing Leads CRM string + shared types.
// DB state enum is active | converted | closed; `converted` never renders here.

import {
  LEAD_SOURCES,
  LEAD_CLOSED_REASONS,
  type LeadSource,
  type LeadClosedReason,
  type LeadQualifiers,
} from "@/lib/schemas/lead.schema";

export type LeadListItem = {
  id: string;
  phone: string;
  name: string | null;
  state: "active" | "converted" | "closed";
  source: LeadSource | null;
  society_id: string | null;
  society_name: string | null;
  area: string | null;
  qualifiers: LeadQualifiers;
  notes: string | null;
  next_action: string | null;
  next_action_at: string | null;
  closed_reason: LeadClosedReason | null;
  closed_note: string | null;
  closed_at: string | null;
  converted_customer_id: string | null;
  converted_at: string | null;
  first_seen_at: string | null;
  last_touch_at: string | null;
  created_at: string;
  updated_at: string;
};

// Only the two user-visible states get labels.
export const STATE_LABELS: Record<"active" | "closed", string> = {
  active: "Active lead",
  closed: "Closed",
};

export const SOURCE_LABELS: Record<LeadSource, string> = {
  customer_referral: "Customer referral",
  website_lead: "Website lead",
  social_media: "Social media",
  other: "Other",
};

export const CLOSED_REASON_LABELS: Record<LeadClosedReason, string> = {
  outside_service_area: "Outside service area",
  pricing_too_high: "Pricing too high",
  not_meeting_requirements: "Not meeting requirements",
  other: "Other",
};

// Ordered options for selects / radios.
export const SOURCE_OPTIONS = LEAD_SOURCES.map((value) => ({
  value,
  label: SOURCE_LABELS[value],
}));

export const CLOSED_REASON_OPTIONS = LEAD_CLOSED_REASONS.map((value) => ({
  value,
  label: CLOSED_REASON_LABELS[value],
}));

export const PLANT_RANGE_LABELS: Record<string, string> = {
  "0_20": "0–20 pots",
  "20_40": "20–40 pots",
  "40_plus": "40+ pots",
};

const todayStr = () => new Date().toISOString().split("T")[0];

export function isOverdue(nextActionAt: string | null): boolean {
  return !!nextActionAt && nextActionAt < todayStr();
}

export function isDueToday(nextActionAt: string | null): boolean {
  return !!nextActionAt && nextActionAt === todayStr();
}

/** "<= today" — the actionable follow-up set. */
export function needsFollowUp(nextActionAt: string | null): boolean {
  return !!nextActionAt && nextActionAt <= todayStr();
}

/** Compact relative time, e.g. "just now", "3h ago", "2d ago", "5w ago". */
export function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/** Digits-only phone for wa.me links (no leading +). */
export function waDigits(phone: string): string {
  return phone.replace(/[^\d]/g, "");
}

/** Absolute date + time, e.g. "4 Jun 2026, 1:38 PM". */
export function formatTimestamp(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// A single timeline note.
export type LeadNote = {
  id: string;
  body: string;
  created_at: string;
  author_name: string | null;
};

// A merged history event (note OR audited state change), newest-first in the UI.
export type LeadHistoryEvent = {
  kind: "note" | "created" | "closed" | "reactivated" | "converted" | "follow_up" | "updated";
  at: string;
  actor_name: string | null;
  body?: string | null; // for notes
  detail?: string | null; // closed reason, or follow-up date
  id: string;
};

const HISTORY_VERB: Record<LeadHistoryEvent["kind"], string> = {
  note: "added a note",
  created: "created this lead",
  closed: "closed the lead",
  reactivated: "reactivated the lead",
  converted: "converted to customer",
  follow_up: "set a follow-up",
  updated: "edited lead details",
};

export function historyVerb(kind: LeadHistoryEvent["kind"]): string {
  return HISTORY_VERB[kind];
}
