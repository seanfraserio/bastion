"use client";

import * as React from "react";
import Link from "next/link";
import {
  Bug,
  Lightbulb,
  CreditCard,
  Plug,
  ShieldAlert,
  MessageCircle,
  Mail,
  BookOpen,
  Github,
  ExternalLink,
  ArrowLeft,
  Send,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { mockTenant, planDetails } from "@/lib/mock-data";

// ---------------------------------------------------------------------------
// Issue templates
// ---------------------------------------------------------------------------

interface IssueTemplate {
  id: string;
  title: string;
  icon: LucideIcon;
  description: string;
  fields: string[];
}

const ISSUE_TEMPLATES: IssueTemplate[] = [
  {
    id: "bug",
    title: "Bug Report",
    icon: Bug,
    description: "Report unexpected behavior",
    fields: [
      "Environment",
      "Description",
      "Steps to Reproduce",
      "Expected Behavior",
      "Actual Behavior",
    ],
  },
  {
    id: "feature",
    title: "Feature Request",
    icon: Lightbulb,
    description: "Suggest a new feature",
    fields: ["Description", "Use Case", "Current Workaround"],
  },
  {
    id: "billing",
    title: "Billing Issue",
    icon: CreditCard,
    description: "Questions about billing or subscriptions",
    fields: ["Account Email", "Issue Type", "Description"],
  },
  {
    id: "integration",
    title: "Integration Help",
    icon: Plug,
    description: "Help connecting Bastion with your stack",
    fields: [
      "Language/Framework",
      "Integration Goal",
      "What You've Tried",
      "Error Messages",
    ],
  },
  {
    id: "security",
    title: "Security Concern",
    icon: ShieldAlert,
    description: "Report a security issue",
    fields: ["Type", "Description", "Severity"],
  },
  {
    id: "general",
    title: "General Inquiry",
    icon: MessageCircle,
    description: "Any other questions",
    fields: ["Subject", "Message"],
  },
];

const SUPPORT_EMAIL = "support@openbastionai.org";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SupportPage() {
  const [selected, setSelected] = React.useState<IssueTemplate | null>(null);
  const [fieldValues, setFieldValues] = React.useState<Record<string, string>>(
    {}
  );
  const [sent, setSent] = React.useState(false);

  const plan = planDetails[mockTenant.plan];

  function handleSelect(template: IssueTemplate) {
    setSelected(template);
    // Initialize field values
    const initial: Record<string, string> = {};
    for (const field of template.fields) {
      initial[field] = "";
    }
    setFieldValues(initial);
    setSent(false);
  }

  function handleFieldChange(field: string, value: string) {
    setFieldValues((prev) => ({ ...prev, [field]: value }));
  }

  function handleSend() {
    if (!selected) return;

    const subjectField = fieldValues["Subject"] ?? selected.title;
    const subject = `[Bastion ${selected.title}] ${subjectField}`;

    const bodyLines = selected.fields.map(
      (field) => `${field}:\n${fieldValues[field] || "(not provided)"}\n`
    );
    bodyLines.push("---");
    bodyLines.push(`Sent from Bastion Dashboard`);
    bodyLines.push(`User: ${mockTenant.email}`);
    bodyLines.push(`Plan: ${plan.name}`);

    const body = bodyLines.join("\n");

    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setSent(true);
  }

  function handleReset() {
    setSelected(null);
    setFieldValues({});
    setSent(false);
  }

  const allFieldsFilled = selected
    ? selected.fields.every((f) => fieldValues[f]?.trim())
    : false;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Support</h1>
        <p className="text-muted-foreground">
          Get help from the Bastion team or browse documentation.
        </p>
      </div>

      {/* Success banner */}
      {sent && (
        <div className="flex items-center gap-3 rounded-lg border border-green-500/30 bg-green-500/10 p-4">
          <Send className="h-5 w-5 shrink-0 text-green-500" />
          <div className="flex-1">
            <p className="text-sm font-medium text-green-500">
              Your email client should have opened with the support request.
            </p>
            <p className="text-xs text-muted-foreground">
              If it did not open, email us directly at{" "}
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="text-green-500 underline"
              >
                {SUPPORT_EMAIL}
              </a>
            </p>
          </div>
          <button
            onClick={() => setSent(false)}
            className="text-green-500 hover:text-green-400"
            aria-label="Dismiss"
          >
            &times;
          </button>
        </div>
      )}

      {/* Contact info card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Contact Us</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Email us at{" "}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="font-medium text-bastion-purple"
            >
              {SUPPORT_EMAIL}
            </a>{" "}
            or use one of the templates below to get started quickly.
          </p>

          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <div>
              <span className="font-medium text-foreground">Team</span> — 24
              hour response
            </div>
            <div>
              <span className="font-medium text-foreground">Enterprise</span> —
              4 hour response (SLA)
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Link
              href="/docs"
              className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent"
            >
              <BookOpen className="h-4 w-4 text-bastion-purple" />
              <span className="text-sm font-medium">Documentation</span>
            </Link>
            <a
              href="https://github.com/seanfraserio/bastion/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent"
            >
              <Github className="h-4 w-4 text-bastion-purple" />
              <span className="text-sm font-medium">GitHub Issues</span>
              <ExternalLink className="ml-auto h-3 w-3 opacity-50" />
            </a>
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent"
            >
              <Mail className="h-4 w-4 text-bastion-purple" />
              <span className="text-sm font-medium">{SUPPORT_EMAIL}</span>
            </a>
          </div>
        </CardContent>
      </Card>

      {/* Template selection */}
      {!selected && (
        <div>
          <h2 className="mb-4 text-lg font-semibold">
            What do you need help with?
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ISSUE_TEMPLATES.map((template) => {
              const Icon = template.icon;
              return (
                <button
                  key={template.id}
                  onClick={() => handleSelect(template)}
                  className={cn(
                    "flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors",
                    "hover:border-bastion-purple/50 hover:bg-bastion-purple/5"
                  )}
                >
                  <Icon className="h-5 w-5 text-bastion-purple" />
                  <div>
                    <p className="text-sm font-semibold">{template.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {template.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Compose form */}
      {selected && !sent && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <selected.icon className="h-5 w-5 text-bastion-purple" />
                <CardTitle className="text-lg">{selected.title}</CardTitle>
              </div>
              <Button variant="ghost" size="sm" onClick={handleReset}>
                <ArrowLeft className="mr-1 h-4 w-4" />
                Change template
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {selected.fields.map((field) => (
              <div key={field} className="space-y-1.5">
                <label className="text-sm font-medium">{field}</label>
                {field === "Description" ||
                field === "Steps to Reproduce" ||
                field === "Expected Behavior" ||
                field === "Actual Behavior" ||
                field === "Message" ||
                field === "Use Case" ||
                field === "Current Workaround" ||
                field === "What You've Tried" ||
                field === "Error Messages" ||
                field === "Integration Goal" ? (
                  <textarea
                    className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    placeholder={`Enter ${field.toLowerCase()}...`}
                    value={fieldValues[field] || ""}
                    onChange={(e) => handleFieldChange(field, e.target.value)}
                  />
                ) : (
                  <Input
                    placeholder={`Enter ${field.toLowerCase()}...`}
                    value={fieldValues[field] || ""}
                    onChange={(e) => handleFieldChange(field, e.target.value)}
                  />
                )}
              </div>
            ))}

            <div className="flex items-center gap-3 pt-2">
              <Button onClick={handleSend} disabled={!allFieldsFilled}>
                <Send className="mr-2 h-4 w-4" />
                Open in Email Client
              </Button>
              <Button variant="outline" onClick={handleReset}>
                Cancel
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              This will open your default email client with the message
              pre-filled. Your account details will be included automatically.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
