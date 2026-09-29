# Research: codebase onboarding via a persistent codebase map (Tool 2)

Scope: Tool 2 of `ravn-agents` (CONTEXT.md decisions 9, 12, 18). CCAF domains D5 (context
management and reliability), D3 (Claude Code configuration), D1 (subagents for exploration).
All web sources accessed 2026-09-25. "Exam says" citations are private CCAF study notes, cited by
title and not published. Anything not confirmed against a fetched page is marked UNVERIFIED.

## Summary

1. Model accuracy falls as context grows and as relevant facts sit mid-context [1][2][3]; Claude Code's own docs call the context window "the most important resource to manage" [5].
2. Claude Code is deliberately index-free: it pre-loads only CLAUDE.md and finds code just-in-time with glob/grep, and its team dropped RAG over staleness, security and quality [1][14][15][16].
3. Anthropic's large-codebase guidance does endorse a lightweight markdown "table of contents" map at the repo root [14]; the exam endorses scratchpad files of key findings and summary-plus-subagent over `/clear` [V1][V4].
4. So the map should be a **router**, not an oracle: a short index loaded on demand (skill), per-area pages read only when needed, and file:line pointers that the answering agent verifies against live code.
5. Freshness: stamp the build SHA per area, detect drift with `git diff --name-only <sha> HEAD`, surface it through a `SessionStart` hook whose stdout enters Claude's context [11][12][39].
6. Build and refresh work runs in subagents (separate context windows, summaries back) [8]; the refresh is incremental, like Aider's mtime cache, Cursor's Merkle tree and Meta Glean [20][24][29].
7. Eval (decision 18): 15 questions with short, code-checkable answers plus file:line evidence; grade deterministically first, LLM judge only for free text, calibrated by a human pass [35][34].
8. Main failure mode is a stale map producing confident wrong answers; the exam's answer is structured provenance and coverage annotations, never silently empty or silently stale [V1 5.3, 5.6].
9. Contradictions found: decision 9's "instead of re-reading the repo" is too strong against [14][16]; the exam notes' "most specific CLAUDE.md wins" rule contradicts the docs [4]. Details in Design rules.

## Concepts

### C1. Context window, context rot and position effects

**Definition.** The context window is everything the model sees on a turn. "Context rot": "as the
number of tokens in the context window increases, the model's ability to accurately recall
information from that context decreases" [1]. Anthropic attributes it to an "attention budget":
transformers create "n² pairwise relationships for n tokens" [1].

**Exam says.** D5.4: degradation "shows as 'typical patterns' in place of the classes actually
read, and as two answers to one question" (*Decision rules D5*).
D5.1: "Against lost-in-the-middle, key summaries go first and detailed results get explicit
section headers"; "A larger context window" is a losing distractor (same file).

**Sources say.**
- Chroma tested 18 LLMs (GPT-4.1, Claude 4, Gemini 2.5, Qwen3) and found "performance degrades as input length increases", even on simple tasks; distractors hurt; lower needle-question similarity degrades faster; and models did better on shuffled haystacks than logically structured ones [2]. On LongMemEval, focused prompts with only relevant content beat full prompts substantially [2].
- Lost in the Middle (TACL 2023): performance "is often highest when relevant information occurs at the beginning or end of the input context, and significantly degrades when models must access relevant information in the middle of long contexts, even for explicitly long-context models" [3].
- Claude docs: put long documents at the top and the query at the end; "Queries at the end can improve response quality by up to 30 percent in tests" [37].
- Claude Code: "LLM performance degrades as context fills ... The context window is the most important resource to manage" [5].
- Course material (not a primary source): start worrying at "about 80,000 to 100,000 tokens", a band not a cliff (*Claude Code for Real Engineers* course notes, *Exploration, context and research*, citing lesson `03-05-a @ 03:02`).

**Implication.** The map must be small, and the answering prompt must be focused: load only the
index plus the one or two area pages a question needs. Never dump the whole map. Put the map
excerpt first and the question last, with section headers [3][37].

### C2. Just-in-time retrieval, pre-loading and progressive disclosure

**Definition.** Just-in-time: agents "maintain lightweight identifiers (file paths, stored
queries, web links, etc.) and use these references to dynamically load data into context at
runtime using tools" [1]. Progressive disclosure: metadata first, body when relevant, bundled
files "only as needed", "a well-organized manual that starts with a table of contents, then
specific chapters, and finally a detailed appendix" [10].

