# PII Redaction

Demonstrates Bastion's policy engine for PII protection. Two policies are configured:

1. **Redact PII in responses** -- Scans model responses for email addresses and phone numbers and replaces them with redaction placeholders before they reach your application.
2. **Block passwords in requests** -- Blocks any request whose content contains the word "password", preventing sensitive credential data from being sent to the LLM provider.

Audit logging captures both request and response bodies so you can verify redaction is working correctly.

## Usage

```bash
export ANTHROPIC_API_KEY=sk-ant-...
bastion start -c bastion.yaml
```

Try sending a prompt that asks the model to generate contact information -- you will see email addresses and phone numbers replaced with `[REDACTED]` in the response.
