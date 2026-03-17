"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PoliciesTable } from "@/components/policies/policies-table";
import { PolicyEditor } from "@/components/policies/policy-editor";
import { mockPolicies, type Policy } from "@/lib/mock-data";

export default function PoliciesPage() {
  const [policies] = React.useState(mockPolicies);
  const [editingPolicy, setEditingPolicy] = React.useState<Policy | null>(null);
  const [isCreating, setIsCreating] = React.useState(false);

  function handleEdit(policy: Policy) {
    setIsCreating(false);
    setEditingPolicy(policy);
  }

  function handleDelete(id: string) {
    // In production this would call the API
    console.log("Delete policy:", id);
  }

  function handleSave(
    _policy: Omit<Policy, "id" | "createdAt">
  ) {
    // In production this would call the API
    setEditingPolicy(null);
    setIsCreating(false);
  }

  function handleCancel() {
    setEditingPolicy(null);
    setIsCreating(false);
  }

  const showEditor = isCreating || editingPolicy !== null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Policies</h1>
          <p className="text-muted-foreground">
            Configure request and response filtering rules.
          </p>
        </div>
        {!showEditor && (
          <Button onClick={() => setIsCreating(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Policy
          </Button>
        )}
      </div>

      {showEditor && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {editingPolicy ? `Edit: ${editingPolicy.name}` : "New Policy"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PolicyEditor
              initialPolicy={editingPolicy ?? undefined}
              onSave={handleSave}
              onCancel={handleCancel}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Active Policies</CardTitle>
        </CardHeader>
        <CardContent>
          <PoliciesTable
            policies={policies}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        </CardContent>
      </Card>
    </div>
  );
}
