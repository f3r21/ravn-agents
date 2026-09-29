# Foundation: plugin packaging, Claude Code configuration, models, evals, CCAF index

Scope: the shared ground under `ravn-agents` (CONTEXT.md decisions 4, 6, 15, 19, 20, 21, 22).
Facts checked against primary sources on 2026-09-25. Citations are `[Sn]`, listed under
Sources. "Exam says" citations point to private CCAF study notes by title; they are not published.

## Summary

1. One plugin can ship all three tools. `.claude-plugin/plugin.json` needs only `name`. Component paths must start with `./` and stay inside the plugin root, so the plugin root has to be the `labs/` repo root, with `packages/*` listed in the manifest [S1].
2. Plugin subagents ignore the `hooks`, `mcpServers` and `permissionMode` frontmatter [S5]. Per-agent hooks and MCP servers therefore go in the plugin-level `hooks/hooks.json` and `.mcp.json`, and each agent's reach is limited through `tools`.
3. Skill `allowed-tools` pre-approves tools but does not restrict them [S4]. The exam notes say it restricts, and they are wrong on this point. To take tools away, use `disallowed-tools` or a subagent's `tools` list.
4. Claude Opus 5.5 returns a 400 error for a forced `tool_choice` (`any`/`tool`) [S14][S15]. The exam's "force the tool" pattern works only on Sonnet 5 or earlier models. On any model, the portable option is `strict: true` with `auto` [S16].
5. Models as of today, per million input/output tokens: Fable 5.1 $10/$50, Opus 5.5 $4/$20, Sonnet 5 $2/$10, Haiku 4.5 $1/$5 [S12][S13]. Haiku 4.5 may be retired from 2026-10-15 [S12], so do not pin it in long-lived config.
6. Pin subagent models by full ID. An alias such as `opus` can resolve to the main session's model, and a per-invocation `model` parameter overrides the frontmatter [S5].
7. Evals: grade with code where possible and calibrate model judges against humans [S17][S18]. With n = 10 to 50, report a Wilson 95% interval [S21][S22], never a bare percentage. Report paired deltas against a baseline [S19].
8. One `eval-report` JSON Schema (below) carries tool, metric, value, n, CI, baseline, failures, model, commit and date. Keep it at `schemas/`, not `evals/`, because `evals/` is the default directory of `claude plugin eval` [S3].
9. The CCAF index maps 39 exam concepts to the three tools. D3 plan mode and the Message Batches API are not applied, and the index says so.

---

## 1. Plugin packaging

### 1.1 Manifest

- The manifest lives at `.claude-plugin/plugin.json` under the plugin root. Every other file goes at the plugin root, not inside `.claude-plugin/` [S1].
- The manifest itself is optional. Without one, components load from the standard layout [S1].
- `name` is the only required field. It must be kebab-case, with no spaces, `@`, `:` or path separators. Every component is namespaced under it: agent `reviewer` in plugin `deploy-tools` appears as `deploy-tools:reviewer` [S1].
- Other fields, from the Fields table [S1]:
  - Metadata: `displayName`, `version`, `description`, `author` (an object with a required `name`), `homepage`, `repository`, `license`, `keywords`, `metadata`, `defaultEnabled`, `dependencies`, `settings`, `userConfig`, `channels`.
  - Components: `skills`, `commands`, `agents`, `hooks`, `mcpServers`, `lspServers`, `outputStyles`, `workflows`, `experimental.{themes,monitors,evals}`.
- Unknown top-level keys are stripped with a warning. Unknown keys inside `userConfig`, `channels`, `lspServers` or `monitors` are errors [S1].
- `claude plugin validate ./dir` is the authoritative check. `--strict` turns warnings into failures in CI [S1].

### 1.2 Path rules

These rules shape the monorepo:

- Every component path is relative to the plugin root and must start with `./` [S1].
- A path that resolves outside the plugin root does not load. `..` is rejected [S1][S2].
- Marketplace plugins are copied to `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`. Files outside the plugin directory are not copied [S2].
- Some keys replace their default directory, some add to it, and some merge [S1]:
  - Replace: `commands`, `agents`, `outputStyles`, `workflows`, `experimental.themes`, `experimental.monitors`.
  - Add: `skills`.
  - Merge: `hooks`, `mcpServers`, `lspServers`.
- `agents` accepts `.md` files only, not directories [S1].
- A `CLAUDE.md` at the plugin root is not loaded as context, and validate warns about it. Put instructions that should reach Claude in a skill [S1].

### 1.3 What a plugin can bundle

Standard layout, from [S1]:

| Component | Default location | Notes for us |
|---|---|---|
| Manifest | `.claude-plugin/plugin.json` | One for the whole repo (decision 20) |
| Skills | `skills/<name>/SKILL.md` | Invoked as `/ravn-agents:<skill>` [S4] |
| Commands | `commands/*.md` | Legacy. "Prefer `skills/` for new plugins" [S1] |
| Agents | `agents/*.md` | Subfolders become part of the agent name [S1] |
| Hooks | `hooks/hooks.json` | Top-level `{"hooks": {...}}` object [S7] |
| MCP servers | `.mcp.json` | Tools are callable as `mcp__plugin_<plugin>_<server>__<tool>` [S8] |
| LSP servers | `.lsp.json` | Not needed |
| Output styles | `output-styles/` | Not needed |
| Executables | `bin/` | On the Bash `PATH` while the plugin is enabled. claude.ai/Cowork will not install a plugin that has `bin/` [S1] |
| Settings | `settings.json` | Only `agent` and `subagentStatusLine` take effect [S1] |
| Evals | `evals/` | `claude plugin eval` suite; `experimental.evals` relocates it [S1][S3] |

Path variables [S1]:

- `${CLAUDE_PLUGIN_ROOT}` is the installed version directory, and it changes on every update.
- `${CLAUDE_PLUGIN_DATA}` is persistent: `~/.claude/plugins/data/<id>/`.
- `${CLAUDE_PROJECT_DIR}` is the project root.

These variables are not in the environment of Bash-tool commands. In skill and agent Markdown bodies they are substituted inline [S1].

`userConfig` prompts the user for values when the plugin is enabled. `sensitive: true` values go to secure storage. Reference a value as `${user_config.KEY}` in MCP config, or as `CLAUDE_PLUGIN_OPTION_<KEY>` in hook processes [S1].

### 1.4 Marketplaces, install flow, versioning

- A marketplace is a directory or repository containing `.claude-plugin/marketplace.json`, which requires `name`, `owner` and `plugins[]`. Each entry needs `name` and `source` [S9].
- A relative `source` resolves from the marketplace root. `"."` means the root itself [S10].
- One repository can therefore be both the marketplace and the plugin.
- Keep the entry name equal to the manifest `name`. A mismatch breaks install-by-name [S9].
- Install flow [S9]:
  - `claude plugin marketplace add <owner>/<repo>` (or a local path)
  - `claude plugin install ravn-agents@<marketplace>`
  - `/reload-plugins` to apply changes in a running session.
