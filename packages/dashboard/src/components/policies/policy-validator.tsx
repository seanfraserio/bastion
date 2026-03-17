"use client";

import * as React from "react";
import { ChevronDown, ChevronRight, Play } from "lucide-react";
import { Button } from "@/components/ui/button";

// ---- Types -----------------------------------------------------------------

interface PolicyCondition {
  type: string;
  field?: string;
  value?: string | number;
  case_sensitive?: boolean;
  threshold?: number;
  entities?: string[];
}

export interface PolicyDraft {
  name: string;
  trigger: string;
  action: string;
  conditionType: string;
  condition: PolicyCondition;
}

export interface ValidationError {
  field: string;
  message: string;
}

interface TestResult {
  matched: boolean;
  action?: string;
  error?: string;
  note?: string;
}

// ---- Validation logic ------------------------------------------------------

export function validatePolicy(draft: PolicyDraft): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!draft.name.trim()) {
    errors.push({ field: "name", message: "Policy name is required" });
  }

  if (!draft.trigger) {
    errors.push({ field: "trigger", message: "Trigger must be set" });
  }

  if (!draft.action) {
    errors.push({ field: "action", message: "Action must be set" });
  }

  if (!draft.conditionType) {
    errors.push({
      field: "conditionType",
      message: "Condition type must be set",
    });
  }

  const cond = draft.condition;

  switch (draft.conditionType) {
    case "contains": {
      if (!cond.value || (typeof cond.value === "string" && !cond.value.trim())) {
        errors.push({
          field: "value",
          message: "Value is required for contains condition",
        });
      }
      break;
    }
    case "regex": {
      if (!cond.value || (typeof cond.value === "string" && !cond.value.trim())) {
        errors.push({
          field: "value",
          message: "Pattern is required for regex condition",
        });
      } else if (typeof cond.value === "string") {
        try {
          new RegExp(cond.value);
        } catch {
          errors.push({
            field: "value",
            message: "Invalid regular expression pattern",
          });
        }
      }
      break;
    }
    case "injection_score": {
      const t = cond.threshold;
      if (t === undefined || t === null) {
        errors.push({
          field: "threshold",
          message: "Threshold is required",
        });
      } else if (typeof t === "number" && (t < 0 || t > 1)) {
        errors.push({
          field: "threshold",
          message: "Threshold must be between 0 and 1",
        });
      }
      break;
    }
    case "pii_detected": {
      if (!cond.entities || cond.entities.length === 0) {
        errors.push({
          field: "entities",
          message: "At least one PII entity must be selected",
        });
      }
      break;
    }
    case "length_exceeds": {
      const v = cond.value;
      if (v === undefined || v === null || v === "") {
        errors.push({
          field: "lengthValue",
          message: "Maximum length value is required",
        });
      } else if (typeof v === "number" && v <= 0) {
        errors.push({
          field: "lengthValue",
          message: "Length must be a positive number",
        });
      }
      break;
    }
  }

  return errors;
}

// ---- Test logic ------------------------------------------------------------

export function testPolicy(
  draft: PolicyDraft,
  sampleInput: string
): TestResult {
  const cond = draft.condition;

  switch (draft.conditionType) {
    case "contains": {
      const condValue =
        typeof cond.value === "string" ? cond.value : String(cond.value ?? "");
      const text = cond.case_sensitive
        ? sampleInput
        : sampleInput.toLowerCase();
      const value = cond.case_sensitive
        ? condValue
        : condValue.toLowerCase();
      const matched = text.includes(value);
      return { matched, action: draft.action };
    }
    case "regex": {
      try {
        const flags = cond.case_sensitive ? "" : "i";
        const re = new RegExp(String(cond.value ?? ""), flags);
        const matched = re.test(sampleInput);
        return { matched, action: draft.action };
      } catch {
        return { matched: false, error: "Invalid regex pattern" };
      }
    }
    case "length_exceeds": {
      const threshold =
        typeof cond.value === "number" ? cond.value : parseInt(String(cond.value ?? "0"));
      const matched = sampleInput.length > threshold;
      return { matched, action: draft.action };
    }
    case "injection_score":
      return {
        matched: false,
        note: "Injection scoring requires a live request",
      };
    case "pii_detected":
      return {
        matched: false,
        note: "PII detection requires a live request",
      };
    default:
      return {
        matched: false,
        note: `${draft.conditionType} testing requires a live request`,
      };
  }
}

// ---- Helper: inline validation display -------------------------------------

export function ValidationMessage({ errors, field }: { errors: ValidationError[]; field: string }) {
  const error = errors.find((e) => e.field === field);
  if (!error) return null;
  return (
    <p className="mt-1 text-xs text-red-500">{error.message}</p>
  );
}

// ---- Test Policy panel component -------------------------------------------

interface PolicyTestPanelProps {
  draft: PolicyDraft;
}

export function PolicyTestPanel({ draft }: PolicyTestPanelProps) {
  const [expanded, setExpanded] = React.useState(false);
  const [sampleInput, setSampleInput] = React.useState("");
  const [result, setResult] = React.useState<TestResult | null>(null);

  function handleTest() {
    const r = testPolicy(draft, sampleInput);
    setResult(r);
  }

  return (
    <div className="rounded-lg border bg-muted/30">
      <button
        type="button"
        className="flex w-full items-center gap-2 p-3 text-sm font-medium hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
        Test Policy
      </button>

      {expanded && (
        <div className="space-y-3 border-t px-3 pb-4 pt-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Sample input
            </label>
            <textarea
              rows={4}
              value={sampleInput}
              onChange={(e) => {
                setSampleInput(e.target.value);
                setResult(null);
              }}
              placeholder="Type a sample message to test this policy against..."
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={handleTest}
            disabled={!sampleInput.trim()}
          >
            <Play className="mr-1.5 h-3 w-3" />
            Run Test
          </Button>

          {result && (
            <TestResultDisplay result={result} />
          )}
        </div>
      )}
    </div>
  );
}

// ---- Test result display ---------------------------------------------------

function TestResultDisplay({ result }: { result: TestResult }) {
  if (result.error) {
    return (
      <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
        Error: {result.error}
      </div>
    );
  }

  if (result.note) {
    return (
      <div className="rounded-md border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm text-blue-400">
        {result.note}
      </div>
    );
  }

  if (result.matched) {
    const actionLabel = (result.action ?? "trigger").toUpperCase();
    return (
      <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
        This policy would <strong>{actionLabel}</strong> this input
      </div>
    );
  }

  return (
    <div className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-500">
      This policy would NOT match this input
    </div>
  );
}
