"use client";

import * as React from "react";
import { ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { ModelBreakdownRow } from "@/lib/mock-data";

type SortKey = keyof ModelBreakdownRow;
type SortDir = "asc" | "desc";

interface ModelBreakdownProps {
  data: ModelBreakdownRow[];
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function ModelBreakdown({ data }: ModelBreakdownProps) {
  const [sortKey, setSortKey] = React.useState<SortKey>("requests");
  const [sortDir, setSortDir] = React.useState<SortDir>("desc");

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const sorted = React.useMemo(() => {
    return [...data].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc"
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      const aNum = Number(aVal);
      const bNum = Number(bVal);
      return sortDir === "asc" ? aNum - bNum : bNum - aNum;
    });
  }, [data, sortKey, sortDir]);

  const columns: { key: SortKey; label: string; align?: "right" }[] = [
    { key: "model", label: "Model" },
    { key: "provider", label: "Provider" },
    { key: "requests", label: "Requests", align: "right" },
    { key: "inputTokens", label: "Input Tokens", align: "right" },
    { key: "outputTokens", label: "Output Tokens", align: "right" },
    { key: "estimatedCostUsd", label: "Est. Cost", align: "right" },
  ];

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {columns.map((col) => (
            <TableHead key={col.key} className={col.align === "right" ? "text-right" : ""}>
              <Button
                variant="ghost"
                size="sm"
                className="-ml-3 h-8 font-medium"
                onClick={() => handleSort(col.key)}
              >
                {col.label}
                <ArrowUpDown className="ml-1 h-3 w-3" />
              </Button>
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((row) => (
          <TableRow key={`${row.provider}-${row.model}`}>
            <TableCell className="font-mono text-sm">{row.model}</TableCell>
            <TableCell>
              <Badge variant="secondary" className="capitalize">
                {row.provider}
              </Badge>
            </TableCell>
            <TableCell className="text-right tabular-nums">{formatNumber(row.requests)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatNumber(row.inputTokens)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatNumber(row.outputTokens)}</TableCell>
            <TableCell className="text-right tabular-nums font-medium">
              ${row.estimatedCostUsd.toFixed(2)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
