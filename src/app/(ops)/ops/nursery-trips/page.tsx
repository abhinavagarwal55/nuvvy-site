import { redirect } from "next/navigation";

// Relocated under Procurement (PRD §9.1). Old path kept as a redirect.
export default function NurseryTripsRedirect() {
  redirect("/ops/procurement");
}
