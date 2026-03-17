"use client";

import * as React from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateRangePicker, type DateRange } from "@/components/usage/date-range-picker";
import { ModelBreakdown } from "@/components/usage/model-breakdown";
import { CostTable } from "@/components/usage/cost-table";
import { getUsageTimeSeries, mockModelBreakdown } from "@/lib/mock-data";

const RANGE_DAYS: Record<DateRange, number> = { "7d": 7, "30d": 30, "90d": 90 };

export default function UsagePage() {
  const [range, setRange] = React.useState<DateRange>("30d");
  const data = getUsageTimeSeries(range);

  function handleRangeChange(newRange: DateRange) {
    setRange(newRange);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Usage Analytics</h1>
          <p className="text-muted-foreground">
            Monitor API usage, token consumption, and estimated costs.
          </p>
        </div>
        <DateRangePicker value={range} onChange={handleRangeChange} />
      </div>

      {/* Cost Summary Cards */}
      <CostTable data={mockModelBreakdown} days={RANGE_DAYS[range]} />

      {/* Requests Over Time Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Requests Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
            <AreaChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12 }}
                tickFormatter={(val: string) => {
                  const d = new Date(val);
                  return `${d.getMonth() + 1}/${d.getDate()}`;
                }}
                className="text-muted-foreground"
              />
              <YAxis tick={{ fontSize: 12 }} className="text-muted-foreground" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  color: "hsl(var(--foreground))",
                }}
                labelFormatter={(label: string) => {
                  const d = new Date(label);
                  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                }}
              />
              <Legend />
              <Area
                type="monotone"
                dataKey="anthropic"
                stackId="1"
                stroke="#8B5CF6"
                fill="#8B5CF6"
                fillOpacity={0.6}
                name="Anthropic"
              />
              <Area
                type="monotone"
                dataKey="openai"
                stackId="1"
                stroke="#3B82F6"
                fill="#3B82F6"
                fillOpacity={0.6}
                name="OpenAI"
              />
              <Area
                type="monotone"
                dataKey="ollama"
                stackId="1"
                stroke="#10B981"
                fill="#10B981"
                fillOpacity={0.6}
                name="Ollama"
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Model Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Model Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <ModelBreakdown data={mockModelBreakdown} />
        </CardContent>
      </Card>
    </div>
  );
}
