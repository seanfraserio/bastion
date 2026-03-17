"use client";

import * as React from "react";
import { CheckCircle } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProviderCard } from "@/components/providers/provider-card";
import { EditProviderDialog } from "@/components/providers/edit-provider-dialog";
import { mockProviders, type Provider } from "@/lib/mock-data";

export default function ProvidersPage() {
  const [providers, setProviders] = React.useState(mockProviders);
  const [editingProvider, setEditingProvider] = React.useState<Provider | null>(
    null
  );
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [saveSuccess, setSaveSuccess] = React.useState(false);

  const primaryProvider = providers.find((p) => p.role === "primary");
  const fallbackProvider = providers.find((p) => p.role === "fallback");

  function handlePrimaryChange(providerId: string) {
    setProviders((prev) =>
      prev.map((p) => ({
        ...p,
        role:
          p.id === providerId
            ? ("primary" as const)
            : p.role === "primary"
              ? ("none" as const)
              : p.role,
      }))
    );
  }

  function handleFallbackChange(providerId: string) {
    setProviders((prev) =>
      prev.map((p) => ({
        ...p,
        role:
          p.id === providerId
            ? ("fallback" as const)
            : p.role === "fallback"
              ? ("none" as const)
              : p.role,
      }))
    );
  }

  function handleEdit(provider: Provider) {
    setEditingProvider(provider);
    setDialogOpen(true);
  }

  function handleSave(data: {
    apiKey: string;
    baseUrl: string;
    timeoutMs: number;
  }) {
    if (!editingProvider) return;
    // Update the provider config in local state
    setProviders((prev) =>
      prev.map((p) =>
        p.id === editingProvider.id
          ? {
              ...p,
              baseUrl: data.baseUrl || null,
              timeoutMs: data.timeoutMs,
              configured: true,
            }
          : p
      )
    );
    setDialogOpen(false);
    setEditingProvider(null);
    // Show brief success indicator
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Providers</h1>
        <p className="text-muted-foreground">
          Configure LLM provider connections and failover routing.
        </p>
      </div>

      {/* Primary / Fallback selector */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium">Primary Provider</label>
          <Select
            value={primaryProvider?.id ?? ""}
            onValueChange={handlePrimaryChange}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select primary" />
            </SelectTrigger>
            <SelectContent>
              {providers
                .filter((p) => p.configured)
                .map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Fallback Provider</label>
          <Select
            value={fallbackProvider?.id ?? ""}
            onValueChange={handleFallbackChange}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select fallback" />
            </SelectTrigger>
            <SelectContent>
              {providers
                .filter((p) => p.configured)
                .map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Provider cards grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {providers.map((provider) => (
          <ProviderCard
            key={provider.id}
            provider={provider}
            onEdit={handleEdit}
          />
        ))}
      </div>

      {saveSuccess && (
        <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm font-medium text-green-500">
          <CheckCircle className="h-4 w-4" />
          Provider configuration saved successfully.
        </div>
      )}

      <EditProviderDialog
        provider={editingProvider}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSave={handleSave}
      />
    </div>
  );
}
