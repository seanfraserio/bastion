"use client";

import * as React from "react";
import { DollarSign, TrendingUp, Calendar } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ModelBreakdownRow } from "@/lib/mock-data";

interface CostTableProps {
  data: ModelBreakdownRow[];
  days: number;
}

export function CostTable({ data, days }: CostTableProps) {
  const totalCost = data.reduce((sum, row) => sum + row.estimatedCostUsd, 0);
  const dailyAverage = totalCost / days;
  const projectedMonthly = dailyAverage * 30;

  const cards = [
    {
      title: "Total Cost",
      value: `$${totalCost.toFixed(2)}`,
      description: `Last ${days} days`,
      icon: DollarSign,
    },
    {
      title: "Daily Average",
      value: `$${dailyAverage.toFixed(2)}`,
      description: "Per day",
      icon: Calendar,
    },
    {
      title: "Projected Monthly",
      value: `$${projectedMonthly.toFixed(2)}`,
      description: "Based on current usage",
      icon: TrendingUp,
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
            <card.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{card.value}</div>
            <p className="text-xs text-muted-foreground">{card.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
