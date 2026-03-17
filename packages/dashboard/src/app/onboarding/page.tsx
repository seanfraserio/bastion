"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Check, Copy, ArrowRight, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createTenant, type Tenant } from "@/lib/api";

type Step = 1 | 2 | 3;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = React.useState<Step>(1);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Step 1
  const [orgName, setOrgName] = React.useState("");

  // Step 2
  const [anthropicKey, setAnthropicKey] = React.useState("");
  const [openaiKey, setOpenaiKey] = React.useState("");

  // Step 3
  const [tenant, setTenant] = React.useState<Tenant | null>(null);
  const [copiedControl, setCopiedControl] = React.useState(false);
  const [copiedProxy, setCopiedProxy] = React.useState(false);

  const hasProvider = anthropicKey.trim() !== "" || openaiKey.trim() !== "";

  async function handleSubmit() {
    setIsLoading(true);
    setError(null);
    try {
      const providerKeys: Record<string, string> = {};
      if (anthropicKey.trim()) providerKeys.anthropic = anthropicKey.trim();
      if (openaiKey.trim()) providerKeys.openai = openaiKey.trim();

      const result = await createTenant({
        name: orgName.trim(),
        providerKeys,
      });
      setTenant(result);
      setStep(3);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create tenant"
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function copyToClipboard(text: string, type: "control" | "proxy") {
    await navigator.clipboard.writeText(text);
    if (type === "control") {
      setCopiedControl(true);
      setTimeout(() => setCopiedControl(false), 2000);
    } else {
      setCopiedProxy(true);
      setTimeout(() => setCopiedProxy(false), 2000);
    }
  }

  const stepIndicator = (
    <div className="flex items-center justify-center gap-2 pb-2">
      {[1, 2, 3].map((s) => (
        <div
          key={s}
          className={`h-2 w-2 rounded-full transition-colors ${
            s === step
              ? "bg-bastion-purple"
              : s < step
                ? "bg-bastion-purple/50"
                : "bg-muted"
          }`}
        />
      ))}
    </div>
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#1a1d23] p-4">
      <Card className="w-full max-w-lg border-border/50 bg-card">
        <CardHeader className="items-center space-y-4">
          <Image
            src="/logo.svg"
            alt="Bastion"
            width={48}
            height={53}
            className="h-12 w-auto"
          />
          {stepIndicator}
        </CardHeader>

        {/* Step 1: Organization Name */}
        {step === 1 && (
          <>
            <CardContent className="space-y-4">
              <div className="space-y-2 text-center">
                <CardTitle>Create your organization</CardTitle>
                <CardDescription>
                  Choose a name for your Bastion tenant
                </CardDescription>
              </div>
              <div className="space-y-2">
                <label
                  htmlFor="org-name"
                  className="text-sm font-medium text-foreground"
                >
                  Organization name
                </label>
                <Input
                  id="org-name"
                  placeholder="Acme Corp"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                />
              </div>
            </CardContent>
            <CardFooter className="justify-end">
              <Button
                onClick={() => setStep(2)}
                disabled={!orgName.trim()}
              >
                Continue
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardFooter>
          </>
        )}

        {/* Step 2: Provider API Keys */}
        {step === 2 && (
          <>
            <CardContent className="space-y-4">
              <div className="space-y-2 text-center">
                <CardTitle>Connect your providers</CardTitle>
                <CardDescription>
                  Add at least one provider API key to get started
                </CardDescription>
              </div>
              <div className="space-y-2">
                <label
                  htmlFor="anthropic-key"
                  className="text-sm font-medium text-foreground"
                >
                  Anthropic API Key
                </label>
                <Input
                  id="anthropic-key"
                  type="password"
                  placeholder="sk-ant-..."
                  value={anthropicKey}
                  onChange={(e) => setAnthropicKey(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label
                  htmlFor="openai-key"
                  className="text-sm font-medium text-foreground"
                >
                  OpenAI API Key
                </label>
                <Input
                  id="openai-key"
                  type="password"
                  placeholder="sk-..."
                  value={openaiKey}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                />
              </div>
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
            </CardContent>
            <CardFooter className="justify-between">
              <Button variant="ghost" onClick={() => setStep(1)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!hasProvider || isLoading}
              >
                {isLoading ? "Creating..." : "Create tenant"}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardFooter>
          </>
        )}

        {/* Step 3: Keys */}
        {step === 3 && tenant && (
          <>
            <CardContent className="space-y-6">
              <div className="space-y-2 text-center">
                <CardTitle>You&apos;re all set!</CardTitle>
                <CardDescription>
                  Save these keys -- the full values won&apos;t be shown again
                </CardDescription>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    Control Key (Admin API)
                  </label>
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={tenant.controlKey}
                      className="font-mono text-xs"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() =>
                        copyToClipboard(tenant.controlKey, "control")
                      }
                    >
                      {copiedControl ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    Proxy Key (Agent Traffic)
                  </label>
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={tenant.proxyKey}
                      className="font-mono text-xs"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() =>
                        copyToClipboard(tenant.proxyKey, "proxy")
                      }
                    >
                      {copiedProxy ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="justify-end">
              <Button onClick={() => router.push("/")}>
                Continue to Dashboard
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardFooter>
          </>
        )}
      </Card>
    </div>
  );
}
