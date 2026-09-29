# Research: docs → tickets (Tool 3)

Scope: the third `ravn-agents` tool, which reads a requirements document and creates GitHub Issues
through our own MCP server. CCAF domains: D2 (tool design and MCP), D4 (prompt engineering and
structured output), D5 (reliability and human review). CONTEXT.md decisions in play: 10, 13, 14,
16, plus 5, 6 and 22 where they touch this tool.

Citation keys: `[n]` is entry n in **Sources**. `[V-x]` is a private exam note (not published) or a repository path.
Anything not checked against a fetched page is marked **UNVERIFIED**. All web sources were
accessed on 2026-09-25.

## Summary

1. **Decision 13's ground truth does not match the brief.** None of the 52 issues in `ravn-task-management-challenge` is a feature ticket for the brief. They were filed from 2026-08-05 on, after the brief's features had shipped as PRs #1 to #8. The issues are audit, refactor, CI, governance and process work. Roughly 9 of 52 touch a brief requirement at all (§ Eval methodology).
2. **Decision 14's "draft" does not exist for GitHub Issues.** Draft issues exist only inside GitHub Projects, and a draft cannot carry labels until it is converted [21]. "Draft labelled `needs-review`" cannot be done in one object.
3. **Labels can be silently dropped.** Without push access, GitHub drops labels on create without an error [19]. The `needs-review` route must read the issue back after creating it.
4. **Forced `tool_choice` is rejected on Opus 5.5** (400 error) [9]. It works on Sonnet 5, the extraction model in decision 22. Use structured outputs or strict tools so the design does not depend on the model.
5. **Schema-valid is not semantically correct.** Structured outputs guarantee shape through constrained decoding [12]. The exam says the same [V-5][V-7]. Semantic checks (source references resolve, no duplicates, no invented requirements) run in code after extraction.
6. **Self-reported confidence is overconfident** [28], and the Claude API has no logprobs [13]. Per-field confidence is usable only after calibration on labelled data [V-4 §5.5]. That data must not be the same items the eval reports on [8].
7. **The GitHub create call has no idempotency key** [19], and secondary rate limits punish bursts [17][18]. Dedupe with a marker embedded in the body, create serially at least 1 s apart, and keep a resumable manifest.
8. **Published LLM user-story work reports quality ratings, not recall against a real backlog** [35][36][38]. The eval number this tool reports has no direct external baseline.

## Concepts

### C1. MCP architecture: hosts, clients, servers, transports

**Definition.** "MCP follows a client-server architecture where an MCP host, an AI application like Claude Code, establishes connections to one or more MCP servers. The MCP host accomplishes this by creating one MCP client for each MCP server" [1]. MCP has two layers. The *data layer* is JSON-RPC 2.0 and carries discovery, the primitives and notifications. The *transport layer* is either **stdio** ("direct process communication between local processes on the same machine") or **Streamable HTTP** ("HTTP POST for client-to-server messages with optional Server-Sent Events") [1]. As of spec version 2026-07-28 the protocol is stateless. Every request carries its protocol version and capabilities in `_meta`, and `server/discover` replaces the old handshake [1].

**Exam says.** Shared team servers go in the project `.mcp.json` with credentials written as `${TOKEN}`. Tools from every configured server are available together. "Standard integrations use existing community servers; custom servers are for team-specific workflows" [V-3 §2.4].

**Sources say.** A local stdio server "typically serve[s] a single MCP client" [1]. MCP "has no protocol-level session", so any state between calls must be an explicit handle passed as an argument [3, Stateful Tools].

**Implication.** The plugin ships a local **stdio** server (decision 4), and Claude Code is the host. The server keeps no session state. Anything that must survive between calls, such as the batch manifest or the dedupe key, is either a file or an explicit argument. GitHub ships an official MCP server with `issue_write`, `list_issues` and `search_issues`, and a `--toolsets` flag to restrict what it exposes [22]. Because the exam prefers existing servers for standard integrations [V-3 §2.4], decision 10 needs a stated reason for building our own. The official server does not provide the three things this tool needs: idempotent creation, the review-routing rule enforced in code, and our error taxonomy. That is a team-specific workflow, which the exam's rule allows.

### C2. Tools vs resources vs prompts

**Definition.** Per [2], tools are "functions that your LLM can actively call" and are *model*-controlled. Resources are "passive data sources that provide read-only access" and are *application*-controlled. Prompts are "pre-built instruction templates" and are *user*-controlled.

**Exam says.** "Content catalogs, meaning issue summaries, documentation trees, database schemas, are MCP resources, so the agent sees what exists without exploratory calls." A catalog exposed as a `list_documents` tool is a losing answer [V-3 §2.4]. Test question: "when is something a resource and not a tool?" [V-2].

**Sources say.** A tool "performs a single operation with clearly defined inputs and outputs. Tools may require user consent prior to execution" [2]. The spec says "there SHOULD always be a human in the loop with the ability to deny tool invocations" [3].

