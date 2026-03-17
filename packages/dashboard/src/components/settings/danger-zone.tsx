"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface DangerZoneProps {
  tenantName: string;
  onDelete: () => void;
}

export function DangerZone({ tenantName, onDelete }: DangerZoneProps) {
  const [confirmText, setConfirmText] = React.useState("");
  const [isDeleting, setIsDeleting] = React.useState(false);
  const isConfirmed = confirmText === tenantName;

  async function handleDelete() {
    if (!isConfirmed) return;
    setIsDeleting(true);
    try {
      onDelete();
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
        </div>
        <CardDescription>
          Irreversible and destructive actions.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-destructive/30 p-4 space-y-3">
          <div>
            <p className="font-medium">Delete Tenant</p>
            <p className="text-sm text-muted-foreground">
              Permanently delete this tenant and all associated data. This action cannot be undone.
            </p>
          </div>
          <div className="space-y-2">
            <label htmlFor="confirm-delete" className="text-sm text-muted-foreground">
              Type <span className="font-mono font-semibold text-foreground">{tenantName}</span> to confirm
            </label>
            <div className="flex items-center gap-3">
              <Input
                id="confirm-delete"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={tenantName}
                className="max-w-sm"
              />
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={!isConfirmed || isDeleting}
              >
                {isDeleting ? "Deleting..." : "Delete Tenant"}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
