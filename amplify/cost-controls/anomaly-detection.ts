import type { Stack } from 'aws-cdk-lib';
import { CfnAnomalyMonitor, CfnAnomalySubscription } from 'aws-cdk-lib/aws-ce';
import type { Topic } from 'aws-cdk-lib/aws-sns';

/** AWS Cost Anomaly Detection (§14.2): complements the fixed budget by flagging
 *  unusual service-level spend, with a minimum-impact threshold. */
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
