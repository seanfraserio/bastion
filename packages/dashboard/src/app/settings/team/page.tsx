"use client";

import * as React from "react";
import { TeamTable } from "@/components/team/team-table";
import { InviteDialog } from "@/components/team/invite-dialog";
import { mockTeamMembers, type TeamMember } from "@/lib/mock-data";

export default function TeamPage() {
  const [members, setMembers] = React.useState<TeamMember[]>(mockTeamMembers);

  function handleRoleChange(memberId: string, role: "admin" | "member") {
    setMembers((prev) =>
      prev.map((m) => (m.id === memberId ? { ...m, role } : m))
    );
  }

  function handleRemove(memberId: string) {
    setMembers((prev) => prev.filter((m) => m.id !== memberId));
  }

  function handleInvite(email: string, role: "admin" | "member") {
    const newMember: TeamMember = {
      id: `tm-${Date.now()}`,
      email,
      role,
      invitedAt: new Date().toISOString(),
      acceptedAt: null,
    };
    setMembers((prev) => [...prev, newMember]);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Team</h1>
          <p className="text-muted-foreground">
            Manage team members and their roles within your organization.
          </p>
        </div>
        <InviteDialog onInvite={handleInvite} />
      </div>

      <TeamTable
        members={members}
        onRoleChange={handleRoleChange}
        onRemove={handleRemove}
      />
    </div>
  );
}
