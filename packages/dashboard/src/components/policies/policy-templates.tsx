"use client";

import * as React from "react";
import {
  Shield,
  EyeOff,
  ShieldAlert,
  AlertTriangle,
  Lock,
  Ban,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// ---- Template types --------------------------------------------------------

interface PolicyCondition {
  type: string;
  threshold?: number;
  entities?: string[];
  field?: string;
  value?: string | number;
  case_sensitive?: boolean;
}

export interface PolicyTemplate {
  name: string;
  on: string;
  action: string;
  condition: PolicyCondition;
}

interface TemplateDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  policy: PolicyTemplate;
}

// ---- Templates data --------------------------------------------------------

const POLICY_TEMPLATES: TemplateDefinition[] = [
  {
    id: "block-injection",
    name: "Block Prompt Injection",
    description: "Block requests with high injection likelihood",
    icon: "Shield",
    category: "Security",
    policy: {
      name: "block-injection",
      on: "request",
      action: "block",
      condition: { type: "injection_score", threshold: 0.7 },
    },
  },
  {
    id: "redact-pii-response",
    name: "Redact PII in Responses",
    description: "Redact emails and phone numbers from model responses",
    icon: "EyeOff",
    category: "Privacy",
    policy: {
      name: "redact-pii-response",
      on: "response",
      action: "redact",
      condition: { type: "pii_detected", entities: ["email", "phone"] },
    },
  },
  {
    id: "block-pii-request",
    name: "Block PII in Requests",
    description: "Block requests containing SSN or credit card numbers",
    icon: "ShieldAlert",
    category: "Privacy",
    policy: {
      name: "block-pii-request",
      on: "request",
      action: "block",
      condition: { type: "pii_detected", entities: ["ssn", "credit_card"] },
    },
  },
  {
    id: "warn-long-response",
    name: "Warn on Long Responses",
    description: "Warn when responses exceed 10,000 characters",
    icon: "AlertTriangle",
    category: "Quality",
    policy: {
      name: "warn-long-response",
      on: "response",
      action: "warn",
      condition: { type: "length_exceeds", field: "response", value: 10000 },
    },
  },
  {
    id: "block-internal-data",
    name: "Block Internal Data Leakage",
    description: "Block requests containing INTERNAL or CONFIDENTIAL markers",
    icon: "Lock",
    category: "Data Protection",
    policy: {
      name: "block-internal-data",
      on: "request",
      action: "block",
      condition: {
        type: "contains",
        field: "prompt",
        value: "INTERNAL-",
        case_sensitive: true,
      },
    },
  },
  {
    id: "block-jailbreak-phrases",
    name: "Block Jailbreak Phrases",
    description:
      "Block common jailbreak patterns like 'ignore instructions'",
    icon: "Ban",
    category: "Security",
    policy: {
      name: "block-jailbreak",
      on: "request",
      action: "block",
      condition: {
        type: "regex",
        field: "prompt",
        value: "ignore.*(all|previous|prior).*instructions",
        case_sensitive: false,
      },
    },
  },
];

// ---- Helpers ---------------------------------------------------------------

const ICON_MAP: Record<string, LucideIcon> = {
  Shield,
  EyeOff,
  ShieldAlert,
  AlertTriangle,
  Lock,
  Ban,
};

const CATEGORY_COLORS: Record<string, string> = {
  Security: "bg-red-500/10 text-red-500 border-red-500/20",
  Privacy: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  Quality: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  "Data Protection": "bg-blue-500/10 text-blue-500 border-blue-500/20",
};

const CATEGORY_ICON_COLORS: Record<string, string> = {
  Security: "text-red-500",
  Privacy: "text-purple-500",
  Quality: "text-yellow-500",
  "Data Protection": "text-blue-500",
};

// ---- Component -------------------------------------------------------------

interface PolicyTemplatesProps {
  onSelect: (template: PolicyTemplate) => void;
}

export function PolicyTemplates({ onSelect }: PolicyTemplatesProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Choose a pre-built template to get started quickly, or switch to the
        Custom tab to create a policy from scratch.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {POLICY_TEMPLATES.map((template) => {
          const Icon = ICON_MAP[template.icon] ?? Shield;
          const categoryColor =
            CATEGORY_COLORS[template.category] ?? CATEGORY_COLORS.Security;
          const iconColor =
            CATEGORY_ICON_COLORS[template.category] ??
            CATEGORY_ICON_COLORS.Security;

          return (
            <Card
              key={template.id}
              className="flex flex-col justify-between transition-colors hover:border-bastion-purple/50"
            >
              <CardContent className="flex flex-col gap-3 p-5">
                <div className="flex items-start justify-between gap-2">
                  <Icon className={cn("h-5 w-5 shrink-0", iconColor)} />
                  <Badge
                    variant="outline"
                    className={cn("text-[10px]", categoryColor)}
                  >
                    {template.category}
                  </Badge>
                </div>

                <div>
                  <h3 className="text-sm font-semibold leading-tight">
                    {template.name}
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {template.description}
                  </p>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  className="mt-auto w-full"
                  onClick={() => onSelect(template.policy)}
                >
                  Use Template
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
