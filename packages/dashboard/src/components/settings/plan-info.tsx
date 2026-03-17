"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface PlanInfoProps {
  plan: string;
  price: string;
  usage: {
    requestsUsed: number;
    requestsLimit: number;
    tokensUsed: number;
    tokensLimit: number;
  };
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = Math.min(100, (value / max) * 100);
  const isHigh = pct > 80;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">
          {formatNumber(value)} / {formatNumber(max)}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className={`h-full rounded-full transition-all ${
            isHigh ? "bg-destructive" : "bg-gradient-to-r from-bastion-purple to-bastion-blue"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function PlanInfo({ plan, price, usage }: PlanInfoProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Plan</CardTitle>
        <CardDescription>Your current subscription and usage limits.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <p className="text-lg font-semibold capitalize">{plan}</p>
            <p className="text-sm text-muted-foreground">{price}</p>
          </div>
        </div>
        <div className="space-y-4">
          <ProgressBar
            value={usage.requestsUsed}
            max={usage.requestsLimit}
            label="API Requests"
          />
          <ProgressBar
            value={usage.tokensUsed}
            max={usage.tokensLimit}
            label="Tokens"
          />
        </div>
      </CardContent>
    </Card>
  );
}
