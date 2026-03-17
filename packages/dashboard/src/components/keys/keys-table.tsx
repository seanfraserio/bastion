"use client";

import * as React from "react";
import { Copy, Trash2, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  onDelete?: (id: string) => void;
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

export function KeysTable({ keys, onDelete }: KeysTableProps) {
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<ApiKey | null>(null);

  async function handleCopy(key: ApiKey) {
    const masked = maskKey(key.prefix, key.suffix);
    await navigator.clipboard.writeText(masked);
    setCopiedId(key.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function handleDeleteConfirm() {
    if (deleteTarget && onDelete) {
      onDelete(deleteTarget.id);
    }
    setDeleteTarget(null);
  }

  return (
    <>
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
                    {copiedId === key.id ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteTarget(key)}
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

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete API Key</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this {deleteTarget?.type} key{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                {deleteTarget ? maskKey(deleteTarget.prefix, deleteTarget.suffix) : ""}
              </code>
              ? This action cannot be undone. Any applications using this key will stop working.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm}>
              Delete Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