**Implication.**
- **Tool:** issue creation, because it is an action with side effects.
- **Resource:** the catalog of issues this tool has already created in a repo, for example `ravn-tickets://{owner}/{repo}/created`. The agent sees what exists before it plans.
- **Prompt:** the user-invoked entry point, for example `/docs-to-tickets <path> <repo>`. In a Claude Code plugin this may be a skill instead (decision 4).

The brief itself is a local file that Claude Code can already `Read`. Wrapping it in a resource adds nothing.

### C3. The official TypeScript SDK

**Sources say.** The v2 SDK is split into `@modelcontextprotocol/server` and `@modelcontextprotocol/client`. It implements spec 2026-07-28, and tools are registered with `registerTool(name, {description, inputSchema}, handler)` [4]. Schemas use "Standard Schema — bring Zod v4, Valibot, ArkType" [4]. npm reports `@modelcontextprotocol/server` 2.1.0, modified 2026-09-23. The v1 package `@modelcontextprotocol/sdk` is at 1.30.1 [7]. On errors, the SDK docs say: "A tool error is a successful JSON-RPC result with `isError: true` that the model reads and recovers from. A protocol error is a JSON-RPC error response the model never sees". Also: "the SDK catches anything a tool handler throws and converts it to the same `isError: true` shape", and "Put the recovery hint in `text` — it is the only thing the model has to work with" [5]. When arguments fail the schema, the result is also an `isError` result, so "the model reads the message and retries with arguments that fit the schema" [6].

**Implication (decision 16).** Use `@modelcontextprotocol/server` v2 with Zod v4. Any structured error metadata, such as a category or a retryable flag, must also be serialised into the `text` block. Putting it only in `structuredContent` is not enough, because the model reads the text [5]. Whether the spec requires `structuredContent` to match `outputSchema` on an `isError` result is **UNVERIFIED**. Keep error results text-first.

### C4. Tool definition design: names, descriptions, schemas, count

**Exam says.** "The description is the primary selection mechanism. It states inputs, outputs, example queries, edge cases and when to use this tool rather than its neighbour." A generic tool driven by a free-text instruction is split into purpose-specific tools. Each agent gets "the four or five tools its role needs, not eighteen" [V-3 §2.1, §2.3].

**Sources say.**
- "Provide extremely detailed descriptions. This is by far the most important factor in tool performance… Aim for at least 3–4 sentences" [9].
- "Consolidate related operations into fewer tools… group them into a single tool with an `action` parameter" [9].
- Use namespaced names such as `github_list_prs` [9].
- "More tools don't always lead to better outcomes" and "A common error we've observed is tools that merely wrap existing software functionality or API endpoints" [8]. Parameters should be unambiguous, for example `user_id` rather than `user` [8].
- Spec name rules: 1 to 128 characters from `[A-Za-z0-9_.-]`, unique within a server [3]. The Claude API regex is `^[a-zA-Z0-9_-]{1,128}$`, which has no dot [9], so dots should be avoided.

**Tension, and how to resolve it.** The exam says *split*: its example is an `analyze_document` tool whose free-text instruction returns unpredictable output [V-7]. The API docs say *consolidate* related operations behind an `action` enum [9]. These do not conflict. Split when the output contract differs. Consolidate when the operations share one contract.

**Implication.** Two tools, both namespaced:
1. `github_issue_create`. Creates one issue idempotently. Required inputs: `repo`, `title`, `body`, `source_refs[]` (brief requirement IDs), `idempotency_key`, `field_confidence{}`. The server decides `needs-review` in code and does not take the decision from the model.
2. `github_issue_list_created`. Returns the issues this tool created for a repo, keyed by `idempotency_key`. It is also exposed as a resource (C2) for clients that read resources.

Labels are handled inside `github_issue_create`, which ensures `needs-review` exists. Exposing a generic `github_request` tool is the endpoint-wrapping anti-pattern described in [8].

### C5. Structured tool errors

**Exam says.** A failing tool returns `isError` with `errorCategory` (transient, validation, business or permission), an `isRetryable` boolean and a human-readable description. Transient failures are recovered locally. "An access failure and a valid empty result are different things." Losing answers include "Operation failed" for everything and few-shot examples used to parse error text [V-3 §2.2]. The mock item on `process_refund` has the correct answer "structured error responses with retryable: false for business errors" [V-7]. A companion mock item teaches: explain, acknowledge the failure, and offer escalation, rather than retrying until success [V-7].

**Sources say.** The spec separates protocol errors (unknown tool, malformed request) from tool execution errors, which "contain actionable feedback that language models can use to self-correct and retry", for example API failures, input validation and business logic [3]. From the API docs: "Write instructive error messages. Instead of generic errors like "failed", include what went wrong and what Claude should try next (for example, "Rate limit exceeded. Retry after 60 seconds.")" and "Claude will retry 2-3 times with corrections before apologizing" [10]. From Anthropic's engineering blog: prompt-engineer error responses "to clearly communicate specific and actionable improvements, rather than opaque error codes or tracebacks" [8].

**Implication.** One error shape everywhere, rendered as JSON inside `text` with `isError: true`:
`{category, retryable, retry_after_s?, what_failed, what_was_done, next_step}`. The GitHub mapping is in § Failure modes. The four-value category field is the exam's taxonomy, not part of the MCP spec. The spec only defines `isError` [3].

