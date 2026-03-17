import { type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: { value: number; direction: "up" | "down" };
  icon: LucideIcon;
}

export function StatCard({ title, value, subtitle, trend, icon: Icon }: StatCardProps) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
            {trend && (
              <div
                className={cn(
                  "flex items-center gap-1 text-xs font-medium",
                  trend.direction === "up"
                    ? "text-green-500"
                    : "text-red-500"
                )}
              >
                <span>
                  {trend.direction === "up" ? "\u2191" : "\u2193"}
                </span>
                <span>{trend.value}%</span>
                <span className="text-muted-foreground">vs last period</span>
              </div>
            )}
          </div>
          <div className="shrink-0 rounded-lg bg-bastion-purple/10 p-3">
            <Icon className="h-6 w-6 text-bastion-purple" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
