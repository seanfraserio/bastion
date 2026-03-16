# Bastion Websites Design Spec

**Date:** 2026-03-16
**Status:** Approved

## Overview

Two marketing websites for Bastion:
- **openbastionai.org** — OSS landing page (dark theme)
- **enterprise.openbastionai.org** — enterprise marketing page (warm light theme)

Both differentiated from Forge (dark/orange) and Lantern (light/indigo) with unique color palette and layout.

## Design Decisions

| Decision | Choice |
|----------|--------|
| OSS theme | Dark grey (`#1a1d23`), not black |
| Enterprise theme | Warm light (`#fffcf9`, `#faf5ef` surfaces) |
| Accent color | Purple→Blue gradient (`#8b5cf6 → #3b82f6`) |
| OSS layout | Pipeline-first — middleware chain visualization as hero |
| Enterprise layout | Professional sections, business-oriented, less code |
| Logo | Outline shield with vertical pipeline + side inspection branches |
| Tech stack | Vanilla HTML/CSS, matching Forge and Lantern |

## Color System

### OSS (Dark)
```
--bg-primary: #1a1d23
--bg-surface: #13161c
--bg-elevated: #1e2128
--border: #2a2e38
--text-primary: #e2e5ed
--text-dimmed: #8690a5
--text-muted: #4a5068
--accent-purple: #8b5cf6
--accent-purple-light: #a78bfa
--accent-blue: #3b82f6
--accent-blue-light: #60a5fa
--gradient: linear-gradient(135deg, #8b5cf6, #3b82f6)
--success: #34d399
--warning: #fb923c
--error: #f87171
```

### Enterprise (Warm Light)
```
--bg-primary: #fffcf9
--bg-surface: #faf5ef
--bg-elevated: #f3ece3
--border: #e5ddd2
--text-primary: #1c1917
--text-dimmed: #78716c
--text-muted: #a8a29e
--accent-purple: #8b5cf6
--accent-blue: #3b82f6
--gradient: linear-gradient(135deg, #8b5cf6, #3b82f6)
```

## Typography

- **Sans:** Inter (headings, body)
- **Mono:** JetBrains Mono, Fira Code, SF Mono (code blocks)
- Consistent with Forge and Lantern trilogy

## Logo

SVG shield outline with vertical pipeline flow:
- Entry arrow at top
- 4 descending nodes (decreasing size/opacity) representing middleware stages
- Connecting lines between nodes
- 3 side branches (alternating left/right) with small dots representing inspection points
- Exit arrow at bottom
- Purple→blue gradient throughout

## OSS Site — openbastionai.org

### Structure

1. **Fixed nav** (blur backdrop)
   - Logo + "Bastion" wordmark
   - Links: Docs, GitHub, Enterprise
   - CTA button: "Get Started"

2. **Hero — Pipeline-first**
   - Centered headline: "Protect Every AI Request"
   - Subtext: "Zero code changes. Full control. Complete audit trail."
   - Install command: `npm install -g @openbastion-ai/cli`
   - Pipeline visualization: horizontal middleware chain
     - `Your App → Rate Limit → Injection → Policy → Cache → LLM`
     - Each stage is a bordered pill with accent color
     - Arrows between stages
   - Caption: "The Bastion Pipeline — every request, every time"

3. **Problem / Solution** (2-column)
   - Left: "The Problem" — AI agents make unmonitored API calls, no policy enforcement, no audit trail
   - Right: "The Solution" — Drop-in proxy, declarative policies in YAML, structured audit log

4. **Feature grid** (3×2 cards)
   - Policy Engine — Declarative rules in bastion.yaml
   - Provider Fallback — Automatic failover on 429/5xx
   - Injection Detection — Heuristic pattern matching
   - PII Redaction — Block sensitive data in prompts
   - Response Cache — Exact-match caching with TTL
   - Audit Trail — JSONL structured logging

5. **Config showcase**
   - bastion.yaml code block with syntax highlighting
   - Show a working 15-20 line config example

6. **Trilogy section**
   - "Part of the trilogy" heading
   - 3-column: Forge (define agents) → Lantern (observe agents) → Bastion (protect agents)
   - Links to each project

7. **Footer**
   - GitHub, Docs, License (MIT)
   - "Part of the Forge / Lantern / Bastion trilogy"

### Max width: 1000px centered

## Enterprise Site — enterprise.openbastionai.org

### Structure

1. **Fixed nav** (blur backdrop, warm tones)
   - Logo + "Bastion Enterprise" wordmark
   - Links: Features, Pricing, Contact
   - CTA button: "Book a Demo"

2. **Hero**
   - Headline: "AI Security at Enterprise Scale"
   - Subtext: compliance, governance, team-scoped policies
   - Two CTAs: "Contact Sales" (filled) + "View OSS" (outline)

3. **Enterprise feature grid** (cards with icons)
   - ML-Based PII Detection — Transformer-based entity recognition
   - LLM Injection Scoring — High-confidence classifier model
   - SIEM Export — Splunk and Elastic integration
   - Compliance Reports — SOC2 and HIPAA formatted exports
   - Team RBAC — Policy namespaces scoped to teams
   - Alerting — Slack, PagerDuty, webhook notifications
   - Cluster Sync — Config synchronization across replicas

4. **OSS vs Enterprise comparison table**
   - Two-column table listing all features
   - Checkmarks for included, dashes for not included

5. **Security / compliance badges**
   - SOC2, HIPAA visual markers
   - "Built for regulated industries" messaging

6. **Trilogy integration**
   - How Forge + Lantern + Bastion Enterprise work together
   - Architecture diagram showing the full stack

7. **CTA footer**
   - "Ready to secure your AI infrastructure?"
   - "Contact Sales" button + email
   - Links back to OSS, docs, GitHub

### Max width: 1100px centered

## File Structure

```
bastion/
├── site/
│   ├── index.html          # OSS landing page
│   ├── styles.css           # OSS styles
│   ├── logo.svg             # Bastion logo (SVG)
│   ├── favicon.ico          # Favicon
│   └── enterprise/
│       ├── index.html       # Enterprise landing page
│       └── styles.css       # Enterprise styles
```

## npm Publishing

Both sites are static HTML/CSS included in the repo. No separate npm package needed — they deploy as static files to their respective domains.
