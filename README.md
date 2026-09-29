# ravn-agents

A Claude Code plugin with three tools that apply the Claude Certified Architect – Foundations
(CCAF) exam concepts to everyday engineering work. Each tool ships with an eval that reports one
number as k/n with a Wilson 95% interval against a baseline.

| Tool | Command | What it does | README |
|---|---|---|---|
| PR reviewer | `/ravn-agents:review-pr` | Coordinator routes a PR to specialised finders, a verifier filters their findings, and the review is printed (or posted with `--post`). | [packages/pr-review](packages/pr-review/README.md) |
| Codebase onboarding | `/ravn-agents:onboard`, `/ravn-agents:ask-codebase` | Builds a codebase map in `docs/codebase-map/` and uses it to route questions to the right files; answers are confirmed against those files with `file:line` evidence. | [packages/onboarding](packages/onboarding/README.md) |
| Docs → tickets | `/ravn-agents:docs-to-tickets` | Turns a requirements brief into GitHub issues: each ticket cites its requirements, is checked in code, and the batch is previewed before anything is created. | [packages/docs-to-tickets](packages/docs-to-tickets/README.md) |

## Install

```sh
claude plugin marketplace add f3r21/ravn-agents
claude plugin install ravn-agents@ravn-labs
```

The tools shell out to `gh`, so it must be installed and authenticated.

## Develop

Requires Node 20+.

```sh
npm install
npm test
npm run typecheck
claude plugin validate .
```

To try local changes without reinstalling, start Claude Code with `--plugin-dir .`. The `dist/`
bundles are committed because the plugin cache runs no build step; rebuild a package with
`npm run build -w packages/<tool>` after changing its `src/`.

## Repository layout

```
.claude-plugin/        plugin.json and marketplace.json (the repo root is both)
schemas/               eval-report.schema.json, the contract every eval writes
packages/eval-core/    shared Wilson interval and report validation
packages/<tool>/       skills/, agents/, src/, evals/, dist/ for each tool
docs/research/         concepts, sources and design rules per tool
docs/briefs/           the build brief each tool was developed from
CONTEXT.md             glossary and numbered decisions; read it before changing anything
```

## Contributing

`main` changes only through reviewed pull requests. Branch naming, commit style and the rules for
agents working in this repo are in [CLAUDE.md](CLAUDE.md). Evals call the Claude API and cost
money: smoke-run on a couple of items first (each package README shows how), and agree on a
full run before starting it.