**Exam says.** D3 (exam notes): skills "orchestrate multi-step work and can fork context"; commands run
in the current session (*Commands vs. Skills*).
The syllabus asks: "rules vs nested CLAUDE.md vs skills, which one applies automatically by file
path?" (*Syllabus coverage*, line 38).

**Sources say.**
- "Claude Code is an agent that employs this hybrid model: CLAUDE.md files are naively dropped into context up front, while primitives like glob and grep allow it to navigate its environment and retrieve files just-in-time" [1].
- Skills: descriptions always load, "full skill content only loads when invoked"; keep SKILL.md under 500 lines; description plus `when_to_use` truncated at 1,536 characters; supporting files referenced from SKILL.md load on demand; `` !`command` `` injects live output before the skill reaches Claude [9].
- After `/compact`, invoked skill bodies are re-injected, "capped at 5,000 tokens per skill" [7].
- Best practices: CLAUDE.md should exclude "File-by-file descriptions of the codebase" and "Information that changes frequently"; "For domain knowledge or workflows that are only relevant sometimes, use skills instead" [5].

**Implication.** Deliver the map through a skill (`codebase-map`) whose SKILL.md is short
and points at `docs/codebase-map/INDEX.md` and per-area pages. Do not `@import` the map into
CLAUDE.md: imports "load and enter the context window at launch" [4], which is pre-loading. The
skill can use `` !`git rev-parse HEAD` `` to inline the current SHA next to the map's stamp [9].

### C3. Compaction, `/clear`, and summarize-then-spawn-a-subagent

**Definition.** Compaction: "taking a conversation nearing the context window limit, summarizing
its contents, and reinitiating a new context window with the summary" [1]. `/clear` resets the
context entirely [5].

**Exam says.** Mock item (practice mock 01, code_exploration): after 25 minutes on a
rendering subsystem, answers cite "typical rendering patterns" rather than `VulkanPipeline` and
`FrameGraph`; the physics question depends on those findings. Wrong: "/clear ... then start fresh
... using file paths from the project's CLAUDE.md". Right: "Summarize key rendering findings, then
spawn a sub-agent for physics exploration with that summary in its initial context." D5.4 lists
`/clear`, re-reading, a fresh session from zero and a larger `max_tokens` as losers; `/compact` is
right only "when verbose discovery output fills the context and nothing else is wrong" (D5 file).
D1.7: `--resume` plus a list of changed files, rather than re-exploring from zero
(*Decision rules D1*).

**Sources say.**
- Claude Code docs recommend `/clear` "between unrelated tasks" and after two failed corrections [5]. This does not conflict with the exam: the mock's follow-up is a *related* task that needs prior findings.
- Auto-compaction "clears older tool outputs first, then summarizes"; "detailed instructions from early in the conversation may be lost" [6]. Project-root CLAUDE.md survives compaction; nested CLAUDE.md and path-scoped rules reload only when matching files are read [4].
- A `SessionStart` hook with matcher `compact` can re-inject critical context after every compaction [12].
- Course opinion: repeated compaction leaves "sediment" and is "an anti-pattern" (Exploration note, `03-08-a @ 05:45`, `@ 07:07`). Opinion, not a primary source.

**Implication.** The map is the persistent "summary of key findings" that the exam wants
injected into the next subagent. A question answered by a subagent gets the relevant map pages
in its task prompt, not the whole prior conversation.

### C4. Structured note-taking and scratchpads

**Definition.** "Structured note-taking, or agentic memory, is a technique where the agent
regularly writes notes persisted to memory outside of the context window" [1].

**Exam says.** D5.4: "Agents keep a scratchpad file of key findings and reference it later"; "For
crash recovery, each agent exports its state to a known location and the coordinator loads a
manifest on resume" (D5 file).

**Sources say.**
- Anthropic's multi-agent research system saves its plan to memory when context exceeds 200,000 tokens, and has subagents write outputs to a filesystem "to minimize the 'game of telephone'" [36].
- Course: "research is ... a way of caching explore phases", and research files need a closely monitored lifecycle because "a bunch of stale markdown files in your repo are going to really hurt your LLM's performance" (Exploration note, `08-04-a @ 02:29`, `@ 02:44`).

