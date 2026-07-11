import { redirect } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import PinForm from "./PinForm";
import { LanguageSwitcher } from "@/lib/i18n/LanguageSwitcher";

export default async function GardenerLoginPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Look up gardener by login_token — join profiles to get their name
  const supabase = getSupabaseAdmin();
  const { data: gardener } = await supabase
    .from("gardeners")
    .select("id, is_active, profiles(full_name)")
    .eq("login_token", token)
    .single();

  // Token not found or inactive → redirect silently (don't hint at existence)
  if (!gardener || !gardener.is_active) {
    redirect("/ops");
  }

  const profiles = gardener.profiles as unknown as { full_name: string | null } | null;
  const name = profiles?.full_name ?? "there";

  return (
    <div className="min-h-screen bg-cream flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-[480px]">
        {/* Language toggle — readable before sign-in; writes the cookie only
            (pre-auth). Persisted to the DB after login or on next change. */}
        <div className="mb-6 flex justify-center">
          <LanguageSwitcher />
        </div>

        {/* Greeting — Cormorant Garamond */}
        <div className="mb-8 text-center">
          <p
            className="text-sm text-sage mb-1 uppercase tracking-widest"
            style={{ fontFamily: "var(--font-dm-sans, sans-serif)" }}
          >
            Good to see you
          </p>
          <h1
            className="text-4xl text-charcoal"
            style={{
              fontFamily: "var(--font-cormorant, serif)",
              fontWeight: 500,
            }}
          >
            {name}
          </h1>
        </div>

        {/* PIN form card */}
        <div className="bg-offwhite rounded-2xl p-6 shadow-sm">
          <PinForm token={token} />
        </div>
      </div>
    </div>
  );
}
