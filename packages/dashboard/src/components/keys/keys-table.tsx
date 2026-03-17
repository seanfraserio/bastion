"use client";

import * as React from "react";
import { Copy, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { type ApiKey } from "@/lib/mock-data";

interface KeysTableProps {
  keys: ApiKey[];
}

function maskKey(prefix: string, suffix: string) {
  return `${prefix}****${suffix}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function KeysTable({ keys }: KeysTableProps) {
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  async function handleCopy(key: ApiKey) {
    const masked = maskKey(key.prefix, key.suffix);
    await navigator.clipboard.writeText(masked);
    setCopiedId(key.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function handleDelete(id: string) {
    // In production this would call the API
    console.log("Delete key:", id);
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Key</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Created</TableHead>
          <TableHead>Last Used</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {keys.map((key) => (
          <TableRow key={key.id}>
            <TableCell>
              <code className="rounded bg-muted px-2 py-1 text-xs">
                {maskKey(key.prefix, key.suffix)}
              </code>
            </TableCell>
            <TableCell>
              <Badge
                variant={key.type === "proxy" ? "default" : "secondary"}
                className="capitalize"
              >
                {key.type}
              </Badge>
            </TableCell>
            <TableCell className="text-muted-foreground">
              {formatDate(key.createdAt)}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {formatDate(key.lastUsedAt)}
            </TableCell>
            <TableCell className="text-right">
              <div className="flex items-center justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleCopy(key)}
                  title="Copy key"
                >
                  <Copy className="h-4 w-4" />
                  {copiedId === key.id && (
                    <span className="sr-only">Copied</span>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(key.id)}
                  title="Delete key"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
        {keys.length === 0 && (
          <TableRow>
            <TableCell colSpan={5} className="text-center text-muted-foreground">
              No API keys yet. Generate one to get started.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
