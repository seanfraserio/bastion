"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Key,
  Shield,
  Server,
  BarChart3,
  ScrollText,
  Settings,
  Users,
  BookOpen,
  LifeBuoy,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Overview", href: "/", icon: LayoutDashboard },
  { name: "API Keys", href: "/keys", icon: Key },
  { name: "Policies", href: "/policies", icon: Shield },
  { name: "Providers", href: "/providers", icon: Server },
  { name: "Usage", href: "/usage", icon: BarChart3 },
  { name: "Audit Log", href: "/audit", icon: ScrollText },
];

const bottomNavigation = [
  {
    name: "Documentation",
    href: "https://openbastionai.org",
    icon: BookOpen,
    external: true,
  },
  {
    name: "Support",
    href: "mailto:support@openbastionai.org",
    icon: LifeBuoy,
    external: true,
  },
  { name: "Settings", href: "/settings", icon: Settings, external: false },
  { name: "Team", href: "/settings/team", icon: Users, external: false },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r bg-card">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b px-6">
        <Image src="/logo.svg" alt="Bastion" width={32} height={35} />
        <span className="bg-gradient-to-r from-bastion-purple to-bastion-blue bg-clip-text text-xl font-bold text-transparent">
          Bastion
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-bastion-purple/15 text-bastion-purple-light"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </Link>
          );
        })}

        <div className="my-3 border-t" />

        {bottomNavigation.map((item) => {
          const isActive =
            !item.external && (item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href));

          if (item.external) {
            return (
              <a
                key={item.href}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <item.icon className="h-5 w-5" />
                {item.name}
                <ExternalLink className="ml-auto h-3 w-3 opacity-50" />
              </a>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-bastion-purple/15 text-bastion-purple-light"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t px-6 py-4">
        <p className="text-xs text-muted-foreground">Bastion v0.1.0</p>
      </div>
    </aside>
  );
}
