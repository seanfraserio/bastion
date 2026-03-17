import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { type AuditEntry } from "@/lib/mock-data";

interface RecentActivityProps {
  entries: AuditEntry[];
}

function statusBadgeVariant(
  status: AuditEntry["status"]
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "allowed":
      return "secondary";
    case "blocked":
      return "destructive";
    case "redacted":
      return "default";
    case "warned":
      return "outline";
  }
}

function statusColor(status: AuditEntry["status"]) {
  switch (status) {
    case "allowed":
      return "bg-green-500/10 text-green-500 border-green-500/20";
    case "blocked":
      return "bg-red-500/10 text-red-500 border-red-500/20";
    case "redacted":
      return "bg-blue-500/10 text-blue-500 border-blue-500/20";
    case "warned":
      return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
  }
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function RecentActivity({ entries }: RecentActivityProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-0">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="flex items-center justify-between border-b border-border/50 py-3 last:border-0"
          >
            <div className="flex items-center gap-3 min-w-0">
              <Badge
                variant={statusBadgeVariant(entry.status)}
                className={cn("shrink-0 text-[10px] capitalize", statusColor(entry.status))}
              >
                {entry.status}
              </Badge>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{entry.model}</p>
                <p className="text-xs text-muted-foreground">
                  {entry.provider}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4 shrink-0 text-right">
              <span className="text-xs tabular-nums text-muted-foreground">
                {entry.durationMs}ms
              </span>
              <span className="w-16 text-xs text-muted-foreground">
                {formatTimestamp(entry.timestamp)}
              </span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
