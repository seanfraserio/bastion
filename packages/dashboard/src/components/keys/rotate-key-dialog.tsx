"use client";

import * as React from "react";
import { Copy, AlertTriangle } from "lucide-react";
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

interface RotatedKeys {
  proxyKey: string;
  controlKey: string;
}

export function RotateKeyDialog() {
  const [open, setOpen] = React.useState(false);
  const [rotatedKeys, setRotatedKeys] = React.useState<RotatedKeys | null>(null);
  const [isRotating, setIsRotating] = React.useState(false);
  const [copiedField, setCopiedField] = React.useState<string | null>(null);

  function handleRotate() {
    setIsRotating(true);
    // In production this would call the API
    const genKey = (prefix: string) => {
      const random = Array.from({ length: 32 }, () =>
        Math.floor(Math.random() * 16).toString(16)
      ).join("");
      return `${prefix}sk-${random}`;
    };
    setTimeout(() => {
      setRotatedKeys({
        proxyKey: genKey("bst_proxy_"),
        controlKey: genKey("bst_ctrl_"),
      });
      setIsRotating(false);
    }, 800);
  }

  async function handleCopy(key: string, field: string) {
    await navigator.clipboard.writeText(key);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setTimeout(() => {
        setRotatedKeys(null);
        setCopiedField(null);
      }, 200);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">Rotate All Keys</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rotate All Keys</DialogTitle>
          <DialogDescription>
            Generate new proxy and control keys, invalidating all existing ones.
          </DialogDescription>
        </DialogHeader>

        {!rotatedKeys ? (
          <>
            <div className="space-y-4 py-4">
              <div className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-4">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="text-sm font-medium text-destructive">
                    This will invalidate your existing keys
                  </p>
                  <p className="mt-1 text-xs text-destructive/80">
                    All services using current proxy or control keys will stop
                    working until updated with the new keys.
                  </p>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleRotate}
                disabled={isRotating}
              >
                {isRotating ? "Rotating..." : "Rotate Keys"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <div className="space-y-4 py-4">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">New Proxy Key</label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 overflow-x-auto rounded-md bg-muted p-2.5 text-xs">
                    {rotatedKeys.proxyKey}
                  </code>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() =>
                      handleCopy(rotatedKeys.proxyKey, "proxy")
                    }
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                {copiedField === "proxy" && (
                  <p className="text-xs text-green-500">Copied</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">New Control Key</label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 overflow-x-auto rounded-md bg-muted p-2.5 text-xs">
                    {rotatedKeys.controlKey}
                  </code>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() =>
                      handleCopy(rotatedKeys.controlKey, "control")
                    }
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                {copiedField === "control" && (
                  <p className="text-xs text-green-500">Copied</p>
                )}
              </div>
            </div>

            <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3">
              <p className="text-sm font-medium text-yellow-500">
                These keys will only be shown once
              </p>
              <p className="mt-1 text-xs text-yellow-500/80">
                Copy both keys and update your services immediately.
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
