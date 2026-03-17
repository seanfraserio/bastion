interface YamlPreviewProps {
  policy: {
    name: string;
    trigger: string;
    action: string;
    conditionType: string;
    condition: Record<string, unknown>;
  } | null;
}

function renderValue(value: unknown, indent: number): string[] {
  const pad = "  ".repeat(indent);
  if (Array.isArray(value)) {
    return value.map((v) => `${pad}- ${String(v)}`);
  }
  if (typeof value === "object" && value !== null) {
    const lines: string[] = [];
    for (const [k, v] of Object.entries(value)) {
      if (typeof v === "object" && v !== null) {
        lines.push(`${pad}${k}:`);
        lines.push(...renderValue(v, indent + 1));
      } else {
        lines.push(`${pad}${k}: ${String(v)}`);
      }
    }
    return lines;
  }
  return [`${pad}${String(value)}`];
}

function policyToYaml(policy: YamlPreviewProps["policy"]): string {
  if (!policy) return "# Configure a policy to see the YAML preview";

  const lines: string[] = [];
  lines.push(`name: ${policy.name || "(unnamed)"}`);
  lines.push(`trigger: ${policy.trigger}`);
  lines.push(`action: ${policy.action}`);
  lines.push(`condition:`);
  lines.push(`  type: ${policy.conditionType}`);

  for (const [key, val] of Object.entries(policy.condition)) {
    if (typeof val === "object" && val !== null) {
      lines.push(`  ${key}:`);
      lines.push(...renderValue(val, 2));
    } else {
      lines.push(`  ${key}: ${String(val)}`);
    }
  }

  return lines.join("\n");
}

type TokenType = "key" | "value" | "string" | "comment" | "plain";

interface Token {
  type: TokenType;
  text: string;
}

function tokenizeLine(line: string): Token[] {
  const tokens: Token[] = [];

  if (line.trimStart().startsWith("#")) {
    tokens.push({ type: "comment", text: line });
    return tokens;
  }

  if (line.trimStart().startsWith("- ")) {
    const idx = line.indexOf("- ");
    tokens.push({ type: "plain", text: line.slice(0, idx + 2) });
    const rest = line.slice(idx + 2);
    // Check if it looks like a string value
    if (rest.startsWith('"') || rest.startsWith("'")) {
      tokens.push({ type: "string", text: rest });
    } else {
      tokens.push({ type: "value", text: rest });
    }
    return tokens;
  }

  const colonIdx = line.indexOf(":");
  if (colonIdx > -1) {
    tokens.push({ type: "key", text: line.slice(0, colonIdx + 1) });
    const after = line.slice(colonIdx + 1);
    if (after.trim()) {
      tokens.push({ type: "plain", text: " " });
      const trimmed = after.trim();
      if (
        trimmed.startsWith('"') ||
        trimmed.startsWith("'") ||
        trimmed.startsWith("(")
      ) {
        tokens.push({ type: "string", text: trimmed });
      } else {
        tokens.push({ type: "value", text: trimmed });
      }
    }
    return tokens;
  }

  tokens.push({ type: "plain", text: line });
  return tokens;
}

const colorMap: Record<TokenType, string> = {
  key: "text-bastion-purple",
  value: "text-blue-400",
  string: "text-green-400",
  comment: "text-muted-foreground italic",
  plain: "text-foreground",
};

export function YamlPreview({ policy }: YamlPreviewProps) {
  const yaml = policyToYaml(policy);
  const lines = yaml.split("\n");

  return (
    <div className="rounded-lg border bg-muted/50 p-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        YAML Preview
      </p>
      <pre className="overflow-x-auto text-sm leading-relaxed">
        <code>
          {lines.map((line, i) => {
            const tokens = tokenizeLine(line);
            return (
              <div key={i}>
                {tokens.map((token, j) => (
                  <span key={j} className={colorMap[token.type]}>
                    {token.text}
                  </span>
                ))}
              </div>
            );
          })}
        </code>
      </pre>
    </div>
  );
}