- Team auto-configuration: `extraKnownMarketplaces` plus `enabledPlugins` in the repository's `.claude/settings.json`. These are honoured only after workspace trust, and they are ignored in untrusted `-p` runs [S11].
- Version resolution [S2]:
  - Order: the manifest `version`, then the marketplace entry's `version`, then the source commit SHA (12 characters).
  - A pinned `version` keeps users on the cached copy until the string changes.
  - A local-directory marketplace loads in place and ignores the version.
- Node dependencies [S2]:
  - Installed into the cache copy only when the plugin root has `package.json` plus a `package-lock.json`/`npm-shrinkwrap.json` or Bun lockfile.
  - The install runs `npm ci --ignore-scripts` with a 60 s timeout.
  - pnpm and Yarn lockfiles are skipped.
  - Local in-place plugins get no install.

### 1.5 One plugin, several tools

A plugin is a namespace (`ravn-agents:`) holding any number of skills, agents, hooks and MCP servers [S1]. Each tool is therefore a set of components under `packages/<tool>/`, listed in the one manifest. Two constraints follow:

- Skill names are flat under the plugin namespace. They must be unique across packages, for example `review-pr`, `onboard`, `ask-codebase` and `docs-to-tickets`.
- Agent files must be listed one by one, because `agents` takes files, not directories [S1].

### 1.6 Minimal valid example for our layout

The following is a proposed layout. It is not built yet, and `claude plugin validate .` must pass before first use.

```text
labs/                                   # plugin root AND marketplace root
├── .claude-plugin/
│   ├── plugin.json
│   └── marketplace.json
├── package.json                        # npm workspaces: packages/*
├── package-lock.json                   # npm lockfile: pnpm/Yarn are skipped at install [S2]
├── schemas/eval-report.schema.json     # shared eval report (section 4.6)
└── packages/
    ├── pr-review/
    │   ├── skills/review-pr/SKILL.md
    │   ├── agents/pr-coordinator.md
    │   ├── agents/pr-security.md
    │   └── evals/                      # own harness, writes eval-report JSON
    ├── onboarding/
    │   ├── skills/onboard/SKILL.md
    │   ├── skills/ask-codebase/SKILL.md
    │   ├── agents/area-mapper.md
    │   ├── hooks/hooks.json
    │   └── dist/check-map-staleness.js
    └── docs-to-tickets/
        ├── skills/docs-to-tickets/SKILL.md
        ├── agents/ticket-extractor.md
        └── dist/server.js              # MCP server, bundled
```

`.claude-plugin/plugin.json`:

```json
{
  "name": "ravn-agents",
  "version": "0.1.0",
  "description": "PR reviewer, codebase onboarding and docs-to-tickets for RAVN engineers",
  "author": { "name": "RAVN" },
  "skills": [
    "./packages/pr-review/skills/",
    "./packages/onboarding/skills/",
    "./packages/docs-to-tickets/skills/"
  ],
  "agents": [
    "./packages/pr-review/agents/pr-coordinator.md",
    "./packages/pr-review/agents/pr-security.md",
    "./packages/onboarding/agents/area-mapper.md",
    "./packages/docs-to-tickets/agents/ticket-extractor.md"
  ],
  "hooks": ["./packages/onboarding/hooks/hooks.json"],
  "mcpServers": {
    "tickets": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/packages/docs-to-tickets/dist/server.js"],
      "env": { "GITHUB_TOKEN": "${user_config.github_token}" }
    }
  },
  "userConfig": {
    "github_token": {
      "type": "string",
      "title": "GitHub token",
      "description": "Token with issues:write on the target repository",
      "sensitive": true
    }
  }
}
```

`.claude-plugin/marketplace.json`:

```json
{
  "name": "ravn-labs",
  "owner": { "name": "RAVN" },
  "plugins": [{ "name": "ravn-agents", "source": ".", "description": "Three CCAF-based tools" }]
}
```

