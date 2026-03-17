"use client";

import * as React from "react";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ExtendedAuditEntry } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

interface AuditTableProps {
  entries: ExtendedAuditEntry[];
}

const STATUS_STYLES: Record<ExtendedAuditEntry["status"], string> = {
  success: "bg-green-500/15 text-green-500 border-green-500/20",
  blocked: "bg-red-500/15 text-red-500 border-red-500/20",
  error: "bg-yellow-500/15 text-yellow-500 border-yellow-500/20",
};

const PAGE_SIZES = [10, 25, 50];

export function AuditTable({ entries }: AuditTableProps) {
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [providerFilter, setProviderFilter] = React.useState<string>("all");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);
  const [expandedRow, setExpandedRow] = React.useState<string | null>(null);

  // Get unique providers from data
  const providers = React.useMemo(
    () => Array.from(new Set(entries.map((e) => e.provider))).sort(),
    [entries]
  );

  // Filter entries
  const filtered = React.useMemo(() => {
    return entries.filter((entry) => {
      if (statusFilter !== "all" && entry.status !== statusFilter) return false;
      if (providerFilter !== "all" && entry.provider !== providerFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          entry.model.toLowerCase().includes(q) ||
          entry.provider.toLowerCase().includes(q) ||
          entry.id.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [entries, statusFilter, providerFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePageNum = Math.min(page, totalPages);
  const paginated = filtered.slice(
    (safePageNum - 1) * pageSize,
    safePageNum * pageSize
  );

  // Reset page when filters change
  React.useEffect(() => {
    setPage(1);
  }, [statusFilter, providerFilter, searchQuery, pageSize]);

  function toggleRow(id: string) {
    setExpandedRow(expandedRow === id ? null : id);
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search model, provider, or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="blocked">Blocked</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </SelectContent>
        </Select>
        <Select value={providerFilter} onValueChange={setProviderFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Provider" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All providers</SelectItem>
            {providers.map((p) => (
              <SelectItem key={p} value={p} className="capitalize">
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Timestamp</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Model</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Duration</TableHead>
              <TableHead className="text-right">Tokens</TableHead>
              <TableHead className="text-right">Cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                  No audit entries found.
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((entry) => (
                <React.Fragment key={entry.id}>
                  <TableRow
                    className={cn(
                      "cursor-pointer",
                      expandedRow === entry.id && "bg-muted/50"
                    )}
                    onClick={() => toggleRow(entry.id)}
                  >
                    <TableCell className="w-8">
                      {entry.policyDecisions && entry.policyDecisions.length > 0 ? (
                        expandedRow === entry.id ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )
                      ) : null}
                    </TableCell>
                    <TableCell className="font-mono text-xs whitespace-nowrap">
                      {new Date(entry.timestamp).toLocaleString()}
                    </TableCell>
                    <TableCell className="capitalize">{entry.provider}</TableCell>
                    <TableCell className="font-mono text-sm">{entry.model}</TableCell>
                    <TableCell>
                      <Badge className={cn("capitalize", STATUS_STYLES[entry.status])}>
                        {entry.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {entry.durationMs}ms
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-xs">
                      {entry.inputTokens.toLocaleString()} / {entry.outputTokens.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      ${entry.estimatedCostUsd.toFixed(4)}
                    </TableCell>
                  </TableRow>
                  {expandedRow === entry.id && entry.policyDecisions && (
                    <TableRow>
                      <TableCell colSpan={8} className="bg-muted/30 px-8 py-3">
                        <div className="space-y-2">
                          <p className="text-sm font-medium">Policy Decisions</p>
                          {entry.policyDecisions.map((pd, idx) => (
                            <div
                              key={idx}
                              className="flex items-center gap-3 rounded-md border bg-card p-2 text-sm"
                            >
                              <Badge variant="outline" className="capitalize">
                                {pd.action}
                              </Badge>
                              <span className="font-medium">{pd.policy}</span>
                              <span className="text-muted-foreground">{pd.reason}</span>
                            </div>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Rows per page:</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => setPageSize(Number(v))}
          >
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span>
            {filtered.length} total entries
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePageNum <= 1}
          >
            Prev
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {safePageNum} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePageNum >= totalPages}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
