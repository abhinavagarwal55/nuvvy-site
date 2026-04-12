import { formatDate } from "@/lib/utils/format-date";

const HEADER = `
<div style="background:#2D5A3D;padding:20px 24px;border-radius:12px 12px 0 0">
  <h1 style="color:#FDFAF6;font-size:20px;margin:0;font-family:Georgia,serif">Nuvvy Ops</h1>
</div>`;

const FOOTER = `
<div style="padding:16px 24px;border-top:1px solid #D8CCBA;color:#8BAF8A;font-size:12px">
  This is an automated notification from Nuvvy Ops.
</div>`;

function wrap(body: string): string {
  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;background:#FDFAF6;border:1px solid #D8CCBA;border-radius:12px">
  ${HEADER}
  <div style="padding:24px">${body}</div>
  ${FOOTER}
</div>`;
}

function row(label: string, value: string): string {
  return `<tr><td style="padding:4px 12px 4px 0;color:#8BAF8A;font-size:13px;white-space:nowrap">${label}</td><td style="padding:4px 0;color:#1E2822;font-size:13px">${value}</td></tr>`;
}

// ─── Customer Activated ──────────────────────────────────────────────────────

export function customerActivatedEmail(data: {
  name: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  society?: string | null;
  plantCountRange?: string | null;
  lightCondition?: string | null;
  planName?: string | null;
  planPrice?: number | null;
  gardenerName?: string | null;
  slotDay?: string | null;
  slotTime?: string | null;
  activatedBy: string;
}): { subject: string; html: string } {
  const plantLabel: Record<string, string> = {
    "0_20": "0–20 pots",
    "20_40": "20–40 pots",
    "40_plus": "40+ pots",
  };

  const body = `
    <h2 style="color:#1E2822;font-size:16px;margin:0 0 16px">New Customer Onboarded</h2>
    <table style="border-collapse:collapse;width:100%">
      ${row("Name", data.name)}
      ${row("Phone", data.phone)}
      ${data.email ? row("Email", data.email) : ""}
      ${data.address ? row("Address", data.address) : ""}
      ${data.society ? row("Society", data.society) : ""}
      ${data.plantCountRange ? row("Plants", plantLabel[data.plantCountRange] ?? data.plantCountRange) : ""}
      ${data.lightCondition ? row("Light", data.lightCondition) : ""}
      ${data.planName ? row("Plan", `${data.planName}${data.planPrice ? ` (₹${data.planPrice}/mo)` : ""}`) : ""}
      ${data.gardenerName ? row("Gardener", data.gardenerName) : ""}
      ${data.slotDay && data.slotTime ? row("Slot", `${data.slotDay} ${data.slotTime}`) : ""}
      ${row("Activated by", data.activatedBy)}
    </table>`;

  return {
    subject: `New Customer: ${data.name}`,
    html: wrap(body),
  };
}

// ─── Service Completed ──────────────────────────────────────────────────────

export function serviceCompletedEmail(data: {
  customerName: string;
  scheduledDate: string;
  timeWindow?: string | null;
  gardenerName?: string | null;
  checklistDone: number;
  checklistTotal: number;
  careActionsDone: string[];
  specialTasksDone: string[];
  photoCount: number;
  issuesRaised: string[];
  hasClientRequest: boolean;
}): { subject: string; html: string } {
  const dateStr = formatDate(data.scheduledDate);

  const checklistPct = data.checklistTotal > 0
    ? Math.round((data.checklistDone / data.checklistTotal) * 100)
    : 0;

  let issueHtml = "";
  if (data.issuesRaised.length > 0) {
    issueHtml = `
      <div style="background:#FEF2F2;border-left:3px solid #B5654A;padding:10px 12px;border-radius:6px;margin-top:12px">
        <p style="color:#B5654A;font-size:13px;font-weight:600;margin:0 0 4px">Issues Raised</p>
        <ul style="margin:0;padding-left:16px;color:#1E2822;font-size:13px">
          ${data.issuesRaised.map((i) => `<li>${i}</li>`).join("")}
        </ul>
      </div>`;
  }

  let clientReqHtml = "";
  if (data.hasClientRequest) {
    clientReqHtml = `
      <div style="background:#EAF2EC;border-left:3px solid #2D5A3D;padding:10px 12px;border-radius:6px;margin-top:12px">
        <p style="color:#2D5A3D;font-size:13px;margin:0">Client request recorded via voice note — check the service detail page.</p>
      </div>`;
  }

  const body = `
    <h2 style="color:#1E2822;font-size:16px;margin:0 0 16px">Service Completed</h2>
    <table style="border-collapse:collapse;width:100%">
      ${row("Customer", data.customerName)}
      ${row("Date", dateStr)}
      ${data.timeWindow ? row("Time", data.timeWindow) : ""}
      ${data.gardenerName ? row("Gardener", data.gardenerName) : ""}
      ${row("Checklist", `${data.checklistDone}/${data.checklistTotal} done (${checklistPct}%)`)}
      ${row("Photos", `${data.photoCount} uploaded`)}
      ${data.careActionsDone.length > 0 ? row("Care Actions", data.careActionsDone.join(", ")) : ""}
      ${data.specialTasksDone.length > 0 ? row("Special Tasks", data.specialTasksDone.join(", ")) : ""}
    </table>
    ${issueHtml}
    ${clientReqHtml}`;

  return {
    subject: `Service Complete: ${data.customerName} — ${dateStr}`,
    html: wrap(body),
  };
}
