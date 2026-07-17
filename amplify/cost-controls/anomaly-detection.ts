import type { Stack } from 'aws-cdk-lib';
import { CfnAnomalyMonitor, CfnAnomalySubscription } from 'aws-cdk-lib/aws-ce';
import type { Topic } from 'aws-cdk-lib/aws-sns';

/**
 * AWS Cost Anomaly Detection (architecture.md §14.2).
 *
 * Complements the fixed monthly budget by detecting unusual service-level
 * spend. A minimum-impact threshold avoids excessive low-value alerts.
 */
export function createCostAnomalyDetection(stack: Stack, alertTopic: Topic): void {
  const monitor = new CfnAnomalyMonitor(stack, 'ServiceCostAnomalyMonitor', {
    monitorName: 'genai-decision-platform-services',
    monitorType: 'DIMENSIONAL',
    monitorDimension: 'SERVICE',
  });

  new CfnAnomalySubscription(stack, 'CostAnomalySubscription', {
    subscriptionName: 'genai-decision-platform-anomalies',
    frequency: 'IMMEDIATE',
    monitorArnList: [monitor.attrMonitorArn],
    subscribers: [
      {
        type: 'SNS',
        address: alertTopic.topicArn,
      },
    ],
    // Alert only when the anomaly's total impact exceeds the threshold (USD).
    thresholdExpression: JSON.stringify({
      Dimensions: {
        Key: 'ANOMALY_TOTAL_IMPACT_ABSOLUTE',
        MatchOptions: ['GREATER_THAN_OR_EQUAL'],
        Values: [process.env.ANOMALY_IMPACT_THRESHOLD ?? '10'],
      },
    }),
  });
}
