import type { Stack } from 'aws-cdk-lib';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { EmailSubscription } from 'aws-cdk-lib/aws-sns-subscriptions';
import { Effect, PolicyStatement, ServicePrincipal } from 'aws-cdk-lib/aws-iam';

/** Cost-alert SNS topic (§14.1, §14.6). Budgets and Cost Anomaly Detection
 *  publish here; the email subscription must be confirmed before alerts flow. */
export function createCostAlertTopic(stack: Stack, alertEmail: string): Topic {
  const topic = new Topic(stack, 'CostAlertTopic', {
    displayName: 'GenAI decision platform cost alerts',
  });

  // Allow AWS Budgets and Cost Anomaly Detection to publish.
  for (const service of ['budgets.amazonaws.com', 'costalerts.amazonaws.com']) {
    topic.addToResourcePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        principals: [new ServicePrincipal(service)],
        actions: ['SNS:Publish'],
        resources: [topic.topicArn],
      }),
    );
  }

  topic.addSubscription(new EmailSubscription(alertEmail));
  return topic;
}
