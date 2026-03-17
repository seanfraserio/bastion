"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { YamlPreview } from "@/components/policies/yaml-preview";
import { type Policy } from "@/lib/mock-data";

type Trigger = "request" | "response" | "both";
type Action = "block" | "warn" | "redact" | "tag";
type ConditionType =
  | "contains"
  | "regex"
  | "injection_score"
  | "pii_detected"
  | "length_exceeds";

const PII_ENTITIES = ["email", "phone", "ssn", "credit_card", "name"] as const;

interface PolicyEditorProps {
  initialPolicy?: Policy;
  onSave?: (policy: Omit<Policy, "id" | "createdAt">) => void;
  onCancel?: () => void;
}

export function PolicyEditor({
  initialPolicy,
  onSave,
  onCancel,
}: PolicyEditorProps) {
  const [name, setName] = React.useState(initialPolicy?.name ?? "");
  const [trigger, setTrigger] = React.useState<Trigger>(
    initialPolicy?.trigger ?? "request"
  );
  const [action, setAction] = React.useState<Action>(
    initialPolicy?.action ?? "block"
  );
  const [conditionType, setConditionType] = React.useState<ConditionType>(
    (initialPolicy?.conditionType as ConditionType) ?? "contains"
  );

  // Condition fields
  const [field, setField] = React.useState<string>(
    (initialPolicy?.condition?.field as string) ?? "prompt"
  );
  const [value, setValue] = React.useState<string>(
    (initialPolicy?.condition?.value as string) ?? ""
  );
  const [caseSensitive, setCaseSensitive] = React.useState(
    (initialPolicy?.condition?.case_sensitive as boolean) ?? false
  );
  const [threshold, setThreshold] = React.useState<string>(
    String(initialPolicy?.condition?.threshold ?? "0.85")
  );
  const [piiEntities, setPiiEntities] = React.useState<string[]>(
    (initialPolicy?.condition?.entities as string[]) ?? ["email", "phone"]
  );
  const [lengthValue, setLengthValue] = React.useState<string>(
    String(initialPolicy?.condition?.value ?? "50000")
  );

  function buildCondition(): Record<string, unknown> {
    switch (conditionType) {
      case "contains":
        return { field, value, case_sensitive: caseSensitive };
      case "regex":
        return { field, value, case_sensitive: caseSensitive };
      case "injection_score":
        return { threshold: parseFloat(threshold) || 0.85 };
      case "pii_detected":
        return { entities: piiEntities };
      case "length_exceeds":
        return { field, value: parseInt(lengthValue) || 50000 };
    }
  }

  const previewPolicy = {
    name,
    trigger,
    action,
    conditionType,
    condition: buildCondition(),
  };

  function handleSave() {
    onSave?.({
      name,
      trigger,
      action,
      conditionType,
      condition: buildCondition(),
      enabled: true,
    });
  }

  function togglePiiEntity(entity: string) {
    setPiiEntities((prev) =>
      prev.includes(entity)
        ? prev.filter((e) => e !== entity)
        : [...prev, entity]
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Form */}
      <div className="space-y-5">
        {/* Name */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Name</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Block prompt injection"
          />
        </div>

        {/* Trigger */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Trigger</label>
          <Select
            value={trigger}
            onValueChange={(v) => setTrigger(v as Trigger)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="request">Request</SelectItem>
              <SelectItem value="response">Response</SelectItem>
              <SelectItem value="both">Both</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Action */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Action</label>
          <Select
            value={action}
            onValueChange={(v) => setAction(v as Action)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="block">Block</SelectItem>
              <SelectItem value="warn">Warn</SelectItem>
              <SelectItem value="redact">Redact</SelectItem>
              <SelectItem value="tag">Tag</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Condition Type */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Condition Type</label>
          <Select
            value={conditionType}
            onValueChange={(v) => setConditionType(v as ConditionType)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="contains">Contains</SelectItem>
              <SelectItem value="regex">Regex</SelectItem>
              <SelectItem value="injection_score">Injection Score</SelectItem>
              <SelectItem value="pii_detected">PII Detected</SelectItem>
              <SelectItem value="length_exceeds">Length Exceeds</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Dynamic condition fields */}
        {(conditionType === "contains" || conditionType === "regex") && (
          <>
            <div className="space-y-2">
              <label className="text-sm font-medium">Field</label>
              <Select
                value={field}
                onValueChange={setField}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="prompt">Prompt</SelectItem>
                  <SelectItem value="response">Response</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                {conditionType === "regex" ? "Pattern" : "Value"}
              </label>
              <Input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={
                  conditionType === "regex"
                    ? "e.g. (?i)drop\\s+table"
                    : "e.g. competitor-product"
                }
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="case-sensitive"
                checked={caseSensitive}
                onChange={(e) => setCaseSensitive(e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              <label htmlFor="case-sensitive" className="text-sm">
                Case sensitive
              </label>
            </div>
          </>
        )}

        {conditionType === "injection_score" && (
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Threshold (0-1)
            </label>
            <Input
              type="number"
              min="0"
              max="1"
              step="0.05"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Requests with an injection confidence score above this threshold
              will trigger the policy action.
            </p>
          </div>
        )}

        {conditionType === "pii_detected" && (
          <div className="space-y-2">
            <label className="text-sm font-medium">PII Entities</label>
            <div className="flex flex-wrap gap-2">
              {PII_ENTITIES.map((entity) => (
                <button
                  key={entity}
                  type="button"
                  onClick={() => togglePiiEntity(entity)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    piiEntities.includes(entity)
                      ? "border-bastion-purple bg-bastion-purple/10 text-bastion-purple"
                      : "border-border text-muted-foreground hover:border-bastion-purple/50"
                  }`}
                >
                  {entity.replace("_", " ")}
                </button>
              ))}
            </div>
          </div>
        )}

        {conditionType === "length_exceeds" && (
          <>
            <div className="space-y-2">
              <label className="text-sm font-medium">Field</label>
              <Select value={field} onValueChange={setField}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="prompt">Prompt</SelectItem>
                  <SelectItem value="response">Response</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Maximum Length (characters)
              </label>
              <Input
                type="number"
                min="0"
                value={lengthValue}
                onChange={(e) => setLengthValue(e.target.value)}
              />
            </div>
          </>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button onClick={handleSave} disabled={!name.trim()}>
            {initialPolicy ? "Update Policy" : "Save Policy"}
          </Button>
          {onCancel && (
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      </div>

      {/* YAML Preview */}
      <div>
        <YamlPreview policy={previewPolicy} />
      </div>
    </div>
  );
}
