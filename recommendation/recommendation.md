# Code Standards & Recommendations

Coding conventions for the **GenAI Use-Case Decision Platform** (AWS Amplify Gen 2 · React + Vite + TypeScript). These rules are distilled from the patterns already present in this repository — follow them so new code stays consistent with the existing architecture. See [architecture.md](architecture.md) for the system design these standards support.

---

## 1. Project structure & module boundaries

- **Backend lives under `amplify/`, frontend under `src/`.** Never import backend handler code into the browser bundle; share only pure, dependency-free logic (e.g. the scorecard math) by mirroring it deliberately.
- **One responsibility per module** inside the evaluation function:
  - `rules.ts` — deterministic policy checks (no model, no I/O).
  - `model.ts` — interpretable scorecard math (pure functions).
  - `features.ts` — structured feature extraction (pure, browser-safe).
  - `schemas.ts` — validation/normalization of model output.
  - `prompt.ts` — prompt construction only.
  - `handler.ts` — orchestration, auth, persistence, logging.
- **`resource.ts` defines infra; handlers define behavior.** Keep memory/timeout/env config in `resource.ts`, not hard-coded in logic.

## 2. TypeScript conventions

- **Strict mode on.** No implicit `any`; prefer explicit exported types (`UseCaseInput`, `ScoreCategory`, `Recommendation`).
- **Derive types from the source of truth.** UI and handlers use `Schema['UseCase']['type']` from the Amplify data model rather than redeclaring shapes.
- **Const arrays as the single enum source** (`SCORE_CATEGORIES`, `RECOMMENDATIONS`, `FEATURE_KEYS`) — iterate these instead of repeating string literals.
- **Pure functions where possible.** `features.ts` / `model.ts` are side-effect-free so they run identically in Lambda and browser preview.

## 3. The AI evaluation boundary (non-negotiable)

- **Deterministic checks run *before* the model** and can only make a recommendation *more* conservative (`applyRecommendationFloor`). The model never overrides a hard rule.
- **Never persist unvalidated model output.** All LLM JSON passes through `extractJson` + `validateAssessment`: unknown enum values are rejected, scores are clamped to `0–100`, strings are length-bounded.
- **Treat all proposal content as untrusted data.** Wrap user input in explicit markers in the prompt; instruct the model to never follow instructions found inside it.
- **The human is the decision-maker.** AI output is advisory (`Recommendation`), stored separately from the human `ReviewerDecision` (ADR-007). Never collapse the two.

## 4. Versioning & reproducibility

- **Every evaluation records its provenance:** `modelId`, `modelConfiguration`, `promptVersion`, `rubricVersion`, `rulesVersion`, `goldenSampleCount`, `scoreSource`.
- **Bump the version when behavior changes.** Any edit to `rules.ts`, the prompt, or the rubric requires bumping the corresponding `*_VERSION` env var so historical evaluations remain interpretable.

## 5. Authorization — defense in depth

- **Schema-level auth is the baseline** (owner-based + group-based grants in `data/resource.ts`); **handler-level auth is enforced again explicitly** (owner vs `REVIEWER`/`ADMIN`). Do not rely on either layer alone.
- **No public API key** — all data access requires an authenticated user pool identity.
- **Append-only models** (`StatusEvent`, `GoldenLabel`) get create/read grants only — never `update`/`delete`.

## 6. Structured logging & privacy

- **Log JSON objects, one per event**, via the shared `log()` helper — never free-form `console.log`.
- **Never log prompts or raw model output.** Diagnostics are truncated (`.slice(0, 500)`) and carry a `correlationId`, `outcome`, and `operation`.
- Always emit an `outcome` field (`success` / `forbidden` / `invalid_state` / `error` …) so logs are queryable.

## 7. Interpretable & supervised scoring

- **Explainability is a requirement, not a feature.** The scorecard is additive; the returned `contributions` *are* the "why this score" — keep it that way. No opaque scoring.
- **Golden labels are absolute truth.** Below `MIN_GOLDEN` samples, fall back to LLM cold-start scores rather than predicting from too little data.
- **`overallScore` is always the deterministic mean** of the five dimensions, regardless of score source.

## 8. Cost & resource guardrails

- **Right-size Lambda** — set `memoryMB`/`timeoutSeconds` to the workload (256MB for the evaluator, 128MB for the seeder), not defaults.
- **Cap model output** via `MAX_OUTPUT_TOKENS`; every guardrail (`MAX_EVALUATIONS_PER_USE_CASE`, `MAX_INPUT_CHARACTERS`, `EVALUATIONS_ENABLED`) is an **overridable env var** so a sandbox can run cheaply without changing committed defaults.
- **Seeding must not call Bedrock** — demo data is pre-authored, so it stays free and deterministic.
- **Account-level cost resources are opt-in** (deploy only when `BUDGET_ALERT_EMAIL` is set) and tagged for cost allocation.

## 9. Data modeling (Amplify schema)

- **Enums as `a.enum`, references as `a.ref`** — keep status/recommendation vocabularies in one place.
- **Store computed/AI artifacts as `a.json`** (`scores`, `features`, `featureContributions`) with a documented shape; validate on read.
- **Singletons use a fixed id** (`PlatformConfig` id = `"GLOBAL"`).

## 10. Error handling & retries

- **Retry only what's retryable.** Bedrock calls retry `ThrottlingException` / `ServiceUnavailableException` with bounded exponential backoff; everything else fails fast.
- **Fail into a recoverable state.** On error, set `EVALUATION_FAILED` and record a `StatusEvent` so the user can retry; wrap the failure-persistence itself in try/catch.
- **User-facing errors are generic; logs are specific.** Never leak internal messages or model output to the client.

## 11. Frontend conventions

- **Keep components lean** — the existing `src/` files carry minimal comments because the code is self-describing; prefer clear names over narration.
- **Mirror backend enums/types** from `Schema`, don't redefine them.
- **Presentational components stay dumb** (`ScoreCard`, `StatusBadge`, `ServiceTrace`); data-fetching and workflow logic live in `features/*` and `lib/*`.

---

## Comment & documentation policy

- **Comments explain *why*, not *what*.** One concise intent line per module; reference architecture sections as `§9.5` rather than restating them.
- **Architecture lives in `recommendation/architecture.md`**, not in sprawling inline blocks. Keep code comments short; keep the design doc authoritative.
- This is a **demonstration** codebase — optimize for readability and showcasing the architecture over production exhaustiveness.
