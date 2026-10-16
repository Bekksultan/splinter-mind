import { redirect } from "next/navigation";
import { getServerClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/queries";
import { Sidebar } from "@/components/Sidebar";

// Per-user, RLS-filtered data — never statically prerender this subtree.
export const dynamic = "force-dynamic";

export default async function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await getServerClient();
  const profile = await getProfile(supabase);
  if (!profile) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <Sidebar userName={profile.name} userRole={profile.role} />
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