`packages/onboarding/hooks/hooks.json` (decision 12, staleness flag). `SessionStart` cannot block, so the hook reports staleness through `additionalContext` [S7]:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume",
        "hooks": [
          {
            "type": "command",
            "command": "node",
            "args": ["${CLAUDE_PLUGIN_ROOT}/packages/onboarding/dist/check-map-staleness.js"],
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

Notes on this example:

- `skills` adds to the default `skills/` scan, which does not exist here. That is harmless [S1].
- The inline `mcpServers` form and `${user_config.*}` substitution in MCP `env` both follow [S1]'s examples. The `channels` example there uses a sensitive value in `env`.
- UNVERIFIED: whether `experimental.evals` accepts `./packages/...` paths. The manifest table says "Path, or array of paths" [S1], but the eval page asks for "plain directory names such as `qa` or `quality/evals`" [S3]. This is moot if we use our own harness (section 4).

---

## 2. Skills, subagents, hooks, settings, CLAUDE.md

### 2.1 Skills (`SKILL.md`)

Frontmatter fields [S4]:

| Group | Fields |
|---|---|
| Identity and triggering | `name`, `description`, `when_to_use` |
| Arguments | `argument-hint`, `arguments` |
| Who can invoke | `disable-model-invocation`, `user-invocable` |
| Tools | `allowed-tools`, `disallowed-tools` |
| Execution | `model`, `effort`, `context` (`fork`), `agent`, `background`, `hooks`, `paths`, `shell` |
| Agent Skills spec only | `metadata`, `license`, `compatibility` |

Progressive disclosure [S4]:

- The description always loads, unless `disable-model-invocation: true`.
- The full body loads only on invocation.
- `description` + `when_to_use` is capped at 1,536 characters in the listing.
- Keep the body under 500 lines. Move reference material to linked files.

`allowed-tools` [S4] "grants permission for the listed tools during the turn that invokes the skill … It does not restrict which tools are available: every tool remains callable". To restrict, use `disallowed-tools`, which removes tools while the skill is active.

**Contradiction with the exam notes.** *Ace the Exam* and `Anatomy of a Skill.md` say `allowed-tools` "restricts the skill to only the tools it absolutely needs". The official doc says the opposite. Our design uses the doc's semantics. On the exam, the tested behaviour may still be the older reading.

Workspace trust does not gate `allowed-tools`. A committed skill can grant itself broad access [S4]. Review ours accordingly.

Commands and skills: `.claude/commands/x.md` and `.claude/skills/x/SKILL.md` both create `/x`. Skills are preferred, and a skill wins a name clash [S4]. The exam notes' "commands for simple shortcuts" distinction (`Commands vs. Skills.md`) is now a style choice, not a capability boundary.

Course guidance (`Reference/Claude Code for Real Engineers/Skill authoring and feedback loops.md`):

- The description is the trigger contract. Write "what it does" plus a "Use when …" clause.
- Link supporting files from the body.
- Name the validation commands.

### 2.2 Subagents

Definition files are Markdown with YAML frontmatter [S5]. Only `name` and `description` are required. Optional fields: `tools`, `disallowedTools`, `model`, `permissionMode`, `maxTurns`, `skills`, `mcpServers`, `hooks`, `memory`, `background`, `omitClaudeMd`, `effort`, `isolation` (`worktree`), `color`, `initialPrompt`.

Scope priority, highest first [S5]: managed, then `--agents`, then `.claude/agents/`, then `~/.claude/agents/`, then plugin `agents/`.

Plugin restriction [S5]: "For security reasons, plugin subagents don't support the `hooks`, `mcpServers`, or `permissionMode` frontmatter fields. These fields are ignored when loading agents from a plugin."

Model field [S5]:

- Accepts an alias (`sonnet`, `opus`, `haiku`, `fable`), a full ID such as `claude-sonnet-5`, or `inherit`.
- Resolution order: the per-invocation `model` parameter, then frontmatter, then `CLAUDE_CODE_SUBAGENT_MODEL`, then the main model.
- A family alias resolves to the main conversation's exact model when that model is in the same family.
- `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` makes the env var win everywhere.

Nesting and naming [S5]:

- Subagents can spawn subagents up to three layers below the main conversation. `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` controls the depth.
- The Task tool was renamed Agent in v2.1.63. `Task(...)` still works as an alias. The exam notes' "Task tool" (`Decision rules D1.md` §1.3) is the old name.

Built-ins [S5]: Explore and Plan (read-only, inheriting the main model) and general-purpose. `Agent(Name)` deny rules disable one [S6].

### 2.3 Hooks

- Events [S7]: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, `PostToolUseFailure`, `PostToolBatch`, `Stop`, `SubagentStart`, `SubagentStop`, `PreCompact`, `InstructionsLoaded`, `SessionEnd`, and others. The full table is in [S7].
- Matchers [S7]:
  - Tool events match tool names (`Bash`, `Edit|Write`, regex, `mcp__<server>__.*`).
  - `SessionStart` matches `startup|resume|clear|compact|fork`.
  - `SubagentStart`/`SubagentStop` match the agent type.
- Handler types [S7]: `command` (shell form, or exec form with `args`), `http`, `mcp_tool`, `prompt`, `agent` (experimental).
- Exit codes [S7]:
  - 0: success; stdout is parsed as JSON when it is a `{…}` object.
  - 2: "a blocking error". It blocks on blockable events (for example `PreToolUse`, `UserPromptSubmit`, `Stop`), and "even a JSON `permissionDecision` of `"allow"` can't override it".
  - Exit 1 is non-blocking: "If your hook is meant to enforce a policy, use `exit 2`."
  - `PostToolUse` exit 2 "Shows stderr to Claude; the tool already ran". `SessionStart` exit 2 only shows stderr to the user.
- JSON decisions [S7]:
  - `PreToolUse` uses `hookSpecificOutput.permissionDecision` (`allow|deny|ask|defer`) plus `permissionDecisionReason`.
  - `PostToolUse` and `Stop` use top-level `decision: "block"` plus `reason`.
  - `SessionStart` uses `hookSpecificOutput.additionalContext`.
- Timeouts [S7]:
  - A timed-out `PreToolUse` command hook does not block. The call continues through the permission flow, "so don't count on a stalled hook to act as a gate".
  - The default command timeout is 600 s.
- Plugin hooks live in `hooks/hooks.json` and use `${CLAUDE_PLUGIN_ROOT}` [S7][S1].

Exam view (`Decision rules D1.md` §1.5): `PostToolUse` normalises tool results, and an interception hook blocks policy violations. Both are deterministic. The docs confirm both mechanisms.

### 2.4 Settings and permissions

- Settings precedence [S23]: managed, then CLI args, then `.claude/settings.local.json`, then `.claude/settings.json`, then `~/.claude/settings.json`.
- Permission rules evaluate "deny, then ask, then allow. The first match in that order determines the outcome, and rule specificity doesn't change the order". A deny at any scope beats an allow at any other [S6].
- MCP rules take the forms `mcp__server`, `mcp__server__*` and `mcp__server__tool`. Subagent rules take the form `Agent(Name)` [S6].
- Modes [S6]: `default`, `acceptEdits`, `plan`, `auto`, `dontAsk`, `bypassPermissions`.

### 2.5 CLAUDE.md

- Locations [S24]: managed policy, `~/.claude/CLAUDE.md`, `./CLAUDE.md` or `./.claude/CLAUDE.md`, and `./CLAUDE.local.md`.
- Loading [S24]: CLAUDE.md files in the directories above the working directory load at launch. Files in subdirectories load on demand.
- Instructions [S24]:
  - `@path` imports go up to four hops deep.
  - `.claude/rules/*.md` with `paths:` frontmatter load only when matching files are read.
  - Target under 200 lines per file.
- Files are "concatenated into context rather than overriding each other". On conflicts, "Claude may pick one arbitrarily". "If the instruction is something that must run at a specific point … write it as a hook instead" [S24].

**Contradiction with the exam notes.** `CLAUDE.md Hierarchy.md` says "the most specific layer wins every single time". The doc says layers concatenate, with closer files read later, and nothing overrides. Design for the doc: do not rely on overriding, and avoid conflicting rules.

---

## 3. Model selection

| Model | API ID | $/MTok in / out | Batch in / out | Context / max out | Positioning |
|---|---|---|---|---|---|
| Claude Fable 5.1 | `claude-fable-5-1` | 10 / 50 | 5 / 25 | 1M / 128K | "demanding reasoning and long-horizon agentic work" |
| Claude Opus 5.5 | `claude-opus-5-5` | 4 / 20 | 2 / 10 | 1M / 128K | "long-running agentic coding and knowledge work" |
| Claude Sonnet 5 | `claude-sonnet-5` | 2 / 10 | 1 / 5 | 1M / 128K | "best combination of speed and intelligence" |
| Claude Haiku 4.5 | `claude-haiku-4-5-20251001` | 1 / 5 | 0.50 / 2.50 | 200K / 64K | "fastest model with near-frontier intelligence" |

Sources: [S12] for IDs, prices, context and positioning; [S13] for batch prices and the footnote that Sonnet 5's $2/$10 "is now the standard price". Cache hits cost 0.1x the base input price, except 0.05x on Opus 5.5 and 0.025x on Fable 5.1 [S13].

- **Retirement.** Haiku 4.5 is "Not sooner than October 15, 2026" and Sonnet 5 "Not sooner than June 30, 2027" [S12].
- **Official guidance** [S20]:
  - "Most workloads start with Claude Opus 5.5."
  - Sonnet 5 for "everyday coding, agent, and enterprise workloads".
  - Haiku 4.5 for high-volume and "sub-agent tasks".
  - Fable 5.1 when evals at `xhigh`/`max` effort on Opus 5.5 "still fall short".
  - "Tuning effort is often a better lever than switching models". Opus 5.5's default effort is `medium`.
  - Multi-model "orchestrator that delegates bulk work to lower-cost workers" is a named pattern.
- **Forced tool use on Opus 5.5 / Fable 5.1** [S14][S15]:
  - `tool_choice` of `any` or `tool` returns 400 `invalid_request_error`.
  - Use `auto` with `strict: true` [S16] or structured outputs.
  - On other models, manual extended thinking also blocks forced tool use, but adaptive thinking "doesn't block" it [S15].
- **Claude Code aliases** [S25]: on the Anthropic API `opus` resolves to Opus 5.5 and `sonnet` to Sonnet 5. On Bedrock and Google Cloud `sonnet` is Sonnet 4.5. "To pin to a specific version, use the full model name".

Decision 22 check: Opus 5.5 for coordinators and Sonnet 5 for scoped subagents and extraction matches [S20]'s orchestrator/worker pattern. Nothing contradicts it. Two consequences:

- Subagent files should say `model: claude-sonnet-5`, not `sonnet`, so that the model the eval measured is the model that runs [S5][S25].
- Anything that needs a forced tool call (the exam's D4 pattern) must run on Sonnet 5, or use `strict` with `auto`.

---

## 4. Eval methodology, shared across the three tools

### 4.1 What Anthropic says

Definitions [S18]:

- A task is "a single test with defined inputs and success criteria".
- A trial is each attempt: "we run multiple trials to produce more consistent results".
- A grader is "logic that scores some aspect of the agent's performance".
- A transcript is the full record. The outcome is "the final state in the environment".

Grader choice [S17][S18]:

- [S17] says to "choose the fastest, most reliable, most scalable method": code-based first, then LLM-based ("Test to ensure reliability first then scale"), with human grading avoided where possible.
- [S18] tabulates the trade-offs. Code graders are "fast, cheap, objective, reproducible" but "brittle". Model graders are "flexible" but "non-deterministic, expensive, requires human calibration".

Rubrics [S17]: "Have detailed, clear rubrics". The output should be "only 'correct' or 'incorrect'" or on a 1 to 5 scale. The judge should "reason first … then discard the reasoning".

Suite size and transcripts [S18]:

- "20-50 simple tasks drawn from real failures is a great start".
- "LLM-as-judge graders should be closely calibrated with human experts".
- "You won't know if your graders are working well unless you read the transcripts".
- Avoid grading "a sequence of tool calls in the right order". That is "too rigid".
- Capability evals "should start at a low pass rate". Regression evals should sit near 100%.
- pass@k is at least one success in k trials. pass^k is "all k trials succeed" [S18].

Success criteria [S17]: "Specific, Measurable, Achievable, Relevant". [S17] also says "Prioritize volume over quality". This pulls against decisions 13 and 18, which use roughly 15 to 50 hand-built items. Section 4.3 covers how to report honestly within that limit.

### 4.2 LLM-as-judge biases

Zheng et al. identify "position, verbosity, and self-enhancement biases, as well as limited reasoning ability" [S26]. Strong judges reach over 80% agreement with humans, "the same level of agreement between humans" [S26].

Mitigations, each tied to a source:

- Binary rubrics with concrete PASS/FAIL conditions [S17][S3].
- A code grader for long outputs [S3]: "For long output … grade it with a `regex` grader".
- A judge from a different family or tier than the model under test, to limit self-enhancement [S26]. Treat this as inference from the named bias, not a vendor rule.
- A human agreement check on a sample. Record it as `grader.humanAgreement` [S18].
- For pairwise comparisons, randomise the A/B order to counter position bias [S26].

Built-in behaviour of `claude plugin eval` [S3]:

- The `llm` grader passes when the "judge model votes PASS on the rubric in at least two of three votes".
- The default judge is "a small fast model". "Pass `--judge-model sonnet` … for nuanced rubrics".
- "There are no custom-code graders."

### 4.3 Small-N statistics

Report an interval, not a bare rate:

- Miller's first recommendation is to report the standard error with every score. He also advises clustered errors when items are grouped, several samples per item, paired differences when comparing two systems, and power analysis [S19].
- "If an eval doesn't have very many questions, confidence intervals … will tend to be wide" [S19].
- For a proportion at small n, the Wald interval (p̂ ± z·√(p̂(1−p̂)/n)) behaves erratically. Brown, Cai and DasGupta recommend Wilson or Jeffreys for small n [S22].
- NIST recommends Wilson "for virtually all combinations of n and p". Wilson's lower limit "cannot be negative" [S21].

Wilson score interval at z = 1.96 [S21]:

```
centre    = (p̂ + z²/(2n)) / (1 + z²/n)
halfWidth = z · sqrt( p̂(1−p̂)/n + z²/(4n²) ) / (1 + z²/n)
CI        = [centre − halfWidth, centre + halfWidth]
```

What the intervals look like at our sizes (computed with the formula above):

| Successes / n | p̂ | Wilson 95% | Wald 95% (for contrast) |
|---|---|---|---|
| 7 / 10 | 0.70 | 0.40 to 0.89 | 0.42 to 0.98 |
| 10 / 10 | 1.00 | 0.72 to 1.00 | 1.00 to 1.00 (degenerate) |
| 12 / 15 | 0.80 | 0.55 to 0.93 | 0.60 to 1.00 (over 1, clipped) |
| 12 / 20 | 0.60 | 0.39 to 0.78 | n/a |
| 24 / 30 | 0.80 | 0.63 to 0.91 | 0.66 to 0.94 |
| 40 / 50 | 0.80 | 0.67 to 0.89 | 0.69 to 0.91 |
| 0 / 10 | 0.00 | 0.00 to 0.28 | 0.00 to 0.00 (degenerate) |

Rules that follow:

1. **Say "12 of 15", not "80%".** Always print k/n next to the rate.
2. **Compare on the same items.** For the onboarding eval (decision 18), with and without the map run on the same ~15 questions. Report the paired difference and the discordant counts [S19]. An exact McNemar test on the discordant pairs is a reasonable choice here, but that recommendation is not drawn from the sources above.
3. **Keep trials separate from items.** Several trials per item reduce within-item variance [S19], but `n` stays the number of independent items. Cluster on the item [S19].
4. **Freeze the item list before tuning.** Store it with the repository SHA. Tuning prompts on the full set and then reporting on it overfits. When items allow, keep a held-out split [S17].
5. **Two overlapping intervals prove nothing either way.** Say "not distinguishable at this n" instead of claiming a win.

### 4.4 Honest reporting

- Every number carries n, the CI, the baseline, the model IDs, the commit and the date. These are the schema's required fields.
- `failures[]` lists every miss with a failure-mode category. Decision 6 requires documented failure modes, and the report ties each miss to one.
- If a run is partial (cost ceiling or interruption), mark it `partial: true` and keep it out of trends [S3].
- Pin the model in the eval run so that "a model rollout isn't mistaken for a plugin regression" [S3].

### 4.5 `claude plugin eval` versus our own harness

`claude plugin eval` [S3]:

- Runs each case in a fresh non-interactive session with only the plugin loaded, three runs by default.
- Scores against a no-plugin baseline (`Δ`).
- Writes `aggregate-result.json` (`schemaVersion: 1`) and `report.html`.
- Graders: `regex`, `tool_used`, `tool_order`, `file_exists`, `llm`, `baseline`. "There are no custom-code graders."
- Each run starts in an empty directory. `case.yaml` `context.scaffold_script` can build fixtures, and MCP tools can be mocked.

Fit to our three evals:

- PR replay (decision 8): needs a checkout of the pre-fix commit plus matching of findings to known bugs.
- Onboarding (decision 18): needs token and time capture, with and without the map.
- Docs to tickets (decision 13): needs per-field comparison with the filed issues.

All three need custom-code grading, which the built-in runner does not offer. Use it for skill-triggering regressions (`tool_used: Skill`) and for the no-plugin Δ. Produce the headline number with a TypeScript harness (decision 16) that emits the shared report below.

### 4.6 Shared eval report (decision 20)

The schema lives at `schemas/eval-report.schema.json`. Each tool writes one file per run to `packages/<tool>/evals/results/<date>-<commit>.json`. The results directory should be gitignored except for runs whose numbers are published; [S3] likewise advises adding `results/` to `.gitignore`.

Per-tool metric mapping:

| Tool | `metric.name` | kind | Item (`n`) | Baseline | Secondary |
|---|---|---|---|---|---|
| pr-review | `historical_bug_recall` | proportion | historical buggy PR (decision 8) | single-prompt review on the same PRs | `inline_precision` (decision 17), cost |
| onboarding | `answer_accuracy_with_map` | proportion | question (decision 18) | same questions without the map (paired) | tokens and wall time, median per question |
| docs-to-tickets | `issue_match_recall` (or field accuracy) | proportion | ground-truth issue (decision 13) | none, or a single-pass extraction | per-field accuracy, share routed to `needs-review` (decision 14) |

JSON Schema (draft 2020-12). It was validated with `jsonschema` 4.26 against the example below, and it rejects a proportion without `successes`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "urn:ravn-agents:eval-report:1.0",
  "title": "ravn-agents eval report",
  "description": "One measured number for one tool, with its sample size, interval, baseline and failures.",
  "type": "object",
  "additionalProperties": false,
  "required": ["schemaVersion", "tool", "metric", "value", "n", "ci", "baseline", "failures", "model", "commit", "date", "dataset", "grader"],
  "properties": {
    "schemaVersion": { "const": "1.0" },
    "tool": { "enum": ["pr-review", "onboarding", "docs-to-tickets"] },
    "metric": {
      "type": "object",
      "additionalProperties": false,
      "required": ["name", "kind", "definition", "higherIsBetter"],
      "properties": {
        "name": { "type": "string", "pattern": "^[a-z][a-z0-9_]*$" },
        "kind": { "enum": ["proportion", "mean", "median"] },
        "definition": { "type": "string", "minLength": 10 },
        "unit": { "type": "string" },
        "higherIsBetter": { "type": "boolean" }
      }
    },
    "value": { "type": "number" },
    "n": { "type": "integer", "minimum": 1, "description": "Number of independent items (PRs, questions, briefs), not trials." },
    "successes": { "type": "integer", "minimum": 0, "description": "Required when metric.kind is proportion." },
    "trialsPerItem": { "type": "integer", "minimum": 1, "default": 1 },
    "ci": {
      "type": "object",
      "additionalProperties": false,
      "required": ["method", "level", "lower", "upper"],
      "properties": {
        "method": { "enum": ["wilson", "clopper-pearson", "bootstrap", "clustered-sem", "none"] },
        "level": { "type": "number", "exclusiveMinimum": 0, "exclusiveMaximum": 1 },
        "lower": { "type": ["number", "null"] },
        "upper": { "type": ["number", "null"] }
      }
    },
    "baseline": {
      "description": "Null only when no comparison was run; the reason goes in notes.",
      "oneOf": [
        { "type": "null" },
        {
          "type": "object",
          "additionalProperties": false,
          "required": ["label", "value", "n"],
          "properties": {
            "label": { "type": "string" },
            "value": { "type": "number" },
            "n": { "type": "integer", "minimum": 1 },
            "successes": { "type": "integer", "minimum": 0 },
            "ci": { "$ref": "#/properties/ci" },
            "paired": { "type": "boolean", "description": "True when baseline and tool ran on the same items." },
            "delta": { "type": "number", "description": "value minus baseline.value" },
            "deltaCi": { "$ref": "#/properties/ci" }
          }
        }
      ]
    },
    "secondaryMetrics": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["name", "value"],
        "properties": {
          "name": { "type": "string" },
          "value": { "type": "number" },
          "unit": { "type": "string" },
          "n": { "type": "integer", "minimum": 1 },
          "ci": { "$ref": "#/properties/ci" },
          "baselineValue": { "type": "number" }
        }
      }
    },
    "failures": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["itemId", "category", "expected", "actual"],
        "properties": {
          "itemId": { "type": "string" },
          "category": { "type": "string", "description": "A failure-mode id documented in the tool's failure-mode list, or 'other'." },
          "categoryDetail": { "type": "string" },
          "expected": { "type": "string" },
          "actual": { "type": "string" },
          "transcript": { "type": "string", "description": "Path to the stored transcript for this item." }
        }
      }
    },
    "grader": {
      "type": "object",
      "additionalProperties": false,
      "required": ["type"],
      "properties": {
        "type": { "enum": ["code", "model", "human", "mixed"] },
        "judgeModel": { "type": "string" },
        "rubric": { "type": "string", "description": "Path to the rubric file." },
        "humanAgreement": {
          "type": "object",
          "additionalProperties": false,
          "required": ["n", "agreement"],
          "properties": {
            "n": { "type": "integer", "minimum": 1 },
            "agreement": { "type": "number", "minimum": 0, "maximum": 1 }
          }
        }
      }
    },
    "model": {
      "type": "object",
      "additionalProperties": false,
      "required": ["main"],
      "properties": {
        "main": { "type": "string", "description": "Full model ID of the session or coordinator, never an alias." },
        "subagents": { "type": "object", "additionalProperties": { "type": "string" } },
        "effort": { "type": "string" }
      }
    },
    "commit": { "type": "string", "pattern": "^[0-9a-f]{7,40}$", "description": "labs commit the tool ran from." },
    "pluginVersion": { "type": "string" },
    "claudeCodeVersion": { "type": "string" },
    "date": { "type": "string", "format": "date-time" },
    "dataset": {
      "type": "object",
      "additionalProperties": false,
      "required": ["repo", "ref", "items"],
      "properties": {
        "repo": { "type": "string" },
        "ref": { "type": "string", "description": "Commit SHA of the evaluated repository." },
        "items": { "type": "string", "description": "Path to the frozen item list in labs." },
        "selection": { "type": "string", "description": "How items were chosen, including exclusions." }
      }
    },
    "cost": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "usd": { "type": "number", "minimum": 0 },
        "inputTokens": { "type": "integer", "minimum": 0 },
        "outputTokens": { "type": "integer", "minimum": 0 },
        "wallSeconds": { "type": "number", "minimum": 0 }
      }
    },
    "partial": { "type": "boolean", "default": false },
    "notes": { "type": "string" }
  },
  "allOf": [
    {
      "if": { "properties": { "metric": { "properties": { "kind": { "const": "proportion" } } } } },
      "then": { "required": ["successes"], "properties": { "value": { "minimum": 0, "maximum": 1 } } }
    }
  ]
}
```

Example document (illustrative values; the Wilson interval is computed for 12/20):

```json
{
  "schemaVersion": "1.0",
  "tool": "pr-review",
  "metric": {
    "name": "historical_bug_recall",
    "kind": "proportion",
    "definition": "Share of historical PRs whose bug (fixed by a later PR) the reviewer flagged at high or critical severity on the original diff.",
    "higherIsBetter": true
  },
  "value": 0.6,
  "n": 20,
  "successes": 12,
  "trialsPerItem": 1,
  "ci": { "method": "wilson", "level": 0.95, "lower": 0.387, "upper": 0.781 },
  "baseline": {
    "label": "single-prompt review, same model, no subagents",
    "value": 0.35,
    "n": 20,
    "successes": 7,
    "paired": true,
    "delta": 0.25
  },
  "secondaryMetrics": [
    { "name": "inline_precision", "value": 0.71, "n": 17, "unit": "proportion" }
  ],
  "failures": [
    {
      "itemId": "ravn-ui-kit#41",
      "category": "missed-cross-file",
      "expected": "Flag the prop rename that breaks Button consumers",
      "actual": "No finding at high or critical",
      "transcript": "packages/pr-review/evals/results/2026-09-28/ravn-ui-kit-41.jsonl"
    }
  ],
  "grader": { "type": "model", "judgeModel": "claude-sonnet-5", "rubric": "packages/pr-review/evals/rubric.md", "humanAgreement": { "n": 10, "agreement": 0.9 } },
  "model": { "main": "claude-opus-5-5", "subagents": { "pr-security": "claude-sonnet-5" } },
  "commit": "0a1b2c3",
  "pluginVersion": "0.1.0",
  "date": "2026-09-28T15:00:00Z",
  "dataset": { "repo": "f3r21/ravn-ui-kit", "ref": "3f2e1d0c9b8a", "items": "packages/pr-review/evals/items.json", "selection": "Every PR later referenced as fixed by another PR; see items.json" },
  "cost": { "usd": 4.2, "wallSeconds": 1260 },
  "partial": false,
  "notes": "Illustrative values only."
}
```

---

## 5. CCAF concept index

Columns:

- **Exam note** is the study note that states the exam's view. `D1` means *Decision rules D1*, `D2` and `D5` likewise, `Syl` means *Syllabus coverage*, and D3/D4 cite their folder notes.
- **Tool**: PR = PR reviewer, ON = onboarding, DT = docs to tickets.
- **Primary source** points to Sources.

| # | Concept | Dom | One-line definition (exam view) | Exam note | Primary source | Tool |
|---|---|---|---|---|---|---|
| 1 | Agentic loop on `stop_reason` | D1 | Continue while `tool_use`, stop on `end_turn`; never parse text to stop | D1 §1.1 | [S27] | Provided by the Claude Code runtime; not built by us |
| 2 | Coordinator and subagents (hub and spoke) | D1 | Coordinator decomposes, delegates, aggregates; decides per input which subagents run | D1 §1.2; practice mock 01 (routing item) | [S5][S29] | PR (decision 11) |
| 3 | Explicit context passing to subagents | D1/D5 | Subagents inherit nothing; pass structured findings with metadata | D1 §1.3 | [S5] | PR, ON |
| 4 | Parallel subagent spawning | D1 | Several Agent (Task) calls in one response | D1 §1.3 | [S5] | PR, ON |
| 5 | Programmatic enforcement over prompts | D1 | Rules that must hold are code (prerequisite gates), not capitals | D1 §1.4 | [S7] | DT (server-side validation), PR (severity filter in code) |
| 6 | Structured human handoff | D1 | Summary of ID, root cause, what was tried, next action | D1 §1.4 | [S29] | DT (`needs-review` draft body) |
| 7 | Hooks: PostToolUse normalise, PreToolUse intercept | D1 | Deterministic transformation and blocking | D1 §1.5 | [S7] | ON (staleness, decision 12); PR (candidate: guard on `gh` posting) |
| 8 | Prompt chaining vs dynamic decomposition | D1/D4 | Fixed passes for predictable work, adaptive plans for open-ended | D1 §1.6 | [S28] | PR (per-file then cross-file), ON (per-area then integration) |
| 9 | Session resume, fork, fresh-with-summary | D1/D3 | Resume when context is valid, fork to compare, fresh plus summary when stale | D1 §1.7 | [S30] | ON (the map is the persisted summary) |
| 10 | Tool descriptions and splitting | D2 | Description is the selection mechanism; split generic tools | D2 §2.1 | [S31][S32] | DT (MCP tool definitions, decision 10) |
| 11 | Structured tool errors (`isError`, category, retryable) | D2/D5 | Typed errors; business errors not retried | D2 §2.2 | [S31][S15] | DT |
| 12 | Scoped tool distribution per agent | D2 | Four or five tools per role | D2 §2.3 | [S5] | PR (per-subagent `tools`), DT |
| 13 | `tool_choice` auto / any / forced | D2/D4 | Force the prerequisite once, then release | D2 §2.3; Syl | [S15][S14] | DT, with caveat: 400 on Opus 5.5 |
| 14 | MCP server scope and env expansion | D2 | Team servers in project config, secrets as `${VAR}` | D2 §2.4 | [S8][S1] | DT (plugin `mcpServers` + `userConfig`) |
| 15 | MCP resources vs tools | D2 | Catalogs as resources, actions as tools | D2 §2.4 | [S33] | ON (candidate: expose the map as a resource); not applied yet |
| 16 | Built-in tools: Grep, Glob, Read, Edit | D2 | Grep for content, Glob for paths, incremental reading | D2 §2.5 | [S6] | ON |
| 17 | CLAUDE.md hierarchy and `@import` | D3 | User, project, directory layers | `3.../CLAUDE.md Hierarchy/CLAUDE.md Hierarchy.md` | [S24] | Not applied by tools; plugin CLAUDE.md is not loaded [S1] |
| 18 | `.claude/rules/` with `paths:` | D3 | Path-scoped rules load automatically | Syl | [S24] | ON (candidate: rule pointing at `docs/codebase-map/`) |
| 19 | Skills: frontmatter, `context: fork`, `argument-hint` | D3 | Skills for isolated multi-step work | `3.../Custom Commands & Skills/*.md` | [S4] | PR, ON, DT (entry points) |
| 20 | `allowed-tools` | D3 | Exam: restricts tools. Docs: pre-approves only | `Ace the Exam.md` | [S4] | All; use `disallowed-tools` or agent `tools` to restrict |
| 21 | Commands vs skills | D3 | Commands for shortcuts, skills for complex work | `Commands vs. Skills.md` | [S4] | Skills only |
| 22 | Plan mode vs direct execution | D3 | Plan mode for multi-file, unclear scope | `3.../Plan Mode & Iterative Refinement/*.md` | [S6] | Not applied (engineer's workflow, not tool behaviour) |
| 23 | Iterative refinement, TDD, interview | D3 | Concrete tests and examples drive iteration | same folder | [S18] | Build process: eval-driven iteration, not a runtime feature |
| 24 | CI flags: `-p`, `--output-format json`, `--json-schema` | D3 | Non-interactive structured output | `3.../CICD & Batch Processing/*.md` | [S34] | PR (headless run), eval harness |
| 25 | Independent review session (no self-review) | D3 | Reviewer must not share the generator's context | `CICD & Batch Processing.md` | [S5] | PR |
| 26 | Explore subagent, `/compact`, `/memory` | D3 | Isolate verbose discovery | Syl | [S5][S24] | ON |
| 27 | Plugin packaging and marketplaces | D3 (beyond syllabus) | Not in the exam appendix | Syl (absent) | [S1][S9] | All (decision 4) |
| 28 | Explicit criteria | D4 | Measurable report/skip rules beat "be thorough" | `4.../Explicit Criteria Design/*.md` | [S28] | PR (decision 17), DT |
| 29 | Few-shot examples | D4 | Exam: 2 to 4 targeted examples with an edge case. Docs: "3–5 examples" | `4.../Few-Shot Prompting/*.md` | [S28] | PR (decision 17), DT |
| 30 | Structured output via schema | D4 | Shape is guaranteed, values are not | `4.../Structured Output via tool_use/*.md` | [S16][S35] | DT |
| 31 | Nullable fields and "other" + detail enums | D4 | Prevent invented values | same | [S35] | DT |
| 32 | Semantic validation and retry loop | D4 | Validate meaning after schema, retry with the error | same; Syl (Pydantic) | [S35] | DT (Zod or equivalent in TypeScript) |
| 33 | Message Batches API | D4 | 50% off, up to 24 h, `custom_id` | `CICD & Batch Processing.md` | [S36] | Not applied (interactive latency); candidate for bulk eval judging |
| 34 | Case-facts block and trimming tool output | D5 | Persist exact facts, trim verbose results | D5 §5.1 | [S37] | ON (map entries), PR (diff trimming) |
| 35 | Escalation criteria | D5 | Explicit triggers, not sentiment or self-rated confidence | D5 §5.2 | [S29] | DT (`needs-review`), PR (inline vs summary) |
| 36 | Error propagation across agents | D5 | Access failure vs valid empty; coverage annotations | D5 §5.3 | [S29] | PR (subagent failures noted in summary comment) |
| 37 | Large-codebase context: scratchpad, manifests | D5 | Scratchpad files, crash-recovery manifests | D5 §5.4 | [S37] | ON (the map is the scratchpad; stamped SHA is the manifest) |
| 38 | Calibrated field-level confidence, stratified sampling | D5 | Thresholds calibrated on labelled data; segment accuracy | D5 §5.5; practice mock 01 | [S18] | DT (decision 14) |
| 39 | Provenance: claim-to-source mapping | D5 | Every claim keeps source, date, excerpt | D5 §5.6 | [S38] | ON (file:line + SHA per map claim), DT (brief section per field) |

Coverage: every D1, D2, D4 and D5 concept is applied by at least one tool, except the Batch API (D4). D3 concepts 17, 22 and 23 concern the engineer's own configuration or workflow, and are not tool behaviour. Decision 3 allows these gaps.

---

## 6. Design rules for ravn-agents

1. **The plugin root is the `labs/` repo root.** It holds `.claude-plugin/plugin.json` and `marketplace.json` (`source: "."`), and lists `packages/*` components by `./` paths. Reason: paths must stay inside the plugin root, and files outside it are not copied [S1][S2][S10]. Decisions 4, 20, 21.
2. **Agents are listed file by file in `agents`. Skills are listed per package directory in `skills`.** Skill names are unique across packages [S1][S4]. Decision 20.
3. **Put no `hooks`, `mcpServers` or `permissionMode` in agent frontmatter.** Plugin subagents ignore them [S5].
   - Hooks go in package `hooks/hooks.json` files referenced from the manifest.
   - MCP servers go in the manifest's `mcpServers`.
   - Reach is limited through `tools`, for example `tools: Read, Grep, mcp__plugin_ravn-agents_tickets__create_issue` [S8].
   - This limits decision 4 but does not contradict it.
4. **Restrict with `disallowed-tools` or `tools`, never with `allowed-tools`.** The latter only pre-approves [S4]. This contradicts the exam notes, not CONTEXT.md.
5. **Enforce policy in code.**
   - PR reviewer: the severity filter (decision 17) runs in TypeScript before posting, not only in the prompt.
   - Docs to tickets: required fields are validated in the MCP server.
   - A blocking hook must `exit 2`. Exit 1 does not block [S7]. See `Decision rules D1.md` §1.4 and `The Winning Philosophy.md`.
6. **The staleness hook informs and does not block.** `SessionStart` returns `additionalContext` with the stale areas; exit 2 there cannot block [S7]. Decision 12.
7. **Pin models by full ID** in subagent frontmatter and eval runs: `claude-opus-5-5` for coordinators, `claude-sonnet-5` for scoped agents and extraction [S5][S25]. Decision 22.
   _Superseded 2026-09-26 by the revised decision 22: `claude-opus-5-5` for every agent and judge._
8. **No forced `tool_choice` on Opus 5.5.** The docs-to-tickets extraction either runs on Sonnet 5 or uses `strict: true` with `auto` [S14][S15][S16]. This contradicts the exam's D4 pattern (`Structured Output via tool_use.md`), not a decision.
9. **Do not pin Haiku 4.5** in CI or eval config, including as the judge. It may be retired from 2026-10-15 [S12]. Use `claude-sonnet-5` as the judge [S3].
   _Judge model superseded 2026-09-26 by decisions 22 and 24: judges run on `claude-opus-5-5`._
10. **Use npm workspaces with a `package-lock.json`, and bundle the MCP server and hook scripts to `dist/`.** The cache install skips pnpm and Yarn, and it does not run for in-place local marketplaces [S2]. Decision 16.
11. **Credentials come through `userConfig` with `sensitive: true`,** never committed [S1]. See `Decision rules D2.md` §2.4. Decision 10.
12. **Every eval number is a shared eval-report JSON** with n, a Wilson CI, a baseline, failures and pinned models [S17][S19][S21][S22]. The schema lives in `schemas/`, not `evals/` [S3]. Decisions 6, 20.
13. **Grade with code first.** Model judges use binary rubrics and are checked against at least 10 human-labelled items, with the agreement recorded [S17][S18][S26]. Decisions 8, 13, 18.
14. **Freeze and version the eval items before tuning.** Report k/n with the interval. At n = 15, a 20-point difference is usually within noise (see the table in 4.3) [S19][S22]. Decisions 13, 18.
15. **Build tools in parallel worktrees, with the manifest owned by one branch.** Each tool branch touches only its `packages/<tool>/` and adds its lines to `plugin.json` in the merge. Skills search only up to the worktree root [S4]. Decisions 15, 19.

### Sources that contradict or constrain CONTEXT.md decisions

| Decision | Source | Effect |
|---|---|---|
| 4 (plugin with subagents, hooks, MCP) | [S5] plugin subagents ignore `hooks`, `mcpServers`, `permissionMode` | Constraint: move them to plugin level (rule 3) |
| 7 (posts via `gh`) | [S5] no `permissionMode` for plugin agents; [S6] allow rules | Constraint: users need a `Bash(gh pr review *)` allow rule, or get prompted |
| 16 (TypeScript) + 20 (monorepo) | [S2] pnpm/Yarn lockfiles skipped; paths confined to plugin root | Constraint: npm lockfile and repo-root plugin (rules 1, 10) |
| 18 (~15 questions) | [S17] "Prioritize volume over quality"; [S18] 20 to 50 tasks | Tension: 15 is small. Report Wilson CI and paired deltas, or grow to 20+ |
| 22 (Opus 5.5 coordinators) | [S14] forced `tool_choice` returns 400 on Opus 5.5 | Constraint on any structured-output step that runs on the coordinator (rule 8) |
| 8 (recall of historical bugs) | [S18] graders should look at outcomes; D4 alert-fatigue note | Gap, not a contradiction: add precision as a secondary metric so recall is not bought with noise |

No source contradicts decisions 1, 2, 3, 5, 6, 9 to 15, 17, 19, 20, 21 or 23.

---

## Sources

All accessed 2026-09-25.

1. [S1] Claude Code, "Plugin manifest reference". https://code.claude.com/docs/en/plugins/manifest-reference
2. [S2] Claude Code, "Plugin loading reference". https://code.claude.com/docs/en/plugins/loading
3. [S3] Claude Code, "Test plugins with evals". https://code.claude.com/docs/en/plugin-evals
4. [S4] Claude Code, "Skills". https://code.claude.com/docs/en/skills
5. [S5] Claude Code, "Subagents". https://code.claude.com/docs/en/sub-agents
6. [S6] Claude Code, "Configure permissions". https://code.claude.com/docs/en/permissions
7. [S7] Claude Code, "Hooks reference". https://code.claude.com/docs/en/hooks
8. [S8] Claude Code, "MCP" (plugin-provided MCP servers). https://code.claude.com/docs/en/mcp
9. [S9] Claude Code, "Create a marketplace". https://code.claude.com/docs/en/plugin-marketplaces
10. [S10] Claude Code, "Marketplace reference". https://code.claude.com/docs/en/plugins/marketplace-reference
11. [S11] Claude Code, "Settings reference" (`extraKnownMarketplaces`). https://code.claude.com/docs/en/settings-reference
12. [S12] Claude Platform, "Models overview". https://platform.claude.com/docs/en/models/overview
13. [S13] Claude Platform, "Pricing". https://platform.claude.com/docs/en/about-claude/pricing
14. [S14] Claude Platform, "What's new in Claude Opus 5.5". https://platform.claude.com/docs/en/models/opus-5-5/whats-new-opus-5-5
15. [S15] Claude Platform, "Define tools" (tool_choice support table). https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools
16. [S16] Claude Platform, "Strict tool use". https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use
17. [S17] Claude Platform, "Define success criteria and build evaluations". https://platform.claude.com/docs/en/test-and-evaluate/develop-tests
18. [S18] Grace, Hadfield, Olivares, De Jonghe, "Demystifying evals for AI agents", Anthropic Engineering, 2026-01-09. https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
19. [S19] Anthropic, "A statistical approach to model evaluations", 2024-11-19; paper: E. Miller, "Adding Error Bars to Evals", arXiv:2411.00640. https://www.anthropic.com/research/statistical-approach-to-model-evals and https://arxiv.org/abs/2411.00640
20. [S20] Claude Platform, "Choosing the right model". https://platform.claude.com/docs/en/about-claude/models/choosing-a-model
21. [S21] NIST/SEMATECH e-Handbook of Statistical Methods, §7.2.4 "Does the proportion of defectives meet requirements?" (Wilson interval). https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm
22. [S22] Brown, Cai, DasGupta, "Interval Estimation for a Binomial Proportion", Statistical Science 16(2), 2001, doi:10.1214/ss/1009213286. https://projecteuclid.org/journals/statistical-science/volume-16/issue-2/Interval-Estimation-for-a-Binomial-Proportion/10.1214/ss/1009213286.full
23. [S23] Claude Code, "Settings" (precedence). https://code.claude.com/docs/en/settings
24. [S24] Claude Code, "How Claude remembers your project" (CLAUDE.md, rules). https://code.claude.com/docs/en/memory
25. [S25] Claude Code, "Model configuration". https://code.claude.com/docs/en/model-config
26. [S26] Zheng et al., "Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena", NeurIPS 2023 Datasets and Benchmarks. https://arxiv.org/abs/2306.05685
27. [S27] Claude Agent SDK, "Agent loop". https://code.claude.com/docs/en/agent-sdk/agent-loop
28. [S28] Claude Platform, "Prompting best practices" (examples, chaining, long context). https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
29. [S29] Anthropic Engineering, "How we built our multi-agent research system". https://www.anthropic.com/engineering/multi-agent-research-system
30. [S30] Claude Agent SDK, "Sessions". https://code.claude.com/docs/en/agent-sdk/sessions
31. [S31] Model Context Protocol specification 2026-07-28, "Tools" (`isError`). https://modelcontextprotocol.io/specification/2026-07-28/server/tools
32. [S32] Anthropic Engineering, "Writing effective tools for agents". https://www.anthropic.com/engineering/writing-tools-for-agents
33. [S33] Model Context Protocol specification 2026-07-28, "Resources". https://modelcontextprotocol.io/specification/2026-07-28/server/resources
34. [S34] Claude Code, "CLI reference" (`--print`, `--output-format`, `--json-schema`). https://code.claude.com/docs/en/cli-reference
35. [S35] Claude Platform, "Structured outputs". https://platform.claude.com/docs/en/build-with-claude/structured-outputs
36. [S36] Claude Platform, "Batch processing". https://platform.claude.com/docs/en/build-with-claude/batch-processing
37. [S37] Anthropic Engineering, "Effective context engineering for AI agents". https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
38. [S38] Claude Platform, "Citations". https://platform.claude.com/docs/en/build-with-claude/citations

Exam notes ("exam says" layer; private study notes, not published):

- *Syllabus coverage*
- *The Winning Philosophy*
- *Decision rules D1*
- *Decision rules D2*
- *Decision rules D5*
- the D3 and D4 folder notes named inline
- practice mock 01
- *Claude Code for Real Engineers* course notes

Verification limits:

- Sources S27 to S30 and S32 to S38 back concept-index rows. Their URLs were confirmed to resolve.
- The specific claims quoted in the body were read from S1 to S26 and from the spot checks below:
  - `isError` in S31.
  - The 50% discount and 24 h window in S36.
  - "3–5 examples" and long-context ordering in S28.
  - fork and `stop_reason` in S30 and S27.
- The concept-index rows citing S29, S32, S35, S37 and S38 are pointers to where the concept is documented, not quotations.
