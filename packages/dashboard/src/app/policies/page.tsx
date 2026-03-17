"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PoliciesTable } from "@/components/policies/policies-table";
import { PolicyEditor } from "@/components/policies/policy-editor";
import {
  PolicyTemplates,
  type PolicyTemplate,
} from "@/components/policies/policy-templates";
import { mockPolicies, type Policy } from "@/lib/mock-data";

export default function PoliciesPage() {
  const [policies] = React.useState(mockPolicies);
  const [editingPolicy, setEditingPolicy] = React.useState<Policy | null>(null);
  const [isCreating, setIsCreating] = React.useState(false);

  // When a template is selected we store a partial Policy to pre-fill the editor
  const [templateSeed, setTemplateSeed] = React.useState<Partial<Policy> | undefined>(
    undefined
  );
  // Which tab to show inside the creation card
  const [createTab, setCreateTab] = React.useState<string>("templates");

  function handleEdit(policy: Policy) {
    setIsCreating(false);
    setTemplateSeed(undefined);
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
    setTemplateSeed(undefined);
  }

  function handleCancel() {
    setEditingPolicy(null);
    setIsCreating(false);
    setTemplateSeed(undefined);
  }

  function handleTemplateSelect(template: PolicyTemplate) {
    // Map the PolicyTemplate shape into the PolicyEditor's initialPolicy shape
    const triggerMap: Record<string, Policy["trigger"]> = {
      request: "request",
      response: "response",
      both: "both",
    };

    const conditionType = template.condition.type;
    const condition: Record<string, unknown> = { ...template.condition };
    delete condition.type;

    setTemplateSeed({
      name: template.name,
      trigger: triggerMap[template.on] ?? "request",
      action: template.action as Policy["action"],
      conditionType,
      condition,
      enabled: true,
    });
    setCreateTab("custom");
  }

  function handleStartCreating() {
    setIsCreating(true);
    setTemplateSeed(undefined);
    setCreateTab("templates");
  }

  const showEditor = isCreating || editingPolicy !== null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Policies</h1>
          <p className="text-muted-foreground">
            Configure request and response filtering rules.
          </p>
        </div>
        {!showEditor && (
          <Button onClick={handleStartCreating}>
            <Plus className="mr-2 h-4 w-4" />
            Add Policy
          </Button>
        )}
      </div>

      {/* Editing an existing policy -- no tabs, just the editor */}
      {editingPolicy && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              Edit: {editingPolicy.name}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PolicyEditor
              initialPolicy={editingPolicy}
              onSave={handleSave}
              onCancel={handleCancel}
            />
          </CardContent>
        </Card>
      )}

      {/* Creating a new policy -- tabs: Templates | Custom */}
      {isCreating && !editingPolicy && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">New Policy</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={createTab} onValueChange={setCreateTab}>
              <TabsList>
                <TabsTrigger value="templates">Templates</TabsTrigger>
                <TabsTrigger value="custom">Custom</TabsTrigger>
              </TabsList>

              <TabsContent value="templates">
                <PolicyTemplates onSelect={handleTemplateSelect} />
                <div className="mt-4">
                  <Button variant="outline" onClick={handleCancel}>
                    Cancel
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="custom">
                <PolicyEditor
                  key={templateSeed?.name ?? "__blank"}
                  initialPolicy={
                    templateSeed
                      ? ({
                          id: "",
                          createdAt: "",
                          ...templateSeed,
                        } as Policy)
                      : undefined
                  }
                  onSave={handleSave}
                  onCancel={handleCancel}
                />
              </TabsContent>
            </Tabs>
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