**Implication.** Decision 9 is the exam's scratchpad pattern made durable and shared. The course
warning about stale markdown is the reason decision 12's SHA stamp and staleness hook are
required, not optional.

### C5. Persistent project memory in Claude Code (CLAUDE.md, rules, auto memory)

**Definition.** Two cross-session mechanisms: CLAUDE.md files (written by humans) and auto
memory (written by Claude) [4].

**Exam says.** Three layers: user, project, directory. The exam note states "the most specific
layer wins every single time" and shows `@import ./rules/testing.md`
(*CLAUDE.md Hierarchy*).
Anti-pattern: one 800-line CLAUDE.md mixing scopes (`.../CLAUDE.md Hierarchy/Pitfalls vs. Practices.md`).

**Sources say.**
- Locations: managed policy, `~/.claude/CLAUDE.md`, `./CLAUDE.md` or `./.claude/CLAUDE.md`, `./CLAUDE.local.md` [4].
- Loading: files from the working directory and every ancestor load at launch; subdirectory files load "when Claude reads files in those subdirectories" [4].
- **Precedence**: "All discovered files are concatenated into context rather than overriding each other"; closer files are read last. "if a user rule and a project rule conflict, Claude may follow either one" and "if two rules contradict each other, Claude may pick one arbitrarily" [4]. This contradicts the exam notes' "most specific wins" wording (see Design rules, contradictions).
- Imports: syntax is `@path/to/import`, relative to the importing file, "maximum depth of four hops"; imported files still load at launch [4].
- Size: "target under 200 lines per CLAUDE.md file. Longer files consume more context and reduce adherence" [4]. `.claude/rules/*.md` with `paths:` frontmatter load only for matching files [4].
- Auto memory: `MEMORY.md` index, first 200 lines or 25KB loaded per session; topic files read on demand [4].
- CLAUDE.md "is delivered as a user message after the system prompt"; for guaranteed behaviour use hooks [4][5].
- Subagents can declare `memory: project` to persist to `.claude/agent-memory/<name>/` [8].

**Implication.** The map is neither CLAUDE.md nor auto memory. It is committed documentation
(decision 12), reached through a skill. Only one line of the target repo's CLAUDE.md may
mention it (a pointer, not an import), which respects the "file-by-file descriptions" exclusion [5].

### C6. Subagent context isolation for exploration

**Definition.** "Each subagent runs in its own context window with a custom system prompt,
specific tool access, and independent permissions" and returns only a summary [8].

**Exam says.** D1.3: "A subagent inherits nothing: every finding it needs goes into its prompt, as
structured data". D1.2: do not spawn "a subagent for something the coordinator already holds"
(D1 file). D5.4: "Specific investigations go to subagents while the main agent keeps the
high-level view" (D5 file).

**Sources say.**
- Built-in Explore: read-only, thoroughness `quick` / `medium` / `very thorough`; Explore and Plan skip CLAUDE.md at startup; subagents cannot spawn subagents by default [8].
- Subagents "explore extensively, using tens of thousands of tokens or more, but return only a condensed, distilled summary of its work (often 1,000-2,000 tokens)" [1].
- Claude Code doc walkthrough: a subagent read 6,100 tokens of files, the parent received a 420-token result [7].
- Multi-agent systems "use about 15× more tokens than chats"; "token usage by itself explains 80% of the variance" [36].

**Implication.** Map building fans out one mapping subagent per top-level area (Sonnet 5 per
decision 22), each returning a structured page. Answering from the map does not need a
subagent when the coordinator already has the page in context (D1.2); it needs one only when
the map points to code that must be read.

## State of the art in codebase understanding

| System | Mechanism | Freshness | Source |
|---|---|---|---|
| Claude Code | No index. CLAUDE.md up front, glob/grep/read just-in-time, optional LSP plugins | Always live | [1][6][13][14] |
| Aider repo map | tree-sitter tags of definitions and references; file graph ranked with PageRank; default 1k-token budget | Per-file mtime cache | [18][19][20] |
| Sourcegraph Cody | Moved from embeddings to keyword (BM25) search on Sourcegraph's platform | Search index | [21][22] |
| Cursor | Semantic embeddings plus grep; Merkle tree of file hashes | Only changed hashes re-synced | [23][24] |
| DeepWiki / Devin Wiki | LLM-generated wiki pages, architecture diagrams, source links; steerable via `.devin/wiki.json` | Refresh policy not documented (UNVERIFIED) | [26][27] |
| Google Code Search | Trigram index pre-filters files, then full regex | Offline index | [28] |
| Meta Glean | Fact database of definitions, references, calls; incremental "just the changes" | Stacked immutable DBs | [29] |

