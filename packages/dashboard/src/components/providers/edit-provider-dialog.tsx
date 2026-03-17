"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { type Provider } from "@/lib/mock-data";

interface EditProviderDialogProps {
  provider: Provider | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: (data: {
    apiKey: string;
    baseUrl: string;
    timeoutMs: number;
  }) => void;
}

export function EditProviderDialog({
  provider,
  open,
  onOpenChange,
  onSave,
}: EditProviderDialogProps) {
  const [apiKey, setApiKey] = React.useState("");
  const [baseUrl, setBaseUrl] = React.useState("");
  const [timeoutMs, setTimeoutMs] = React.useState("30000");
  const [isSaving, setIsSaving] = React.useState(false);

  React.useEffect(() => {
    if (provider) {
      setApiKey("");
      setBaseUrl(provider.baseUrl ?? "");
      setTimeoutMs(String(provider.timeoutMs));
    }
  }, [provider]);

  function handleSave() {
    setIsSaving(true);
    // In production this would call the API
    setTimeout(() => {
      onSave?.({
        apiKey,
        baseUrl: baseUrl || "",
        timeoutMs: parseInt(timeoutMs) || 30000,
      });
      setIsSaving(false);
      onOpenChange(false);
    }, 500);
  }

  if (!provider) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{provider.name}</DialogTitle>
          <DialogDescription>
            Configure the {provider.name} provider connection settings.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">API Key</label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                provider.configured
                  ? "Enter new key to update"
                  : "Enter your API key"
              }
            />
            {provider.configured && (
              <p className="text-xs text-muted-foreground">
                Leave empty to keep the existing key.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Base URL{" "}
              <span className="text-muted-foreground">(optional)</span>
            </label>
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={
                provider.slug === "ollama"
                  ? "http://localhost:11434"
                  : "Leave empty for default"
              }
            />
            <p className="text-xs text-muted-foreground">
              Override the default API endpoint. Useful for proxies or
              self-hosted deployments.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Timeout (ms)</label>
            <Input
              type="number"
              min="1000"
              step="1000"
              value={timeoutMs}
              onChange={(e) => setTimeoutMs(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