### C6. Structured output: forced `tool_choice`, strict tools, JSON outputs

**Exam says.** Extraction uses `tool_use` with a forced `tool_choice`, then validates semantics [V-5]. Test: "which `tool_choice` guarantees a call?" [V-2]. `auto` may answer in text, `any` must call some tool, and a forced choice names the tool. Force it on the first turn only [V-3 §2.3].

**Sources say.**
- `tool_choice` has four values: `auto`, `any`, `tool` and `none` [9].
- **On Claude Opus 5.5, Fable 5.1 and Mythos 5.1, `any` and `tool` "return a 400 error"**. The documented alternative is "`auto` with strict tool use… or structured outputs" [9]. Manual extended thinking also rejects `any` and `tool` [9].
- With a forced choice the API prefills the assistant turn, so "the models will not emit a natural language response or explanation before `tool_use`" [9].
- `strict: true` guarantees that "Tool `input` strictly follows the `input_schema`" and that the tool name is valid, using grammar-constrained sampling [11].
- Structured outputs (`output_config.format`) promise "Always valid", "Type safe" and "No retries needed for schema violations" [12].
- The supported schema subset excludes `minimum`/`maximum`, `minLength`/`maxLength`, `pattern`, `oneOf` and recursive schemas, and array `minItems` supports only 0 and 1 [12].

**Implication (decision 22).** Extraction runs on Sonnet 5, which is not on the list of models that reject forced tool use [9], so the exam pattern works there. It breaks if extraction is ever moved to the Opus 5.5 coordinator. Use **structured outputs with a JSON schema** for the extraction call, which works on both models, or strict tools with `auto`.

Because the schema subset has no `minimum`/`maximum` or `pattern`, the schema cannot enforce a confidence in [0,1] or a requirement-ID format. Either use an `enum` for confidence (for example `low | medium | high`) or check it in code. Use nullable fields plus an `"other"` value with a detail string for any enum that can meet something unexpected [V-2][V-5].

### C7. Schema-valid is not semantically correct; validation-retry loops

**Exam says.** "Structural compliance is NOT semantic correctness"; "tool_use guarantees structure, never semantics" [V-5]. The mock item on "12% of extractions contain semantic errors that pass JSON schema validation" with reviewers able to cover only 20% has the correct answer: field-level confidence scores with thresholds calibrated on a labelled validation set [V-7]. Semantic validation catches what schema validation does not, and triggers a validation-retry loop [V-2].

**Sources say.** The structured-outputs page states its guarantees ("Always valid", "Type safe") and has **no** sentence saying the content itself is accurate. That was checked explicitly [12]. From *Building effective agents*: "You can add programmatic checks ('gate')… on any intermediate steps" [16].

**Implication.** Semantic checks run in code after extraction and before any MCP call:
- every `source_refs` ID exists in the parsed brief;
- every brief requirement is covered by at least one ticket, or is explicitly marked out-of-scope;
- there are no two tickets with the same `idempotency_key` or near-identical titles;
- acceptance criteria quote or paraphrase text that appears under the cited requirement;
- labels come from the repo's actual label set.

A failure is fed back once, with the specific violations, as a retry turn. It is not retried blindly. If the second attempt still fails, the ticket is routed to review and not dropped.

### C8. Few-shot examples for extraction

**Exam says.** Use 2 to 4 examples with at least one edge case, and "more than 6 is always wrong" [V-6]. For the mock item on inconsistent `skills[]` granularity, the correct answer is few-shot examples that show the granularity. Numeric caps are the wrong answer [V-7].

**Sources say.** "Include 3–5 examples for best results", and make them relevant, diverse and wrapped in `<example>` tags [14]. Put long documents "near the top of your prompt, above your query, instructions, and examples" [14].