**Claude Code's stated choice.** Boris Cherny (Latent Space, 2025-05-07): early versions "used
RAG ... I think we were just using Voyage", and "agentic search just sidesteps all of that ... at
the cost of latency and tokens" [15]. The Pragmatic Engineer (2026-03-04): "Claude Code's
'agentic search' is really just glob and grep, and it outperformed RAG"; local vector DBs and
"recursive model-based indexing" had "downsides (stale indexes, permission complexity)" [16].
An X post attributed to Cherny says agentic search avoids "security, privacy, staleness, and
reliability" issues [17] (UNVERIFIED: page returned HTTP 402; text seen only in a search
snippet). Anthropic's Applied AI team (2026-05-14): indexes reflect "the codebase as it previously
existed weeks, days, or even hours before" [14].

**But the same article recommends a map.** "a lightweight markdown file at the repo root listing
each top-level folder with a one-line description of what lives there gives Claude a table of
contents it can scan before opening files" [14]. It also recommends LSP so Claude "searches by
symbol, not by string", and hooks that "propose CLAUDE.md updates" [14]. Claude Code docs add:
if an organization already runs code search or RAG, "expose it as an MCP tool" [13].

**Counter-evidence for embeddings.** Cursor reports semantic search gives "on average 12.5%
higher accuracy in answering questions (6.5%–23.5% depending on the model)" on its internal
Cursor Context Bench, and that "the combination of these two [grep and semantic search] leads to
the best outcomes" [23]. Online effect was smaller because "not all requests require search"
[23]. Internal benchmark, not reproducible. Cursor's current docs describe a local "Instant Grep"
index and say Cursor "does not store embeddings of your codebase for search" [25]; how this
squares with [23][24] is unclear (UNVERIFIED which features that sentence covers).

**Tradeoffs for our tool.**
- Pre-computed map: cheap first answer, but can go stale and can be wrong (hallucinated structure). Agentic search: always live, but it costs tokens and latency every time [15].
- Structural maps (Aider, Glean) are deterministic and cheap to refresh; prose wikis (DeepWiki) explain intent but cost model calls and can hallucinate.
- Our position: a hybrid. The deterministic layer (file tree, exports, routes, package scripts) is generated by code. The prose layer (purpose, data flow, gotchas) is generated by subagents and must cite file:line. The answering agent uses the map to route, then greps or reads to confirm. This is Anthropic's own "hybrid model" [1] with a better table of contents [14].

## Keeping the map fresh

**Git primitives.** `<rev>:<path>` "names the blob or tree at the given path" [38], so
`git rev-parse HEAD:src/api` gives a tree hash that changes only when something under
`src/api` changes. `git diff --name-only <sha> HEAD` lists changed files between the stamp and
now [39]. Both are deterministic and cost no tokens.

**Prior art.** Aider caches tags per file keyed on mtime [20]. Cursor re-syncs only Merkle
entries "whose hashes differ" [24]. Glean indexes "just the changes", cost proportional to
fanout [29]. Exam D1.7: tell the resumed session "which files changed so it re-analyses those
rather than everything" (D1 file).

**Claude Code hooks (events relevant here)** [11]:
- `SessionStart` (matchers `startup`, `resume`, `clear`, `compact`, `fork`): plain-text stdout is added to Claude's context [11][12]. Main staleness check.
- `UserPromptSubmit`: stdout also added to context [11]. Possible per-question check, but it runs on every prompt.
- `FileChanged` (matcher lists literal filenames) and `CwdChanged` [11][12]. Could watch `.git/HEAD`; UNVERIFIED whether that is reliable for branch changes and new commits.
- `PostToolUse` can return `additionalContext` [11]. `Stop` receives the transcript path and can propose documentation updates [13].
- `systemMessage` surfaces a message to the user [11]. Exit 2 blocks on events that can block [11].
- Default timeout 600 s for command hooks [11]. Plugins ship hooks in `hooks/hooks.json` [12].
- Hooks are deterministic, CLAUDE.md is advisory [5]. Exam D1.5: "Hooks are deterministic. Prompts are probabilistic" (D1 file); *The Winning Philosophy*: "Deterministic > Probabilistic. Code > Prompts."

