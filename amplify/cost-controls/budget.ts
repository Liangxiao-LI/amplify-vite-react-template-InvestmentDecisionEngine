import type { Stack } from 'aws-cdk-lib';
import { CfnBudget } from 'aws-cdk-lib/aws-budgets';
import type { Topic } from 'aws-cdk-lib/aws-sns';

/**
 * Monthly cost budget for the demo environment (architecture.md §14.1).
 *
 * Thresholds:
 *   50% actual   — early awareness
 *   80% actual   — investigate current usage
 *  100% forecast — projected to exceed the budget
 *  100% actual   — budget exceeded
 *  120% actual   — escalate an unexpected overrun
 *
 * AWS Budgets notifications are not real-time circuit breakers; the
 * application also enforces its own evaluation guardrails (§14.3).
 */
export function createMonthlyBudget(stack: Stack, alertTopic: Topic): CfnBudget {
  const amount = Number(process.env.MONTHLY_BUDGET_AMOUNT ?? '100');
  const budgetName = process.env.BUDGET_NAME ?? 'genai-decision-platform-demo';

  const subscriber: CfnBudget.SubscriberProperty = {
    subscriptionType: 'SNS',
    address: alertTopic.topicArn,
  };

  const notification = (
    threshold: number,
    notificationType: 'ACTUAL' | 'FORECASTED',
  ): CfnBudget.NotificationWithSubscribersProperty => ({
    notification: {
      notificationType,
      comparisonOperator: 'GREATER_THAN',
      threshold,
      thresholdType: 'PERCENTAGE',
    },
    subscribers: [subscriber],
  });

  return new CfnBudget(stack, 'MonthlyCostBudget', {
    budget: {
      budgetName,
      budgetType: 'COST',
      timeUnit: 'MONTHLY',
      budgetLimit: {
        amount,
        unit: process.env.BUDGET_CURRENCY ?? 'USD',
      },
    },
    notificationsWithSubscribers: [
      notification(50, 'ACTUAL'),
      notification(80, 'ACTUAL'),
      notification(100, 'FORECASTED'),
      notification(100, 'ACTUAL'),
      notification(120, 'ACTUAL'),
    ],
  });
}
