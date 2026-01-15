import TestSupabase from "./test-supabase";

export default function InternalPage() {
  return (
    <div>
      <p>Internal routing is working correctly.</p>
      <TestSupabase />
    </div>
  );
}