**Implication.** The exam's 2 to 4 and the docs' 3 to 5 overlap at 3 to 4. Use 3 examples that each demonstrate a granularity decision:
- one checkbox becomes one ticket;
- several checkboxes merge into one ticket (for example Header's three icons);
- one checkbox splits into several tickets, or a requirement is optional and is skipped.

Examples must **not** come from the eval brief, or the eval leaks.

### C9. Field-level confidence and calibration

**Exam says.** "The model outputs field-level confidence, thresholds are calibrated against a labeled validation set, and low-confidence, ambiguous or contradictory documents go to the reviewers first." Losing answers are "Raising the threshold until sampled errors hit zero", "One document-level score" and uncalibrated proxies [V-4 §5.5]. The key distinction is the word **calibrated**: "Uncalibrated self-reported confidence is the wrong proxy for escalation in 5.2. Field-level confidence calibrated on labelled data is the right router for review in 5.5" [V-4].

**Sources say.**
- Verbalised confidence: "LLMs, when verbalizing their confidence, tend to be overconfident" [28]. Consistency across multiple sampled responses helps mitigate this [28].
- For RLHF models, including Claude, "verbalized confidences emitted as output tokens are typically better-calibrated than the model's conditional probabilities", "reducing the expected calibration error by a relative 50%" [27].
- Base models "are well-calibrated on diverse multiple choice and true/false questions when they are provided in the right format", but "struggle with calibration of P(IK) on new tasks" [26].
- Modern networks are "poorly calibrated", and temperature scaling is "surprisingly effective" when logits are available [29].
- The Claude Messages API has no `logprobs` parameter. This was checked against the request-body parameter list [13]. Logit-based calibration such as temperature scaling therefore does not apply here.

**Implication (decision 14).**
- Collect per-field confidence as a verbalised enum.
- Optionally add agreement across k samples as a second signal [28].
- Treat both as raw scores until they are mapped to observed accuracy on labelled items.
- Calibrate per field, because title, labels and acceptance criteria fail differently [V-4 §5.5].

### C10. Selective prediction and abstention

**Sources say.** Selective classification lets "a desired risk threshold" be set, and the classifier "selectively rejects test instances as necessary" to meet it. Example: 2% top-5 error with 99.9% probability at "almost 60% test coverage" [30]. Conformal methods give "explicit, non-asymptotic guarantees even without distributional assumptions" using a held-out calibration set [31].

**Implication.** Frame the threshold as a risk-coverage choice. Pick the lowest threshold whose auto-created tickets meet a target precision on the calibration split, and report the coverage it leaves, meaning the fraction that did not need review. With about 40 to 60 requirement units from one brief, any guarantee is loose. Report the threshold with its confidence interval and do not present it as a fixed constant.

### C11. Human-in-the-loop design

**Sources say.** MCP says hosts SHOULD "present confirmation prompts to the user for operations" [3]. Anthropic writes that "agents can then pause for human feedback at checkpoints or when encountering blockers" [16]. The vendor tools in this space all require a review step before creation: GitHub Copilot ("Review the draft. Edit any field" before *Create*) [23], Atlassian Rovo ("Select Create all" after preview) [24], and Linear Triage Intelligence, which is suggestion-first and auto-applies only by opt-in: "If you trust certain types of suggestions, you'll be able to opt in" [25].

**Implication.** Two review layers:
- a batch preview, where the whole plan is shown and confirmed once, as the industry tools do;
- per-issue routing, where low-confidence tickets get `needs-review`.

The batch preview is the one checkpoint the vendors agree on. The per-issue label is what decision 14 adds.

## State of the art: requirements → issues / user stories

**Quality frameworks.**
- *INVEST*: Independent, Negotiable, Valuable, Estimatable, Scalable, Testable. It is qualitative, and the AQUSA authors call it one of the "highly qualitative metrics" [34].
- *QUS*: 13 criteria in three groups [34]:
  - syntactic: well-formed, atomic, minimal;
  - semantic: conceptually sound, problem-oriented, unambiguous, conflict-free;
  - pragmatic: full sentence, estimatable, unique, uniform, independent, complete.
- *AQUSA* is the NLP tool built on QUS. Across 1,023 stories from 18 companies, it reached micro-averaged recall 93.8% and precision 72.2% (macro 92.1% and 77.4%) for defect detection [34].
- AQUSA's authors also state the *Berry Recall Condition*: an NLP tool for requirements engineering is only useful near 100% recall, because otherwise "the analyst still has to repeat the entire task manually" [34]. This applies directly here. A ticket generator that misses requirements forces a full manual re-read, so **requirement coverage recall** is the headline number.

**LLM generation studies.**
- *GeneUS* (GPT-4, 2024): 7 requirements documents, rated by 50 developers on a 1 to 5 RUST survey. The median was 4 overall, with lower scores for "semantic accuracy, sufficiency of specific information, essential details, and test case specifications" [35]. It reports survey ratings. It does not measure recall against a reference backlog.
- *UStAI* (2025): 1,260 stories generated by three LLMs from 42 abstracts. Findings: "none of the user story sets were complete"; "one-third of user stories were not estimable"; independence was violated by "more than half" [36]. Table 5 reports unambiguous at 61 to 64% and independent at 34 to 46% across models [36].
- *ChatGPT as a user-story quality evaluator* (2023): "ChatGPT's evaluation aligns well with human evaluation", with a "best of three" strategy for consistency. The abstract gives no agreement number [37].
- *Systematic review* of 74 studies from 2023 to 2024: LLM4RE tools "are usually evaluated in controlled environments, with limited use in industry settings", and mostly use GPT models with zero- or few-shot prompting [38].

**Vendor features.** GitHub Copilot drafts title, body and metadata, one issue per task in a prompt or a parent/sub-issue tree, and is "in public preview" [23]. Atlassian Rovo generates a list of work items from a Confluence page, with preview before "Create all" [24]. Linear Triage Intelligence suggests properties, duplicates and relations, with reasoning shown and auto-apply by opt-in [25]. **None of the three vendor pages publishes an accuracy number** [23][24][25].

**What this means for us.** No study cited here scores generated tickets against a real backlog with precision and recall. The published numbers are survey ratings [35], QUS defect rates [36] and defect-detection precision/recall [34]. The tool's eval number has no external baseline, so it should be reported with its own method attached. UStAI's completeness finding [36] and the Berry condition [34] together say that coverage is where LLM generation fails and where it matters most.

## Eval methodology (decision 13)

### Finding: the brief and the 52 issues do not describe the same work

Read with `gh issue list/view` and `gh pr list/view` on 2026-09-25 [40]:

- **The brief** [V-8] has 39 checkboxes across the six Project Requirements sections: Initial setup 6, Header 3, Sidebar 3, Main content 3, Task card 6, Create 3, Get 4, Update 5, Delete 3, Search/filter 2, User info 1. It also has 5 bonus items and 14 General Requirements bullets (README 6, Code 2, Design 4, Submission 2).
- **The brief's features were built by PRs, not issues.** PRs #1 to #8 were opened on 2026-08-02, and each body says which brief section it covers. For example, #2: "Covers section 2 of the brief"; #5: "Covers section 4 of the brief"; #6: "Covers section 5 of the brief". Issue and PR numbers share one sequence, and #1 to #25 are all PRs.
- **The 52 issues (#26 to #157)** were created from 2026-08-05T23:29Z to 2026-08-11T06:05Z, after the feature PRs. Their titles and labels (`governance`, `migration`, `process`, `lane:app-config`, `lane:app-code`, `documentation`, `bug`) show audit follow-ups: CI gates (#27, #58), ui-kit migration (#29 to #32), supply chain (#42), agent-workflow hooks and scripts (#45, #52 to #54, #68, #70, #84), provenance docs (#51, #87, #90, #96, #98), stale docs (#28, #131, #135, #137), and bugs (#144, #145, #152).
- **Only about 9 of 52 touch a brief requirement**, and none of them is "build requirement X":

  | Issue | Brief item it touches |
  |---|---|
  | #26 | Task card avatar |
  | #33 | README requirements |
  | #34 | §5 filter-layer defects |
  | #57 | §4 update-failure toast, §2 placeholder pages, bonus 4 green tier |
  | #132 | README screenshots |
  | #144 | List-view layout (bonus 3) |
  | #145 | Board columns layout (§2 / Design) |
  | #152 | List-view status colour |
  | #155 | Sidebar "My task" (§2 / §6) |

  This classification is based on titles and a sample of bodies (#26, #33, #34, #57, #155) and is not a formal labelling.
- **Granularity also differs.** The issues are long cold-start briefings for coding agents. #33 and #57 each open with "You are starting cold… This issue is your entire briefing". #57 bundles four unrelated items. The brief's own unit is the checkbox.

**Conclusion.** Scoring the tool against the 52 issues would mostly measure its failure to predict a later audit. It would say very little about extraction quality. Expected recall is near zero by construction, and "precision" would count correct brief tickets as false positives. **This contradicts decision 13 as written.**

### Recommended ground truth

1. **Unit of truth = the requirement.** Assign stable IDs to the 39 checkboxes, plus optionally the 5 bonus items and 14 general bullets, for 58 units. This is deterministic, cheap to build, and lives next to the eval (decision 20's shared report).
2. **Reference grouping = PRs #1 to #8.** Each PR states which brief section it covers, which gives an independent, human-made grouping of requirements into work items. It is used for the granularity metrics.
3. **Optional secondary set: the ~9 brief-touching issues.** Report separately how many of them the generated tickets anticipate, for example the update-failure notification in #57, which the brief states explicitly. Label this a stretch metric, not the headline.

This keeps decision 5 (internal material only) and the spirit of decision 13 (real input, real outcomes). It replaces "issues actually filed" with "requirements actually stated plus PRs actually merged".

### Matching extracted tickets to ground truth

- **Alignment is many-to-many.** One ticket can cover several requirements (Header's three icons), and one requirement can be split across tickets. Forcing 1:1 matching penalises reasonable granularity choices.
- **Use provenance to make matching deterministic.** Every generated ticket must carry `source_refs` (requirement IDs), which C7 validates. Coverage is then plain set arithmetic, with no judge involved. This is the exam's "code > prompts" [V-1] and matches the provenance rule in [V-4 §5.6].
- **Where a 1:1 view is needed** (ticket-to-PR grouping), use a bipartite assignment on a similarity matrix. `scipy.optimize.linear_sum_assignment` solves "minimum weight matching in bipartite graphs" and supports rectangular matrices where "not every row needs to be assigned" [39]. Add a similarity floor so weak pairs stay unmatched.

**Metrics** (proposal; the split/merge definitions are our own and not taken from a cited standard):

| Metric | Definition | Why |
|---|---|---|
| Requirement coverage recall (headline) | covered requirement IDs / all in-scope IDs | Berry condition [34]; UStAI incompleteness [36] |
| Ticket precision | tickets whose `source_refs` are valid **and** judged faithful / all tickets | catches invented scope |
| Split / merge counts | requirements spread over >1 ticket; tickets spanning >1 PR group | makes granularity visible instead of penalising it |
| Field accuracy, per field | labels, type, dependency, acceptance-criteria faithfulness, scored separately | aggregate accuracy hides a bad field [V-4 §5.5] |
| Review rate / coverage | share routed to `needs-review` at the calibrated threshold | the cost side of decision 14 [30] |

### LLM-as-judge: only where code cannot decide

Use it only for faithfulness, meaning whether a ticket's body and acceptance criteria are supported by the cited requirement text. Known biases:
- position, verbosity and self-enhancement bias, alongside ">80% agreement" with humans [32];
- self-preference, where an evaluator scores its own outputs higher, correlated with self-recognition [33].

Mitigations:
- score each ticket against its cited requirement, one at a time and not pairwise, which avoids position bias;
- use a fixed rubric with yes/no criteria [15];
- hand-label a small subset and report judge-human agreement before trusting the judge's number;
- note that judge and generator are the same model family (decision 22), which is the setting where [33] finds bias.

Anthropic's eval guidance favours "more questions with slightly lower signal automated grading" and deliberately ambiguous edge cases [15].

### Calibration vs test split

Anthropic "relied on held-out test sets to ensure we did not overfit" [8]. Decision 14 calibrates the threshold "on the eval", and decision 13 reports the eval number on that same set. Using one set for both makes the reported number optimistic.

Options with only one brief:
- (a) calibrate on sections 1 to 3 and test on sections 4 to 6 plus bonus;
- (b) leave-one-section-out cross-validation;
- (c) write a second small internal requirements doc for calibration. Decision 5 allows only RAVN-internal material, and `ravn-ui-kit` has no brief (**UNVERIFIED** whether one exists).

## Failure modes

The exam's rules frame this whole section. Structured errors, local recovery of transient failures, propagation of partial results plus what was attempted, and no retrying of business errors [V-3 §2.2][V-4 §5.3]. Explain and offer escalation instead of looping [V-7]. The three-attempt mock item says to escalate with full history instead of trying a fourth time [V-7].

| Failure | Evidence | Category → behaviour |
|---|---|---|
| Primary rate limit exhausted | 5,000 req/h authenticated; `403`/`429` with `x-ratelimit-remaining: 0`; do not retry before `x-ratelimit-reset` [17] | transient, retryable with `retry_after_s`; if the wait is over a few minutes, stop the batch and escalate with the manifest |
| Secondary rate limit | ≤80 content-generating requests/min and ≤500/h; POST costs 5 points; honour `retry-after`, else wait ≥1 min, then back off exponentially and "throw an error after a specific number of retries" [17][18]. Create issue "triggers notifications… may result in secondary rate limiting" [19] | transient; **prevent** it by creating serially with ≥1 s between mutative requests [18] |
| Repeated violation | "may result in the banning of your integration" [17][18] | hard cap on retries; never retry in a tight loop |
| `422` validation failed | listed status for create [19] | validation, not retryable as-is; the text names the field so the model can fix it and retry once |
| `403` / `404` without rate-limit headers | listed statuses [19] | permission, not retryable; escalate. Whether GitHub uses 404 to hide private repos is **UNVERIFIED** here |
| `410 Gone` | listed status [19]; meaning (issues disabled on the repo) **UNVERIFIED** | business, not retryable; explain |
| `503` / network | listed status [19] | transient; retry locally with backoff |
| Labels silently dropped | "Only users with push access can set labels… Labels are silently dropped otherwise" [19] | read back after create; if `needs-review` is missing, return `isError` with category permission and "issue #N created **without** its review label". Never report success |
| Duplicate on re-run or retry | the create endpoint lists no idempotency parameter [19]; a timed-out POST may still have succeeded (**UNVERIFIED** for GitHub specifically; true of HTTP POST in general) | embed `<!-- ravn-agents:key=<hash> -->` in the body; before each create, list issues this tool created (by label) and skip existing keys, returning `created: false, existing: #N` |
| Dedup via search is unreliable | search allows 30 req/min, and on timeout returns partial matches with `incomplete_results: true` [20]; index freshness not documented [20] | dedupe with list issues filtered by label, not with the search API |
| Partial failure mid-batch | exam: propagate partial results and what was attempted; do not end the whole run on one failure [V-4 §5.3]; crash recovery via a manifest [V-4 §5.4] | write a manifest before the first create (planned tickets with keys); update it after each call; on resume, reconcile against GitHub by key; the final report lists created, skipped (duplicate), failed (category) and not attempted |
| Draft requested | GitHub Issues have no draft state; project drafts cannot hold labels [21] | see Design rule 9 |
| Extraction refuses or truncates | structured outputs list refusals and `max_tokens` truncation as failure cases (from the fetched summary of [12]; the exact wording on the page was not confirmed, **UNVERIFIED**) | check `stop_reason`; treat truncation as a transient that is retried with a larger budget or chunked sections |

## Design rules for ravn-agents

1. **Build our own stdio MCP server on `@modelcontextprotocol/server` v2 + Zod v4, and state why it is not the GitHub MCP server.** The reason is idempotent create, routing enforced in code, and our error taxonomy. [1][4][7][22][V-3 §2.4]. Decisions 4, 10, 16. *Tension:* the exam prefers existing servers for standard integrations [V-3 §2.4]. Decision 10 holds only with this justification written down.
2. **Expose two tools, `github_issue_create` and `github_issue_list_created`, and expose the created-issue catalog as a resource.** No generic GitHub passthrough. [2][8][9][V-3 §2.1, §2.3, §2.4]. Decision 10.
3. **Each tool description is at least 3–4 sentences.** It covers what the tool does, when to use it and not use it, what each parameter means (`idempotency_key`, `source_refs`), and what it returns on duplicate. Parameter names are unambiguous. [8][9][V-3 §2.1]. Decision 10.
4. **Every failure returns `isError: true` with a JSON error `{category, retryable, retry_after_s?, what_failed, what_was_done, next_step}` in the `text` block.** Categories: transient, validation, business, permission. [3][5][10][V-3 §2.2][V-7]. Decision 10.
5. **Extraction uses structured outputs (JSON schema) or a strict tool, not a model-specific forced `tool_choice`.** Forced tool use returns 400 on Opus 5.5 [9]. Keep confidence as an enum, because numeric bounds are unsupported [12]. [9][11][12][V-5]. Decisions 16, 22. *Tension:* the exam's canonical answer is forced `tool_choice` [V-2][V-5]. That is still correct on Sonnet 5 but is not portable.
6. **Semantic validation in code gates every ticket before any MCP call, with at most one targeted retry.** It checks that `source_refs` resolve, that coverage is complete or exclusions explicit, that there are no duplicate keys, and that labels exist in the repo. [12][16][V-2][V-5][V-7]. Decision 14.
7. **Use three few-shot examples that each show a granularity decision (1:1, merge, split/skip), taken from a document other than the eval brief.** [14][V-6][V-7]. Decision 13.
8. **Confidence is per field and verbalised, optionally combined with k-sample agreement, and treated as uncalibrated until mapped on labelled data.** The threshold is set for a target precision, reported with coverage, and fixed on a split the headline number is not computed on. [8][26][27][28][30][31][V-4 §5.5]. Decision 14. *Contradiction:* decision 14 says "calibrated on the eval", but calibrating and reporting on one set overfits [8]. Split the set, or change the decision's wording.
9. **Replace "draft" with an open issue labelled `needs-review`, preceded by a whole-batch preview the user confirms once.** Then read the issue back to confirm the label stuck. [3][19][21][23][24][25]. Decision 14. *Contradiction:* GitHub Issues have no draft state, and Projects draft issues cannot carry labels until converted [21]. Decision 14's "draft labelled `needs-review`" is not implementable as one object and needs rewording.
10. **The eval's unit is the brief requirement (39 checkboxes, optionally 58 with bonus and general bullets). The headline number is requirement coverage recall, with ticket precision, split/merge counts and per-field accuracy beside it. PRs #1 to #8 are the reference grouping.** [34][36][39][40][V-8]. Decision 13. *Contradiction:* decision 13 names the 52 issues as ground truth, but they are post-implementation audit and process tickets, not the brief's work (§ Eval methodology). Amend decision 13.
11. **An LLM judge scores faithfulness only, one ticket against its cited requirement at a time, with a yes/no rubric, and its agreement with a hand-labelled subset is reported.** [15][32][33]. Decision 13.
12. **Create issues serially, at least 1 s apart. Honour `retry-after` and `x-ratelimit-reset`. Back off exponentially with a hard retry cap, then escalate.** [17][18][19][V-4 §5.3]. Decision 6.
13. **Make creation idempotent with a body marker keyed on a hash of `source_refs` and title, deduplicated by listing labelled issues, never through search.** [19][20]. Decision 6.
14. **Keep a batch manifest: write it before the first create, update it after each call, and reconcile it on resume. The final report always lists created, skipped, failed (with category) and not attempted.** [V-4 §5.3, §5.4][V-7]. Decisions 6, 20.

### Contradictions with CONTEXT.md

- **Decision 13:** the named ground truth (52 issues) does not correspond to the brief. See rule 10.
- **Decision 14:** "draft" is not a GitHub Issue state [21] (rule 9). "Calibrated on the eval" conflicts with held-out evaluation [8] (rule 8).
- **Decision 10:** this is not a contradiction, but it is in tension with the exam's "use existing community servers" [V-3 §2.4]. It needs the written justification in rule 1.
- **Decision 22:** consistent, since Sonnet 5 supports forced tool use. It would break the exam's forced-`tool_choice` pattern if extraction moved to Opus 5.5 [9] (rule 5).

## Sources

Web sources, all accessed 2026-09-25:

1. MCP, "Architecture overview". https://modelcontextprotocol.io/docs/learn/architecture
2. MCP, "Understanding MCP servers". https://modelcontextprotocol.io/docs/learn/server-concepts
3. MCP Specification 2026-07-28, "Tools". https://modelcontextprotocol.io/specification/latest/server/tools
4. MCP TypeScript SDK, repository README. https://github.com/modelcontextprotocol/typescript-sdk
5. MCP TypeScript SDK, "Errors". https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/servers/errors.md
6. MCP TypeScript SDK, "Tools". https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/servers/tools.md
7. npm, `@modelcontextprotocol/server` (2.1.0) and `@modelcontextprotocol/sdk` (1.30.1), via `npm view`. https://www.npmjs.com/package/@modelcontextprotocol/server
8. Anthropic Engineering, "Writing effective tools for AI agents" (K. Aizawa et al., 2025-09-11). https://www.anthropic.com/engineering/writing-tools-for-agents
9. Claude Docs, "Define tools" (tool definitions, best practices, `tool_choice`, forced-tool-use restrictions). https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools
10. Claude Docs, "Handle tool calls" (`is_error`). https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls
11. Claude Docs, "Strict tool use". https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use
12. Claude Docs, "Structured outputs". https://platform.claude.com/docs/en/build-with-claude/structured-outputs
13. Claude API Reference, "Create a Message" (request parameters). https://platform.claude.com/docs/en/api/messages/create
14. Claude Docs, "Prompting best practices" (use examples effectively). https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
15. Claude Docs, "Create strong empirical evaluations". https://platform.claude.com/docs/en/test-and-evaluate/develop-tests
16. Anthropic Engineering, "Building effective agents" (2024-12-19). https://www.anthropic.com/engineering/building-effective-agents
17. GitHub Docs, "Rate limits for the REST API". https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api
18. GitHub Docs, "Best practices for using the REST API". https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api
19. GitHub Docs, "REST API endpoints for issues: Create an issue". https://docs.github.com/en/rest/issues/issues#create-an-issue
20. GitHub Docs, "REST API endpoints for search". https://docs.github.com/en/rest/search/search
21. GitHub Docs, "Adding items to your project" (draft issues). https://docs.github.com/en/issues/planning-and-tracking-with-projects/managing-items-in-your-project/adding-items-to-your-project
22. GitHub, official MCP server. https://github.com/github/github-mcp-server
23. GitHub Docs, "Using GitHub Copilot to create or update issues". https://docs.github.com/en/copilot/how-tos/copilot-on-github/copilot-for-github-tasks/use-copilot-to-create-or-update-issues
24. Atlassian Support, "Create work items with Rovo". https://support.atlassian.com/jira-software-cloud/docs/create-work-items-with-rovo/
25. Linear, "How we built Triage Intelligence" (2025-09-03). https://linear.app/now/how-we-built-triage-intelligence
26. Kadavath et al., "Language Models (Mostly) Know What They Know", 2022. https://arxiv.org/abs/2207.05221
27. Tian et al., "Just Ask for Calibration", EMNLP 2023. https://arxiv.org/abs/2305.14975
28. Xiong et al., "Can LLMs Express Their Uncertainty?", ICLR 2024. https://arxiv.org/abs/2306.13063
29. Guo et al., "On Calibration of Modern Neural Networks", ICML 2017. https://arxiv.org/abs/1706.04599
30. Geifman and El-Yaniv, "Selective Classification for Deep Neural Networks", 2017. https://arxiv.org/abs/1705.08500
31. Angelopoulos and Bates, "A Gentle Introduction to Conformal Prediction and Distribution-Free Uncertainty Quantification". https://arxiv.org/abs/2107.07511
32. Zheng et al., "Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena", NeurIPS 2023 D&B. https://arxiv.org/abs/2306.05685
33. Panickssery, Bowman and Feng, "LLM Evaluators Recognize and Favor Their Own Generations", 2024. https://arxiv.org/abs/2404.13076
34. Lucassen, Dalpiaz, van der Werf and Brinkkemper, "Improving agile requirements: the Quality User Story framework and tool", Requirements Engineering 21(3), 2016. https://doi.org/10.1007/s00766-016-0250-x (full text read from https://webspace.science.uu.nl/~dalpi001/papers/luca-dalp-werf-brin-16-rej.pdf)
35. Rahman and Zhu, "Automated User Story Generation with Test Case Specification Using Large Language Model" (GeneUS), 2024. https://arxiv.org/abs/2404.01558
36. Yamani, Baslyman and Ahmed, "Leveraging LLMs for User Stories in AI Systems: UStAI Dataset", 2025. https://arxiv.org/html/2504.00513
37. Ronanki, Cabrero-Daniel and Berger, "ChatGPT as a tool for User Story Quality Evaluation: Trustworthy Out of the Box?", 2023. https://arxiv.org/abs/2306.12132
38. Zadenoori et al., "Large Language Models (LLMs) for Requirements Engineering (RE): A Systematic Literature Review", 2025. https://arxiv.org/abs/2509.11446
39. SciPy, `scipy.optimize.linear_sum_assignment`. https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.linear_sum_assignment.html
40. GitHub repository `f3r21/ravn-task-management-challenge`, issues #26 to #157 and PRs #1 to #25, read with `gh issue list/view` and `gh pr list/view`. https://github.com/f3r21/ravn-task-management-challenge

Exam notes and local files (the exam's view; the notes are private study notes, not published; the mock is from CyberSkill, an independent practice site not affiliated with Anthropic):

- [V-1] *The Winning Philosophy*
- [V-2] *Syllabus coverage*
- [V-3] *Decision rules D2*
- [V-4] *Decision rules D5*
- [V-5] *Structured Output via tool_use*
- [V-6] *Exam Cheat Sheet*
- [V-7] practice mock 01
- [V-8] `packages/docs-to-tickets/evals/brief/` (Summary, General Requirements, Project Requirements 1 to 6, Bonus points)
