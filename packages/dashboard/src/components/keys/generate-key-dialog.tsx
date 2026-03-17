"use client";

import * as React from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function GenerateKeyDialog() {
  const [open, setOpen] = React.useState(false);
  const [keyType, setKeyType] = React.useState<"proxy" | "control">("proxy");
  const [generatedKey, setGeneratedKey] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [isGenerating, setIsGenerating] = React.useState(false);

  function handleGenerate() {
    setIsGenerating(true);
    // In production this would call the API
    const prefix = keyType === "proxy" ? "bst_proxy_" : "bst_ctrl_";
    const random = Array.from({ length: 32 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join("");
    const key = `${prefix}sk-${random}`;
    setTimeout(() => {
      setGeneratedKey(key);
      setIsGenerating(false);
    }, 500);
  }

  async function handleCopy() {
    if (!generatedKey) return;
    await navigator.clipboard.writeText(generatedKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      // Reset state when dialog closes
      setTimeout(() => {
        setGeneratedKey(null);
        setCopied(false);
        setKeyType("proxy");
      }, 200);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>Generate API Key</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate API Key</DialogTitle>
          <DialogDescription>
            Create a new API key for authenticating with the Bastion proxy.
          </DialogDescription>
        </DialogHeader>

        {!generatedKey ? (
          <>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Key Type</label>
                <Select
                  value={keyType}
                  onValueChange={(v) => setKeyType(v as "proxy" | "control")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="proxy">Proxy Key</SelectItem>
                    <SelectItem value="control">Control Key</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {keyType === "proxy"
                    ? "Proxy keys authenticate AI agent requests through the gateway."
                    : "Control keys manage tenant configuration and settings."}
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleGenerate} disabled={isGenerating}>
                {isGenerating ? "Generating..." : "Generate"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Your new API key</label>
              <div className="flex items-center gap-2">
                <code className="flex-1 overflow-x-auto rounded-md bg-muted p-3 text-xs">
                  {generatedKey}
                </code>
                <Button variant="outline" size="icon" onClick={handleCopy}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              {copied && (
                <p className="text-xs text-green-500">Copied to clipboard</p>
              )}
            </div>
            <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3">
              <p className="text-sm font-medium text-yellow-500">
                This key will only be shown once
              </p>
              <p className="mt-1 text-xs text-yellow-500/80">
                Make sure to copy and store it securely. You will not be able to
                see the full key again.
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
