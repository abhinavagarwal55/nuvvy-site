export default function GardenCareMockLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Override parent layout - no Header/Footer for mock page
  return <>{children}</>;
}
