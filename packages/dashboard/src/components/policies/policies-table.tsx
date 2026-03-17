"use client";

import { Edit, Trash2 } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { type Policy } from "@/lib/mock-data";

interface PoliciesTableProps {
  policies: Policy[];
  onEdit?: (policy: Policy) => void;
  onDelete?: (id: string) => void;
}

function actionColor(action: Policy["action"]) {
  switch (action) {
    case "block":
      return "bg-red-500/10 text-red-500 border-red-500/20";
    case "warn":
      return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
    case "redact":
      return "bg-blue-500/10 text-blue-500 border-blue-500/20";
    case "tag":
      return "bg-gray-500/10 text-gray-400 border-gray-500/20";
  }
}

function conditionSummary(policy: Policy): string {
  const cond = policy.condition;
  switch (policy.conditionType) {
    case "contains":
      return `${cond.field} contains "${cond.value}"`;
    case "regex":
      return `${cond.field} matches /${cond.value}/`;
    case "injection_score":
      return `injection score > ${cond.threshold}`;
    case "pii_detected":
      return `PII: ${(cond.entities as string[]).join(", ")}`;
    case "length_exceeds":
      return `${cond.field} length > ${cond.value}`;
    default:
      return policy.conditionType;
  }
}

export function PoliciesTable({ policies, onEdit, onDelete }: PoliciesTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Trigger</TableHead>
          <TableHead>Action</TableHead>
          <TableHead>Condition</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {policies.map((policy) => (
          <TableRow key={policy.id}>
            <TableCell className="font-medium">
              {policy.name}
              {!policy.enabled && (
                <span className="ml-2 text-xs text-muted-foreground">
                  (disabled)
                </span>
              )}
            </TableCell>
            <TableCell>
              <Badge variant="outline" className="capitalize">
                {policy.trigger}
              </Badge>
            </TableCell>
            <TableCell>
              <Badge
                variant="outline"
                className={cn("capitalize", actionColor(policy.action))}
              >
                {policy.action}
              </Badge>
            </TableCell>
            <TableCell className="max-w-[280px] truncate text-sm text-muted-foreground">
              {conditionSummary(policy)}
            </TableCell>
            <TableCell className="text-right">
              <div className="flex items-center justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onEdit?.(policy)}
                  title="Edit policy"
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDelete?.(policy.id)}
                  title="Delete policy"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
        {policies.length === 0 && (
          <TableRow>
            <TableCell
              colSpan={5}
              className="text-center text-muted-foreground"
            >
              No policies configured. Add one to get started.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
