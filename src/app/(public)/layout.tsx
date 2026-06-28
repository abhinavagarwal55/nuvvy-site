import LandingHeader from "@/components/LandingHeader";
import Analytics from "@/lib/analytics";
import Clarity from "@/lib/clarity";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <LandingHeader />
      <main className="pt-6 md:pt-10">
        {children}
      </main>
      <Analytics />
      <Clarity />
    </>
  );
}
