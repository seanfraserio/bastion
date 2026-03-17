"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  Check,
  Copy,
  ArrowRight,
  ArrowLeft,
  ExternalLink,
  ShieldCheck,
  BookOpen,
  Gauge,
} from "lucide-react";
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

const STEP_LABELS = ["Organization", "Providers", "Your Keys"] as const;

/* ---------------------------------------------------------------------------
   CSS-only animations (inlined as style element to avoid globals.css changes)
   --------------------------------------------------------------------------- */
const animationStyles = `
@keyframes checkmark-scale {
  0%   { transform: scale(0); opacity: 0; }
  50%  { transform: scale(1.2); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes fade-up {
  0%   { transform: translateY(12px); opacity: 0; }
  100% { transform: translateY(0); opacity: 1; }
}
.animate-checkmark {
  animation: checkmark-scale 0.5s ease-out forwards;
}
.animate-fade-up {
  animation: fade-up 0.4s ease-out forwards;
}
.animate-fade-up-delay-1 { animation-delay: 0.15s; opacity: 0; }
.animate-fade-up-delay-2 { animation-delay: 0.30s; opacity: 0; }
.animate-fade-up-delay-3 { animation-delay: 0.45s; opacity: 0; }
.animate-fade-up-delay-4 { animation-delay: 0.60s; opacity: 0; }
`;

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

  // Determine which provider is primary (first non-empty one)
  const primaryProvider = anthropicKey.trim()
    ? "Anthropic"
    : openaiKey.trim()
      ? "OpenAI"
      : null;

  async function handleSubmit(skipProviders = false) {
    setIsLoading(true);
    setError(null);
    try {
      const providerKeys: Record<string, string> = {};
      if (!skipProviders) {
        if (anthropicKey.trim()) providerKeys.anthropic = anthropicKey.trim();
        if (openaiKey.trim()) providerKeys.openai = openaiKey.trim();
      }

      const result = await createTenant({
        name: orgName.trim(),
        providerKeys: Object.keys(providerKeys).length > 0 ? providerKeys : undefined,
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

  /* -------------------------------------------------------------------------
     Step indicator: numbered circles connected by lines
     - Completed: green circle with checkmark
     - Active: purple circle with number
     - Upcoming: gray circle with number
     ----------------------------------------------------------------------- */
  const stepIndicator = (
    <div className="flex items-center justify-center gap-0 pb-2">
      {STEP_LABELS.map((label, idx) => {
        const s = (idx + 1) as Step;
        const isCompleted = s < step;
        const isActive = s === step;

        return (
          <React.Fragment key={s}>
            {/* Connector line (before steps 2 and 3) */}
            {idx > 0 && (
              <div
                className={`h-0.5 w-10 transition-colors ${
                  isCompleted || isActive
                    ? "bg-bastion-purple"
                    : "bg-muted"
                }`}
              />
            )}

            {/* Step circle + label */}
            <div className="flex flex-col items-center gap-1">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                  isCompleted
                    ? "bg-green-500 text-white"
                    : isActive
                      ? "bg-bastion-purple text-white"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {isCompleted ? (
                  <Check className="h-4 w-4" />
                ) : (
                  s
                )}
              </div>
              <span
                className={`text-[11px] font-medium whitespace-nowrap ${
                  isActive
                    ? "text-bastion-purple"
                    : isCompleted
                      ? "text-green-500"
                      : "text-muted-foreground"
                }`}
              >
                {label}
              </span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );

  return (
    <>
      <style>{animationStyles}</style>
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

          {/* ----------------------------------------------------------------
              Step 1: Organization Name
              -------------------------------------------------------------- */}
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
                  <p className="text-xs text-muted-foreground">
                    This name will appear in your dashboard and audit logs.
                  </p>
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

          {/* ----------------------------------------------------------------
              Step 2: Provider API Keys
              -------------------------------------------------------------- */}
          {step === 2 && (
            <>
              <CardContent className="space-y-4">
                <div className="space-y-2 text-center">
                  <CardTitle>Connect your providers</CardTitle>
                  <CardDescription>
                    Add at least one provider API key to get started
                  </CardDescription>
                </div>

                {/* Anthropic */}
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
                  <p className="text-xs text-muted-foreground">
                    Get your key at{" "}
                    <a
                      href="https://console.anthropic.com/settings/keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 text-bastion-purple hover:text-bastion-purple-light underline underline-offset-2"
                    >
                      console.anthropic.com
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </p>
                </div>

                {/* OpenAI */}
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
                  <p className="text-xs text-muted-foreground">
                    Get your key at{" "}
                    <a
                      href="https://platform.openai.com/api-keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 text-bastion-purple hover:text-bastion-purple-light underline underline-offset-2"
                    >
                      platform.openai.com
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </p>
                </div>

                {/* Primary provider indicator */}
                {primaryProvider && (
                  <div className="rounded-md border border-bastion-purple/30 bg-bastion-purple/5 px-3 py-2 text-xs text-muted-foreground">
                    <span className="font-medium text-bastion-purple">
                      {primaryProvider}
                    </span>{" "}
                    will be set as your primary provider.
                    {anthropicKey.trim() && openaiKey.trim() && (
                      <> The other will be available as a fallback.</>
                    )}
                  </div>
                )}

                {error && (
                  <p className="text-sm text-destructive">{error}</p>
                )}
              </CardContent>
              <CardFooter className="flex flex-col gap-3">
                <div className="flex w-full justify-between">
                  <Button variant="ghost" onClick={() => setStep(1)}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                  <Button
                    onClick={() => handleSubmit(false)}
                    disabled={!hasProvider || isLoading}
                  >
                    {isLoading ? "Creating..." : "Create tenant"}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
                <button
                  type="button"
                  onClick={() => handleSubmit(true)}
                  disabled={isLoading}
                  className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors disabled:opacity-50"
                >
                  Skip for now — add providers later in Settings
                </button>
              </CardFooter>
            </>
          )}

          {/* ----------------------------------------------------------------
              Step 3: Keys + Success
              -------------------------------------------------------------- */}
          {step === 3 && tenant && (
            <>
              <CardContent className="space-y-6">
                {/* Animated checkmark */}
                <div className="flex justify-center">
                  <div className="animate-checkmark flex h-16 w-16 items-center justify-center rounded-full bg-green-500/15">
                    <Check className="h-8 w-8 text-green-500" strokeWidth={3} />
                  </div>
                </div>

                <div className="animate-fade-up space-y-2 text-center">
                  <CardTitle>You&apos;re all set!</CardTitle>
                  <CardDescription>
                    Save these keys -- the full values won&apos;t be shown again
                  </CardDescription>
                </div>

                <div className="animate-fade-up animate-fade-up-delay-1 space-y-4">
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

                {/* Proxy usage example */}
                <div className="animate-fade-up animate-fade-up-delay-2 rounded-md border bg-secondary/50 px-3 py-2">
                  <p className="mb-1 text-xs font-medium text-foreground">
                    Point your app at Bastion:
                  </p>
                  <code className="text-xs text-muted-foreground">
                    ANTHROPIC_BASE_URL=https://proxy.openbastionai.org
                  </code>
                </div>

                {/* What's next quick links */}
                <div className="animate-fade-up animate-fade-up-delay-3 space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    What&apos;s next?
                  </p>
                  <div className="grid gap-2">
                    <Link
                      href="/policies"
                      className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    >
                      <ShieldCheck className="h-4 w-4 text-bastion-purple" />
                      Set up your first policy
                      <ArrowRight className="ml-auto h-3 w-3" />
                    </Link>
                    <Link
                      href="/docs"
                      className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    >
                      <BookOpen className="h-4 w-4 text-bastion-purple" />
                      View the documentation
                      <ArrowRight className="ml-auto h-3 w-3" />
                    </Link>
                    <Link
                      href="/providers"
                      className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    >
                      <Gauge className="h-4 w-4 text-bastion-purple" />
                      Configure rate limits
                      <ArrowRight className="ml-auto h-3 w-3" />
                    </Link>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="animate-fade-up animate-fade-up-delay-4 justify-end">
                <Button onClick={() => router.push("/")}>
                  Continue to Dashboard
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </CardFooter>
            </>
          )}
        </Card>
      </div>
    </>
  );
}
