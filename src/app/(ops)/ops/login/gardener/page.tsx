// The phone+PIN gardener login flow is retired.
// Gardeners now use their personal token URL: /ops/g/[token]
// Admin sends the URL once via WhatsApp; gardener bookmarks it.
import { redirect } from "next/navigation";

export default function RetiredGardenerLoginPage() {
  redirect("/ops");
}