**Implication.** The hook only *detects* and *reports*. It compares the stamped SHA and per-area
tree hashes with HEAD and prints e.g. "codebase-map: 2 of 9 areas stale (src/api, src/auth);
built at abc123, HEAD def456". The refresh (a model task) is a skill/command the user runs, which
spawns subagents only for stale areas. No model call in the hook.

## Eval methodology (decision 18)

**Benchmarks that exist (verified).**
- SWE-QA [30]: repository-level QA. v1 abstract: 576 pairs from 11 repositories; current HTML version: 720 pairs over 15 Python repositories, 3.4M+ LOC. Graded by LLM-as-judge (Claude Sonnet 4.5) on correctness, completeness, relevance, clarity, coherence, five runs with majority vote, plus a check against three human engineers whose scores were "generally higher" but "the overall trends remain highly consistent". Question taxonomy (What / Why / Where / How) is a useful template; "Architecture exploration and Data/Control-flow" were hardest (search-snippet claim, UNVERIFIED against the paper text).
- RepoQA [31]: "Searching Needle Function": find a function from a natural-language description; 500 tasks, 50 repos, 5 languages. Exact-match style, no judge.
- CodeQueries [32]: CodeQL-derived semantic queries over Python with answer spans and supporting facts, single and multi-hop.
- Long Code Arena [33]: six project-wide tasks including bug localization and module summarization.
- Cursor Context Bench [23]: internal, not public.

**Building a 15-question set for `ravn-task-management-challenge` or `ravn-ui-kit`** (decision 5).
- Mix: ~4 Where (which file defines X), ~4 What (what does module Y export or do), ~4 How (trace a flow across files), ~3 Why/config (build scripts, env vars, conventions). Mirrors SWE-QA's categories [30].
- Every question gets a reference answer with (a) a short canonical value and (b) the file:line evidence, written by a person reading the code. Anthropic: "A good task is one where two domain experts would independently reach the same pass/fail verdict", and build a reference solution [35].
- Prefer answers checkable by code: a path, a symbol name, a list, a number. "Code-based graders" are "fast, cheap, objective, and reproducible" [35].
- Include 2 or 3 "staleness" questions whose answer changed after the map's SHA (build the map on an older commit, ask at HEAD). This measures the most important failure mode directly.
- Include 1 or 2 questions the map cannot answer, to measure whether the tool says so.

**Measuring.**
- Conditions: A = plain Claude Code (agentic search, no map); B = with map skill. Same model, same prompt, fresh session each question.
- Per question: correctness (pass/fail against reference), evidence correctness (cited file:line exists and supports the answer), input plus output tokens, wall-clock seconds, tool-call count. Anthropic lists transcript metrics "(turns, tool calls, tokens)" and latency [35]. `claude -p --output-format json` returns a structured result for scripting [5]; exact token fields UNVERIFIED, check before building the harness.
- Repeat each question k times (k = 3 is affordable) and report pass^k, "the probability that all k trials succeed", for consistency [35].
- Also report map build cost (tokens, time) once, so the break-even point in questions is visible.
- Output the shared eval report JSON (decision 20).

**LLM-as-judge risks.** Known biases: "position, verbosity, and self-enhancement biases, as well as
limited reasoning ability" [34]. Model graders are "non-deterministic" and "require calibration with
human graders" [35]. Anthropic's research team found a single judge call with a 0.0–1.0 score and
pass/fail "more consistent than multi-judge systems", and human testers still caught cases the
evals missed [36]. Rules: grade with code first; use a judge only for How/Why prose, with the
reference answer and a binary rubric; judge with a different model from the one answering to
limit self-enhancement [34]; hand-grade all 15 at least once and report agreement. Read the
transcripts [35].

**Sample size caveat.** 15 questions × 2 conditions detects large effects only. Anthropic says
early development can start with "20-50 simple tasks" because effect sizes are large [35]. Report
raw counts, not percentages with false precision.

## Failure modes

