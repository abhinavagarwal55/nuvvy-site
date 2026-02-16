import LandingHeader from "@/components/LandingHeader";

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
    </>
  );
}
