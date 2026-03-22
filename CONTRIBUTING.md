# Contributing to Bastion

Thanks for your interest in contributing to Bastion — an AI agent gateway and proxy built for teams who need security, observability, and control over their LLM usage.

## Getting Started

```bash
git clone https://github.com/openbastion-ai/bastion.git
cd bastion
pnpm install
pnpm build
pnpm test
```

You'll need **Node.js 20+** and **pnpm** installed globally (`npm i -g pnpm`).

## Development Workflow

1. Fork the repo and create a branch from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   ```
2. Make your changes and write tests for new behaviour.
3. Run the full suite before opening a PR:
   ```bash
   pnpm lint       # ESLint + Prettier check
   pnpm test       # Vitest
   pnpm build      # TypeScript compile
   ```
4. Push your branch and open a pull request against `main`.

Commits don't need to follow a specific convention, but a short descriptive subject line helps reviewers.

## Code Style

- **TypeScript** throughout — avoid `any` where possible.
- **Prettier** handles formatting automatically; just run `pnpm lint --fix` or configure your editor to format on save.
- Follow the patterns already established in the package you're modifying — consistency beats novelty.
- New packages belong under `packages/` and must be wired into `pnpm-workspace.yaml`.

## Pull Request Process

- Describe what the PR does and why, not just how.
- Link any related GitHub Issues (e.g. `Closes #42`).
- All CI checks (lint, test, build) must pass before merging.
- A maintainer will review within a few business days. Expect feedback — it's normal.
- Squash-merge is preferred to keep history clean.

## Reporting Bugs

Open a [GitHub Issue](https://github.com/openbastion-ai/bastion/issues) and include:

- A minimal reproduction (config snippet, request/response, or a failing test).
- The Bastion version you're running (`pnpm list | grep bastion`).
- Node.js version and OS.

The more specific the report, the faster it gets fixed.

## Feature Requests

Before writing code, **open a Discussion** to describe the use case. This avoids wasted effort and lets maintainers flag conflicts with the roadmap early. Once there's alignment, a linked PR is welcome.

---

By contributing you agree that your code will be licensed under the [MIT License](./LICENSE).
