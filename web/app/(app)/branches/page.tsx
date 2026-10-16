import { getServerClient } from "@/lib/supabase/server";
import { getAlerts, getBranches } from "@/lib/queries";
import { BranchCard } from "@/components/Cards";
import { AlertsRealtime } from "@/components/Realtime";
import { EmptyState, PageHeader } from "@/components/Layout";

export default async function BranchesPage() {
  const supabase = await getServerClient();
  const [branches, alerts] = await Promise.all([
    getBranches(supabase),
    getAlerts(supabase, { status: "open", limit: 500 }),
  ]);
  const openByBranch = new Map<string, number>();
  for (const alert of alerts) {
    openByBranch.set(alert.branch_id, (openByBranch.get(alert.branch_id) ?? 0) + 1);
  }

  return (
    <div>
      <AlertsRealtime />
      <PageHeader kicker="Operations" title="Branches" />
      {branches.length === 0 ? (
        <EmptyState
          title="No branches"
          message="Branches will appear here once they are added to your organization."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {branches.map((branch) => (
            <BranchCard
              key={branch.id}
              branch={branch}
              openAlerts={openByBranch.get(branch.id) ?? 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}