| # | Failure | Cause | Chosen behaviour | Basis |
|---|---|---|---|---|
| F1 | Stale map gives a confident wrong answer | Code changed after the stamp | Hook reports stale areas at session start; the answer names the map SHA and says when a cited area is stale; the agent verifies cited lines against live files before answering | [14][16]; D5.6 dates on every figure; D5.3 coverage annotations |
| F2 | Map too large to load | Map grew into a file-by-file dump | Hard budget: INDEX.md under 200 lines; one page per area; load index plus at most the relevant pages | [4] 200-line target; [9] 500-line SKILL.md; [2][3] |
| F3 | Hallucinated structure (files, symbols that do not exist) | LLM-written prose | Deterministic layer generated by code; every prose claim carries file:line; a validator checks every cited path and symbol exists at the stamped SHA and rejects the page otherwise | "Deterministic > Probabilistic" (Winning Philosophy); [35] code-based graders |
| F4 | Map silent about an area | Area skipped or build failed | Page marked `status: missing` with reason; answer says "not covered by the map" and falls back to search | D5.3: "Matched no documents" is a finding, empty-as-success hides errors |
| F5 | Map conflicts with the code | Stale or wrong page | Code wins; answer states both, with the map SHA; refresh offered | D5.6: keep both, attributed, with conflict annotated |
| F6 | Partial build crash | Subagent timeout | Each area page is written independently; a manifest lists done/failed areas; resume only failed ones | D5.4 manifest on resume; D1.7 |
| F7 | Context degradation during a long onboarding session | Many answers accumulate | Answer questions in subagents seeded with the relevant map pages; do not `/clear` mid-exploration | Mock item in practice mock 01; D5.4 |
| F8 | Stale, orphaned research markdown | Nobody owns the map | Map has an owner and a regeneration command; hook makes staleness visible | Course, Exploration note `08-04-a @ 02:44`; [13] review in PRs |

## Design rules for ravn-agents

