/**
 * Descriptive AWS service trace (architecture.md §5). This is an accurate map
 * of which managed services each workflow step exercises — not live packet
 * capture, since the browser cannot introspect AWS internals. Rendered on the
 * "How it works" page and reused as a compact strip on the evaluate action.
 */

interface WorkflowStep {
  step: string;
  services: string[];
  detail: string;
}

const WORKFLOW_STEPS: WorkflowStep[] = [
  {
    step: 'Sign in',
    services: ['Amazon Cognito'],
    detail: 'Authenticates the user and issues a token carrying their group (REQUESTER / REVIEWER / ADMIN).',
  },
  {
    step: 'Load app + data',
    services: ['Amplify Hosting (CDN)', 'AWS AppSync', 'Amazon DynamoDB'],
    detail: 'Static React app is served from the CDN; use cases are read through the GraphQL API backed by DynamoDB.',
  },
  {
    step: 'Create / submit use case',
    services: ['AWS AppSync', 'Amazon DynamoDB'],
    detail: 'A GraphQL mutation writes the UseCase and a StatusEvent to DynamoDB.',
  },
  {
    step: 'Run AI assessment',
    services: ['AWS AppSync', 'AWS Lambda', 'Amazon Bedrock', 'Amazon DynamoDB', 'Amazon CloudWatch'],
    detail:
      'AppSync invokes the evaluate-use-case Lambda, which runs deterministic rules, calls Bedrock, validates the JSON, writes the Evaluation to DynamoDB, and logs to CloudWatch. Only this Lambda role can call Bedrock.',
  },
  {
    step: 'Reviewer decision',
    services: ['AWS AppSync', 'Amazon DynamoDB'],
    detail: 'The human decision is written as a separate ReviewerDecision record, distinct from the AI output.',
  },
  {
    step: 'Seed demo data (admin)',
    services: ['AWS AppSync', 'AWS Lambda', 'Amazon DynamoDB'],
    detail: 'The admin-only seed-demo-data Lambda inserts historical use cases and decision cards — no Bedrock call.',
  },
  {
    step: 'Tune model (admin)',
    services: ['AWS AppSync', 'Amazon DynamoDB'],
    detail: 'The chosen Bedrock model is stored in PlatformConfig; the evaluate Lambda reads it on the next assessment.',
  },
  {
    step: 'Budget & cost alerts',
    services: ['AWS Budgets', 'Amazon SNS', 'AWS Cost Anomaly Detection'],
    detail: 'Account-level spend thresholds and anomalies publish to an SNS topic with an email subscriber.',
  },
];

const SERVICE_CLASS: Record<string, string> = {
  'Amazon Cognito': 'svc-auth',
  'AWS AppSync': 'svc-api',
  'Amazon DynamoDB': 'svc-data',
  'AWS Lambda': 'svc-compute',
  'Amazon Bedrock': 'svc-ai',
  'Amazon CloudWatch': 'svc-observ',
  'Amplify Hosting (CDN)': 'svc-host',
  'AWS Budgets': 'svc-cost',
  'Amazon SNS': 'svc-cost',
  'AWS Cost Anomaly Detection': 'svc-cost',
};

export function ServiceChips({ services }: { services: string[] }) {
  return (
    <span className="svc-chips">
      {services.map((svc) => (
        <span key={svc} className={`svc-chip ${SERVICE_CLASS[svc] ?? 'svc-default'}`}>
          {svc}
        </span>
      ))}
    </span>
  );
}

export function ServiceTrace() {
  return (
    <div className="card">
      <h3>AWS services triggered at each step</h3>
      <p className="muted">
        A descriptive map of the managed services each action exercises (not live tracing).
      </p>
      <ul className="trace-list">
        {WORKFLOW_STEPS.map((s) => (
          <li key={s.step} className="trace-row">
            <div className="trace-step">{s.step}</div>
            <ServiceChips services={s.services} />
            <div className="trace-detail muted">{s.detail}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
