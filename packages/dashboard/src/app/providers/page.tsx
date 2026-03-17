"use client";

import * as React from "react";
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
  const [providers] = React.useState(mockProviders);
  const [editingProvider, setEditingProvider] = React.useState<Provider | null>(
    null
  );
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const primaryProvider = providers.find((p) => p.role === "primary");
  const fallbackProvider = providers.find((p) => p.role === "fallback");

  function handleEdit(provider: Provider) {
    setEditingProvider(provider);
    setDialogOpen(true);
  }

  function handleSave(_data: {
    apiKey: string;
    baseUrl: string;
    timeoutMs: number;
  }) {
    // In production this would call the API to update the provider
    console.log("Save provider config:", editingProvider?.id, _data);
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
            onValueChange={() => {
              // In production: update provider roles
            }}
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
            onValueChange={() => {
              // In production: update provider roles
            }}
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

      <EditProviderDialog
        provider={editingProvider}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSave={handleSave}
      />
    </div>
  );
}
