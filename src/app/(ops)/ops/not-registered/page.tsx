import Link from "next/link";

export default function NotRegisteredPage() {
  return (
    <div className="min-h-screen bg-[#F0E8D8] flex flex-col items-center justify-center px-6 text-center">
      <h1 className="text-3xl mb-8 text-[#1E2822]" style={{ fontFamily: "var(--font-cormorant, serif)", fontWeight: 500 }}>
        Nuvvy
      </h1>
      <div className="bg-white rounded-2xl shadow-sm p-8 max-w-sm w-full">
        <p className="text-[#1E2822] font-medium mb-2">Number not registered</p>
        <p className="text-sm text-[#8BAF8A]">
          Your number isn&apos;t registered with Nuvvy. Contact your team.
        </p>
        <Link
          href="/ops/login/gardener"
          className="mt-6 inline-block text-sm text-[#2D5A3D] underline"
        >
          ← Try again
        </Link>
      </div>
    </div>
  );
}
