"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { signOut } from "@/lib/mutations";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/alerts", label: "Alerts" },
  { href: "/branches", label: "Branches" },
  { href: "/events", label: "Events" },
  { href: "/settings", label: "Settings" },
];

export function Sidebar({
  userName,
  userRole,
}: {
  userName: string;
  userRole: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
      router.push("/login");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-card">
      <div className="border-b border-line px-5 py-4">
        <p className="text-[15px] font-extrabold tracking-tight text-ink">
          Splinter Mind
        </p>
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
          Operations Console
        </p>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-md px-3 py-2 text-[13.5px] font-medium transition-colors ${
                active
                  ? "bg-ink text-white"
                  : "text-ink-soft hover:bg-surface"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-line px-5 py-4">
        <p className="truncate text-[13px] font-semibold text-ink">{userName}</p>
        <p className="text-xs capitalize text-muted">{userRole}</p>
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className="mt-3 w-full rounded-md border border-line px-3 py-1.5 text-[13px] font-medium text-ink-soft transition-colors hover:bg-surface disabled:opacity-50"
        >
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </aside>
  );
}
