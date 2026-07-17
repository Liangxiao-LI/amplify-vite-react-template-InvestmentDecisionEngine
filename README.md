# Enterprise GenAI Use-Case Decision Platform (MVP)

A decision-support platform for submitting, assessing, reviewing, and governing
proposed generative-AI use cases. Built on AWS Amplify Gen 2 (React + Vite +
TypeScript). See [architecture.md](architecture.md) for the full architecture.

> The AI assessment is **advisory**. The final decision is always made by an
> accountable human reviewer and is stored separately (ADR-007).

## Workflow

1. A **Requester** signs in and submits a structured GenAI use case.
2. Deterministic policy rules run in the backend (`amplify/functions/evaluate-use-case/rules.ts`).
3. **Amazon Bedrock** produces a schema-validated, structured assessment
   (scores, recommendation, required controls, missing information, policy references).
4. A **Reviewer** approves, rejects, or requests changes.
5. The platform preserves the assessment, final decision, comments, and an
   append-only status history.

## Stack

| Layer | Implementation |
|---|---|
| Hosting / CI | AWS Amplify Hosting (`amplify.yml`) |
| Auth | Amazon Cognito email sign-in + `ADMIN` / `REVIEWER` / `REQUESTER` groups |
| API / data | Amplify Data (AppSync + DynamoDB), userPool auth only |
| Evaluation | `evaluate-use-case` Lambda → Amazon Bedrock Converse API |
| Cost controls | AWS Budgets + SNS + Cost Anomaly Detection (`amplify/cost-controls/`) |

## Local development

```bash
npm install
npx ampx sandbox        # deploys a personal cloud sandbox, writes amplify_outputs.json
npm run dev             # starts Vite on http://localhost:5173
```

### Required setup

1. **Bedrock model access** — enable the model referenced by `BEDROCK_MODEL_ID`
   (default: `us.anthropic.claude-3-5-haiku-20241022-v1:0`) in the deployment
   region via the Bedrock console.
2. **User groups** — after creating demo users, add reviewers to the
   `REVIEWER` Cognito group (Cognito console → User pool → Groups).
3. **Cost controls (optional but recommended)** — set `BUDGET_ALERT_EMAIL`
   (and optionally `MONTHLY_BUDGET_AMOUNT`, `BUDGET_CURRENCY`, `BUDGET_NAME`,
   `ANOMALY_IMPACT_THRESHOLD`) in the Amplify build environment to deploy the
   budget, SNS alerts, and anomaly detection. Confirm the SNS email
   subscription after the first deploy. If unset, these resources are skipped
   (deploying them may need account-level permissions — architecture.md §14.7).

### Backend environment variables

| Variable | Default | Purpose |
|---|---|---|
| `BEDROCK_MODEL_ID` | `us.anthropic.claude-3-5-haiku-20241022-v1:0` | Model / inference profile |
| `EVALUATIONS_ENABLED` | `true` | Feature flag to disable evaluations |
| `MAX_EVALUATIONS_PER_USE_CASE` | `3` | Spend guardrail |
| `MAX_INPUT_CHARACTERS` | `20000` | Spend guardrail |
| `MAX_OUTPUT_TOKENS` | `1500` | Spend guardrail |
| `MAX_MODEL_RETRIES` | `2` | Bounded retry on throttling |

## Deploying to AWS

Connect the repository to AWS Amplify Hosting; `amplify.yml` deploys the
backend (`ampx pipeline-deploy`) and then the frontend. See the
[Amplify quickstart](https://docs.amplify.aws/react/start/quickstart/).

## Security

- All data access requires a signed-in user; there is no public API key.
- Only the evaluation Lambda role can invoke Bedrock; the browser never calls it.
- Model output is schema-validated before persistence; unknown recommendation
  values are rejected and scores are bounded.
- Authorization is enforced in the data model and backend, not only the UI.

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for security
issue reporting.

## License

MIT-0 — see the LICENSE file.
