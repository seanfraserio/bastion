"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface TenantFormProps {
  name: string;
  email: string;
  onSave: (name: string) => void;
}

export function TenantForm({ name, email, onSave }: TenantFormProps) {
  const [editedName, setEditedName] = React.useState(name);
  const [isSaving, setIsSaving] = React.useState(false);
  const isDirty = editedName !== name;

  async function handleSave() {
    if (!isDirty) return;
    setIsSaving(true);
    try {
      onSave(editedName);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Organization Details</CardTitle>
        <CardDescription>Manage your tenant organization name.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="tenant-name" className="text-sm font-medium">
            Organization Name
          </label>
          <div className="flex items-center gap-3">
            <Input
              id="tenant-name"
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              className="max-w-sm"
            />
            <Button
              onClick={handleSave}
              disabled={!isDirty || isSaving}
              size="sm"
            >
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Email</label>
          <Input value={email} disabled className="max-w-sm" />
          <p className="text-xs text-muted-foreground">
            Contact support to change your email address.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
