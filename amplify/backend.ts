import { defineBackend } from '@aws-amplify/backend';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Tags } from 'aws-cdk-lib';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { evaluateUseCase } from './functions/evaluate-use-case/resource';
import { seedDemoData } from './functions/seed-demo-data/resource';
import { createCostAlertTopic } from './cost-controls/notifications';
import { createMonthlyBudget } from './cost-controls/budget';
import { createCostAnomalyDetection } from './cost-controls/anomaly-detection';

const backend = defineBackend({
  auth,
  data,
  evaluateUseCase,
  seedDemoData,
});

// Bedrock access (§13): only the evaluation role may invoke models, scoped to
// foundation models and inference profiles.
backend.evaluateUseCase.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ['bedrock:InvokeModel', 'bedrock:Converse'],
    resources: [
      'arn:aws:bedrock:*::foundation-model/*',
      'arn:aws:bedrock:*:*:inference-profile/*',
    ],
  }),
);

// Cost allocation tags (§14.4)
for (const stack of [
  backend.auth.stack,
  backend.data.stack,
  backend.evaluateUseCase.stack,
  backend.seedDemoData.stack,
]) {
  Tags.of(stack).add('Application', 'genai-decision-platform');
  Tags.of(stack).add('ManagedBy', 'amplify');
}

// Budget monitoring and cost alerts (§14). Deployed only when BUDGET_ALERT_EMAIL
// is set — budget/Cost Explorer resources have account-level implications (§14.7).
const budgetAlertEmail = process.env.BUDGET_ALERT_EMAIL;
if (budgetAlertEmail) {
  const costStack = backend.createStack('cost-controls');
  const alertTopic = createCostAlertTopic(costStack, budgetAlertEmail);
  createMonthlyBudget(costStack, alertTopic);
  createCostAnomalyDetection(costStack, alertTopic);
  Tags.of(costStack).add('Application', 'genai-decision-platform');
  Tags.of(costStack).add('ManagedBy', 'amplify');
}
