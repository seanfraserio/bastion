import { Activity, DollarSign, ShieldAlert, Zap } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/dashboard/stat-card";
import { UsageChart } from "@/components/dashboard/usage-chart";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import {
  mockOverviewStats,
  mockUsage7d,
  mockAuditLog,
} from "@/lib/mock-data";

export default function OverviewPage() {
  const stats = mockOverviewStats;
  const recentEntries = mockAuditLog.slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
          <p className="text-muted-foreground">
            Your Bastion gateway at a glance.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild size="sm">
            <Link href="/keys">Generate API Key</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/policies">Add Policy</Link>
          </Button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Requests"
          value={stats.totalRequests.toLocaleString()}
          subtitle="Last 30 days"
          trend={{ value: 12, direction: "up" }}
          icon={Zap}
        />
        <StatCard
          title="Blocked"
          value={stats.blocked.toLocaleString()}
          subtitle="Last 30 days"
          trend={{ value: 3, direction: "down" }}
          icon={ShieldAlert}
        />
        <StatCard
          title="Estimated Cost"
          value={`$${stats.estimatedCost.toFixed(2)}`}
          subtitle="Last 30 days"
          trend={{ value: 8, direction: "up" }}
          icon={DollarSign}
        />
        <StatCard
          title="Cache Hit Rate"
          value={`${stats.cacheHitRate}%`}
          subtitle="Last 30 days"
          trend={{ value: 5, direction: "up" }}
          icon={Activity}
        />
      </div>

      {/* Usage chart */}
      <UsageChart initialData={mockUsage7d} />

      {/* Recent activity */}
      <RecentActivity entries={recentEntries} />
    </div>
  );
}
