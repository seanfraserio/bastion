"use client";

import * as React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type UsageStat } from "@/lib/mock-data";
import { getUsageData } from "@/lib/mock-data";

interface UsageChartProps {
  initialData: UsageStat[];
}

export function UsageChart({ initialData }: UsageChartProps) {
  const [range, setRange] = React.useState<"7d" | "30d" | "90d">("7d");
  const [data, setData] = React.useState(initialData);

  React.useEffect(() => {
    // In production this would be an API call; for now use mock data
    setData(getUsageData(range));
  }, [range]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg font-semibold">
          Requests Over Time
        </CardTitle>
        <Tabs
          value={range}
          onValueChange={(v) => setRange(v as "7d" | "30d" | "90d")}
        >
          <TabsList>
            <TabsTrigger value="7d">7d</TabsTrigger>
            <TabsTrigger value="30d">30d</TabsTrigger>
            <TabsTrigger value="90d">90d</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent>
        <div className="h-[320px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="hsl(var(--border))"
              />
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) => {
                  const date = new Date(d);
                  return `${date.getMonth() + 1}/${date.getDate()}`;
                }}
                tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "var(--radius)",
                  color: "hsl(var(--foreground))",
                  fontSize: 12,
                }}
                labelFormatter={(d: string) => {
                  const date = new Date(d);
                  return date.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  });
                }}
              />
              <Bar
                dataKey="requests"
                fill="#8b5cf6"
                radius={[4, 4, 0, 0]}
                maxBarSize={40}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
