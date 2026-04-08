import { requireOpsAccess } from "@/lib/internal/authz";

export default async function TodayVisitsPage() {
  await requireOpsAccess(["admin", "horticulturist", "gardener"]);

  return (
    <div className="p-6">
      <h1
        className="text-2xl text-charcoal mb-2"
        style={{ fontFamily: "var(--font-cormorant, serif)", fontWeight: 500 }}
      >
        Today&apos;s visits
      </h1>
      <p className="text-sm text-sage">Coming soon — Week 2 fills this in.</p>
    </div>
  );
}
