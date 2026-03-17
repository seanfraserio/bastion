"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import type { TeamMember } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const ROLE_STYLES: Record<string, string> = {
  admin: "bg-purple-500/15 text-purple-500 border-purple-500/20",
  member: "bg-gray-500/15 text-gray-400 border-gray-500/20",
};

interface TeamTableProps {
  members: TeamMember[];
  onRoleChange: (memberId: string, role: "admin" | "member") => void;
  onRemove: (memberId: string) => void;
}

export function TeamTable({ members, onRoleChange, onRemove }: TeamTableProps) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Invited</TableHead>
            <TableHead>Accepted</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                No team members yet. Invite someone to get started.
              </TableCell>
            </TableRow>
          ) : (
            members.map((member) => (
              <TableRow key={member.id}>
                <TableCell className="font-medium">{member.email}</TableCell>
                <TableCell>
                  <Badge className={cn("capitalize", ROLE_STYLES[member.role])}>
                    {member.role}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(member.invitedAt).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-sm">
                  {member.acceptedAt ? (
                    <span className="text-green-500">
                      {new Date(member.acceptedAt).toLocaleDateString()}
                    </span>
                  ) : (
                    <span className="text-yellow-500">Pending</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Select
                      value={member.role}
                      onValueChange={(value) =>
                        onRoleChange(member.id, value as "admin" | "member")
                      }
                    >
                      <SelectTrigger className="h-8 w-[110px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="member">Member</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => onRemove(member.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
