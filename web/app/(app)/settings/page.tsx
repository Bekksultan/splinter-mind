import { getServerClient } from "@/lib/supabase/server";
import { getNotificationPrefs, getProfile } from "@/lib/queries";
import { PrefsForm } from "@/components/PrefsForm";
import { PageHeader } from "@/components/Layout";

export default async function SettingsPage() {
  const supabase = await getServerClient();
  const profile = await getProfile(supabase);
  const prefs = profile
    ? await getNotificationPrefs(supabase, profile.id)
    : null;

  return (
    <div>
      <PageHeader kicker="Account" title="Settings" />
      {profile ? (
        <PrefsForm userId={profile.id} initial={prefs} />
      ) : (
        <p className="text-sm text-muted">Could not load your profile.</p>
      )}
    </div>
  );
}
