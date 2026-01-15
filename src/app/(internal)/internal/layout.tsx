import { headers } from "next/headers";
import { requireInternalAccess } from "@/lib/internal/authz";
import { isDevBypassAuth } from "@/lib/internal/dev-bypass";
import SignOutButton from "./signout-button";

export default async function InternalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Get current pathname from middleware header
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") || "";
  
  // Allow login and auth callback routes without authentication/authorization
  const isPublicRoute = 
    pathname === "/internal/login" || 
    pathname.startsWith("/internal/auth/callback");

  // Check if dev bypass is enabled
  const bypassAuth = await isDevBypassAuth();

  if (!isPublicRoute && !bypassAuth) {
    // Check authentication AND authorization (requires internal_users table entry)
    const { user, access } = await requireInternalAccess();

    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {/* Top Bar */}
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">Nuvvy Internal</h1>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600">{user.email}</span>
              <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded-full">
                {access.role}
              </span>
            </div>
            <SignOutButton />
          </div>
        </header>
        
        {/* Main Content */}
        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
    );
  }

  // Dev bypass mode - render without auth check
  if (!isPublicRoute && bypassAuth) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {/* Top Bar */}
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">Nuvvy Internal</h1>
          <div className="flex items-center gap-4">
            <span className="text-xs px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full font-medium">
              AUTH BYPASSED (DEV)
            </span>
          </div>
        </header>
        
        {/* Main Content */}
        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
    );
  }

  // Public routes (login, callback) - render without header
  return (
    <div className="min-h-screen bg-gray-50">
      {children}
    </div>
  );
}