1. **The map is a router, not an oracle.** It tells the agent where to look; any claim about specific code is confirmed against the live file before answering. Sources: [1] hybrid model, [14] table of contents, [15][16] staleness of indexes. Decisions 9, 12. **Tension with decision 9**, see Contradictions.
2. **Two layers.** A deterministic layer produced by TypeScript code (directory tree, package.json scripts, exports, routes, tree hashes), and a prose layer produced by subagents (purpose, flows, gotchas), each prose claim with file:line. Sources: [18][19][20] Aider, [29] Glean, Winning Philosophy. Decisions 9, 16.
3. **Layout.** `docs/codebase-map/INDEX.md` (under 200 lines: one line per area, the SHA, build date) plus `docs/codebase-map/areas/<area>.md`, each with frontmatter `{area, paths, tree_hash, built_at_sha, built_at, status}`. Key summary first, sections with headers. Sources: [4] 200 lines, [3][37] position, D5.1. Decision 12.
4. **Delivery by skill, not CLAUDE.md.** A `codebase-map` skill loads INDEX.md on demand and reads area pages only as needed; no `@import` of the map. At most a one-line pointer in the target repo's CLAUDE.md. Sources: [4] imports load at launch, [5] exclude file-by-file descriptions, [9][10] progressive disclosure. Decisions 4, 9.
5. **Stamp per area, not only per repo.** Store the build commit SHA plus `git rev-parse <sha>:<path>` per area, so staleness is detected per area with no model call. Sources: [38][39], [24] Merkle hashes. Decision 12.
6. **Staleness hook detects and reports, never refreshes.** A `SessionStart` command hook (shipped in the plugin's `hooks/hooks.json`) compares hashes to HEAD and prints stale areas to stdout, which enters Claude's context; also print via `systemMessage` for the user. Fast, deterministic, no network, well under the timeout. Sources: [11][12], D1.5. Decision 12. (CLAUDE.md: the user runs anything that changes state; the refresh is a command they invoke.)
7. **Incremental refresh.** The refresh command runs `git diff --name-only <stamp> HEAD`, maps changed paths to areas, and spawns one mapping subagent per stale area only, each given the old page plus the diff. Sources: [20][24][29], D1.7. Decisions 12, 22.
8. **Build with isolated subagents.** One read-only mapping subagent per area (Sonnet 5), each returning a structured page within a fixed token budget; coordinator (Opus 5.5) writes INDEX.md. Sources: [1] 1,000–2,000-token summaries, [8] isolation, D1.2, D1.3. Decisions 11 (pattern), 22.
9. **Answers carry provenance.** Every answer states the map SHA used, the pages consulted, file:line evidence, and whether any cited area was stale. Sources: D5.6 structured claims with source and date, D5.3 coverage annotations. Decision 6 (failure modes).
10. **Say "not covered" rather than guess.** Missing or failed areas are explicit; the answer falls back to live search and says so. Sources: D5.3, D5.2 escalation when no progress is possible. Decision 6.
11. **Validate before writing.** A code check rejects any page whose cited paths or symbols do not exist at the stamped SHA. Sources: [35] code-based graders, Winning Philosophy. Decision 6.
12. **Eval compares with and without the map on identical questions**, grading short answers by code, prose by a calibrated judge from a different model, reporting accuracy, tokens, seconds, tool calls, pass^3, build cost, and including staleness and "not in map" questions. Sources: [30][34][35][36]. Decisions 18, 20, 5.
13. **Budgets are enforced by code.** INDEX.md line count and per-page size are checked by the build; oversize fails the build rather than truncating silently. Sources: [4] (warning at startup for long files), [2]. Decision 6.

### Contradictions and tensions

- **Decision 9 vs Claude Code's design stance.** Decision 9 says later questions "are answered against it instead of re-reading the repo". Claude Code's team dropped pre-built indexes because they go stale and agentic search outperformed them [15][16], and Anthropic's large-codebase guidance says indexes reflect code "weeks, days, or even hours before" [14]. The same guidance does recommend a lightweight map as a table of contents [14]. Recommendation: reword decision 9 to "answered against the map first, reading only the code the map points to", and measure in the eval whether the map beats agentic search on accuracy, not only tokens. Cursor's data [23] suggests pre-computed context can raise accuracy; Cherny's claims [15][16] say the opposite for Claude Code. Neither is on our repos, which is why decision 18 matters.
- **Decision 12 vs "stale markdown hurts".** The course warns that stale markdown in the repo hurts model performance (Exploration note, `08-04-a @ 02:44`) and best practices exclude "Information that changes frequently" from CLAUDE.md [5]. Not a contradiction if rules 4 to 7 hold (map not auto-loaded, staleness visible). If the hook is dropped, decision 12 becomes the anti-pattern.
- **Exam note vs official docs (not CONTEXT.md).** `CLAUDE.md Hierarchy.md` says "a rule that is defined in a specific directory is alway going to overwrite a more general project rule". The memory docs say files "are concatenated into context rather than overriding each other" and conflicting rules may be followed arbitrarily [4]. The note also writes `@import ./rules/testing.md`; the documented syntax is `@path/to/import` [4]. The exam may still reward "most specific wins" as an answer; engineering should follow the docs.
- **`/clear` in docs vs exam.** Docs recommend `/clear` between unrelated tasks [5]; the exam rejects `/clear` when the next task depends on earlier findings (practice mock 01). Consistent once the condition is read. The map resolves it: after `/clear`, findings persist on disk.

## Sources

Web sources, all accessed 2026-09-25.

1. Anthropic Engineering, "Effective context engineering for AI agents", 2025-09-29. https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
2. Hong, Troynikov, Huber, "Context Rot: How Increasing Input Tokens Impacts LLM Performance", Chroma, 2025-07-14. https://www.trychroma.com/research/context-rot
3. Liu et al., "Lost in the Middle: How Language Models Use Long Contexts", TACL 2023. https://arxiv.org/abs/2307.03172
4. Claude Code docs, "How Claude remembers your project" (memory). https://code.claude.com/docs/en/memory
5. Claude Code docs, "Best practices for Claude Code". https://code.claude.com/docs/en/best-practices
6. Claude Code docs, "How Claude Code works". https://code.claude.com/docs/en/how-claude-code-works
7. Claude Code docs, "Explore the context window". https://code.claude.com/docs/en/context-window
8. Claude Code docs, "Subagents". https://code.claude.com/docs/en/sub-agents
9. Claude Code docs, "Skills". https://code.claude.com/docs/en/skills
10. Anthropic Engineering, "Equipping agents for the real world with Agent Skills", 2025-10-16. https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills
11. Claude Code docs, "Hooks reference". https://code.claude.com/docs/en/hooks
12. Claude Code docs, "Automate actions with hooks" (hooks guide). https://code.claude.com/docs/en/hooks-guide
13. Claude Code docs, "Set up Claude Code in a monorepo or large codebase". https://code.claude.com/docs/en/large-codebases
14. Anthropic Applied AI team, "How Claude Code works in large codebases: best practices and where to start", Claude blog, 2026-05-14. https://claude.com/blog/how-claude-code-works-in-large-codebases-best-practices-and-where-to-start
15. Latent Space, "Claude Code: Anthropic's Agent in Your Terminal" (Boris Cherny, Cat Wu), 2025-05-07. https://www.latent.space/p/claude-code
16. G. Orosz, "Building Claude Code with Boris Cherny", The Pragmatic Engineer, 2026-03-04. https://newsletter.pragmaticengineer.com/p/building-claude-code-with-boris-cherny
17. B. Cherny, post on X (UNVERIFIED: HTTP 402 on fetch; text from search snippet only). https://x.com/bcherny/status/2017824286489383315
18. Aider docs, "Repository map". https://aider.chat/docs/repomap.html
19. Aider blog, "Building a better repository map with tree sitter", 2023-10-22. https://aider.chat/2023/10/22/repomap.html
20. Aider source, `aider/repomap.py` (uses `networkx.pagerank` with personalization; mtime-keyed tag cache). https://github.com/Aider-AI/aider/blob/main/aider/repomap.py
21. Sourcegraph blog, "How Cody understands your codebase", 2024-02-15. https://sourcegraph.com/blog/how-cody-understands-your-codebase
22. Hartman et al., "AI-assisted Coding with Cody: Lessons from Context Retrieval and Evaluation for Code Recommendations", 2024-08-09. https://arxiv.org/abs/2408.05344
23. Cursor blog, "Improving agent with semantic search", 2025-11-06. https://cursor.com/blog/semsearch
24. Cursor blog, "Securely indexing large codebases", 2026-01-27. https://cursor.com/blog/secure-codebase-indexing
25. Cursor docs, "Semantic search". https://cursor.com/docs/context/semantic-search
26. Devin docs, "DeepWiki repository wikis". https://docs.devin.ai/work-with-devin/deepwiki
27. Cognition blog, "DeepWiki: AI docs for any repo", 2025-05-05. https://cognition.com/blog/deepwiki
28. R. Cox, "Regular Expression Matching with a Trigram Index, or How Google Code Search Worked", 2012-01. https://swtch.com/~rsc/regexp/regexp4.html
29. Engineering at Meta, "Indexing code at scale with Glean", 2024-12-19. https://engineering.fb.com/2024/12/19/developer-tools/glean-open-source-code-indexing/
30. Peng et al., "SWE-QA: Can Language Models Answer Repository-level Code Questions?", arXiv 2509.14635 (v1 2025-09-18, revised 2026-04-26). https://arxiv.org/abs/2509.14635 and https://arxiv.org/html/2509.14635
31. Liu et al., "RepoQA: Evaluating Long Context Code Understanding", arXiv 2406.06025, 2024-06-10. https://arxiv.org/abs/2406.06025
32. Sahu et al., "CodeQueries: A Dataset of Semantic Queries over Code", arXiv 2209.08372. https://arxiv.org/abs/2209.08372
33. Bogomolov et al., "Long Code Arena: a Set of Benchmarks for Long-Context Code Models", arXiv 2406.11612, 2024-06-17. https://arxiv.org/abs/2406.11612
34. Zheng et al., "Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena", arXiv 2306.05685 (NeurIPS 2023 Datasets and Benchmarks). https://arxiv.org/abs/2306.05685
35. Anthropic Engineering, "Demystifying evals for AI agents", 2026-01-09. https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
36. Anthropic Engineering, "How we built our multi-agent research system". https://www.anthropic.com/engineering/multi-agent-research-system
37. Claude docs, "Prompting best practices" (long context section). https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
38. Git documentation, "gitrevisions" (`<rev>:<path>`). https://git-scm.com/docs/gitrevisions
39. Git documentation, "git-diff" (`--name-only`, `<commit> <commit>`). https://git-scm.com/docs/git-diff

Exam notes ("exam says" layer; private study notes, not published):

- V1. *Decision rules D5*
- V2. *Decision rules D1*
- V3. *The Winning Philosophy*
- V4. practice mock 01 (CyberSkill mock; independent, not Anthropic)
- V5. *CLAUDE.md Hierarchy*
- V6. *Pitfalls vs. Practices*
- V7. *Commands vs. Skills*
- V8. *Claude Code for Real Engineers* course notes, *Exploration, context and research* (course transcripts; opinion where noted)
- V9. *Syllabus coverage*
