import { env } from '$amplify/env/seed-demo-data';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import type { Schema } from '../../data/resource';
import {
  PROMPT_VERSION,
  RUBRIC_VERSION,
  RULES_VERSION,
  DEFAULT_MODEL_ID,
} from '../evaluate-use-case/versions';
import { extractFeatures } from '../evaluate-use-case/features';
import { overallFromDimensions } from '../evaluate-use-case/model';
import type { ScoreCategory, UseCaseInput } from '../evaluate-use-case/types';

/**
 * Seeds three historical demo use cases with pre-authored AI decision cards
 * and human decisions (architecture.md §17). Idempotent: a marker prefix in
 * the title prevents duplicate seeding. No Bedrock calls (§14.3).
 */

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);

const client = generateClient<Schema>();

const SEED_PREFIX = '[Demo]';

interface Scenario {
  title: string;
  businessProblem: string;
  targetUsers: string[];
  expectedOutcome: string;
  successMetrics: string[];
  proposedCapability: string;
  dataSources: string[];
  dataClassification: 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';
  externalFacing: boolean;
  humanOversight: boolean;
  estimatedMonthlyVolume: number;
  riskConcerns: string;
  finalStatus: 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED';
  evaluation: {
    recommendation: string;
    overallScore: number;
    summary: string;
    scores: Record<string, number>;
    recommendedPattern: string;
    requiredControls: string[];
    missingInformation: string[];
    policyReferences: Array<{ title: string; section?: string; referenceId?: string }>;
    deterministicFlags: Array<{ ruleId: string; severity: string; message: string }>;
  };
  decision: { decision: 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED'; comment: string; conditions: string[] };
  // Senior golden label (§9.5): the absolute-truth human score. Deliberately
  // differs from the AI card above to demonstrate human-machine divergence and
  // to give the supervised model three samples so it is active immediately
  // (MIN_GOLDEN = 3).
  golden: {
    scores: Record<ScoreCategory, number>;
    recommendation: string;
    notes: string;
  };
  daysAgo: number;
}

const SCENARIOS: Scenario[] = [
  {
    title: `${SEED_PREFIX} Internal engineering knowledge assistant`,
    businessProblem:
      'Engineers spend significant time searching internal runbooks and architecture docs across scattered wikis.',
    targetUsers: ['Software engineers', 'SRE team'],
    expectedOutcome: 'Reduce time-to-answer for internal technical questions.',
    successMetrics: ['Median search-to-answer time < 2 min', 'Weekly active users > 60%'],
    proposedCapability: 'Internal retrieval-augmented assistant over approved engineering docs',
    dataSources: ['Internal engineering wiki (approved export)', 'Architecture decision records'],
    dataClassification: 'INTERNAL',
    externalFacing: false,
    humanOversight: true,
    estimatedMonthlyVolume: 4000,
    riskConcerns: 'Occasional outdated documentation could produce stale answers.',
    finalStatus: 'APPROVED',
    evaluation: {
      recommendation: 'PROCEED_WITH_CONTROLS',
      overallScore: 82,
      summary:
        'Strong internal value with a well-understood RAG pattern and approved, non-sensitive data. Add source citations and a feedback path for stale content.',
      scores: {
        businessValue: 86,
        technicalFeasibility: 84,
        dataReadiness: 80,
        securityAndPrivacyRisk: 82,
        responsibleAiRisk: 80,
      },
      recommendedPattern: 'Internal retrieval-augmented assistant',
      requiredControls: [
        'Show sources with generated responses',
        'Restrict access to authorized employees',
        'Provide a feedback path to flag stale content',
      ],
      missingInformation: [],
      policyReferences: [
        { title: 'AI Acceptable Use Policy', section: 'Human oversight', referenceId: 'policy-ai-001' },
      ],
      deterministicFlags: [],
    },
    decision: {
      decision: 'APPROVED',
      comment: 'Clear internal value, low risk. Approved with source-citation and feedback controls.',
      conditions: ['Citations must be shown', 'Quarterly review of source freshness'],
    },
    golden: {
      // Senior rated business value higher than the AI and was slightly more
      // cautious on data readiness (source freshness).
      scores: {
        businessValue: 90,
        technicalFeasibility: 82,
        dataReadiness: 76,
        securityAndPrivacyRisk: 85,
        responsibleAiRisk: 84,
      },
      recommendation: 'PROCEED_WITH_CONTROLS',
      notes: 'Strong internal value; low risk. Watch source freshness.',
    },
    daysAgo: 21,
  },
  {
    title: `${SEED_PREFIX} Customer-support response generator`,
    businessProblem:
      'Support agents draft repetitive replies to common billing and account questions, slowing response times.',
    targetUsers: ['Customer support agents', 'Customers (indirectly)'],
    expectedOutcome: 'Faster, more consistent first responses to common support tickets.',
    successMetrics: ['First-response time reduced 30%', 'Agent CSAT maintained or improved'],
    proposedCapability: 'Draft-reply generator with agent review before sending',
    dataSources: ['Approved support knowledge base', 'Customer ticket (personal data)'],
    dataClassification: 'CONFIDENTIAL',
    externalFacing: true,
    humanOversight: true,
    estimatedMonthlyVolume: 12000,
    riskConcerns: 'Customer personal data in tickets; risk of incorrect account guidance.',
    finalStatus: 'APPROVED',
    evaluation: {
      recommendation: 'PROCEED_WITH_CONTROLS',
      overallScore: 71,
      summary:
        'Good efficiency gain, but customer-facing output over personal data requires human review, PII redaction, approved sources, and a defined retention period.',
      scores: {
        businessValue: 80,
        technicalFeasibility: 78,
        dataReadiness: 68,
        securityAndPrivacyRisk: 60,
        responsibleAiRisk: 66,
      },
      recommendedPattern: 'Agent-in-the-loop draft assistant',
      requiredControls: [
        'Require human review before external publication',
        'Redact personal information before inference',
        'Cite approved sources and provide human escalation',
      ],
      missingInformation: ['Confirmed retention period for personal data'],
      policyReferences: [
        { title: 'Customer Communication Standard', section: 'Automated responses', referenceId: 'policy-cust-004' },
        { title: 'Privacy and Retention Standard', section: 'Personal data in AI systems', referenceId: 'policy-priv-003' },
      ],
      deterministicFlags: [
        {
          ruleId: 'PERSONAL_DATA_NO_RETENTION',
          severity: 'CONTROL_REQUIRED',
          message: 'Personal data appears to be involved without a stated retention period.',
        },
      ],
    },
    decision: {
      decision: 'APPROVED',
      comment: 'Approved for pilot with mandatory agent review, PII redaction, and a 90-day retention policy.',
      conditions: ['Agent must approve every reply', 'PII redaction enabled', 'Retention set to 90 days'],
    },
    golden: {
      // Senior was stricter than the AI on the privacy/risk dimensions given
      // customer PII in an external-facing flow.
      scores: {
        businessValue: 78,
        technicalFeasibility: 75,
        dataReadiness: 62,
        securityAndPrivacyRisk: 52,
        responsibleAiRisk: 58,
      },
      recommendation: 'PROCEED_WITH_CONTROLS',
      notes: 'Value is real, but PII exposure warrants stricter risk scoring than the AI gave.',
    },
    daysAgo: 12,
  },
  {
    title: `${SEED_PREFIX} Automated employee performance recommendation`,
    businessProblem:
      'HR wants to automatically generate performance ratings and promotion recommendations from employee activity data.',
    targetUsers: ['HR managers', 'Employees (as decision subjects)'],
    expectedOutcome: 'Automate first-pass performance ratings.',
    successMetrics: ['Reduce manager review time'],
    proposedCapability: 'Automated performance rating and promotion recommendation',
    dataSources: ['Employee performance records (restricted)', 'Activity logs'],
    dataClassification: 'RESTRICTED',
    externalFacing: false,
    humanOversight: false,
    estimatedMonthlyVolume: 500,
    riskConcerns: 'High-impact automated decisions about people; fairness and legal exposure.',
    finalStatus: 'REJECTED',
    evaluation: {
      recommendation: 'SPECIALIST_REVIEW_REQUIRED',
      overallScore: 34,
      summary:
        'High-impact automated decisions about employment with restricted data and no human oversight. Deterministic rules cap this at specialist review; not suitable to proceed as proposed.',
      scores: {
        businessValue: 55,
        technicalFeasibility: 60,
        dataReadiness: 30,
        securityAndPrivacyRisk: 22,
        responsibleAiRisk: 12,
      },
      recommendedPattern: 'Not recommended without specialist governance review',
      requiredControls: [
        'Route to specialist review (HR / legal / compliance) before any approval',
        'Complete a security review of the data processing path',
        'Introduce mandatory human oversight for every decision',
      ],
      missingInformation: ['Fairness assessment', 'Legal review', 'Employee consent basis'],
      policyReferences: [
        { title: 'Data Classification Standard', section: 'Confidential and restricted data', referenceId: 'policy-data-002' },
        { title: 'AI Acceptable Use Policy', section: 'Human oversight', referenceId: 'policy-ai-001' },
      ],
      deterministicFlags: [
        {
          ruleId: 'HIGH_IMPACT_DOMAIN',
          severity: 'SPECIALIST_REVIEW',
          message: 'The proposal affects a high-impact domain ("performance rating"). Specialist review is required.',
        },
        {
          ruleId: 'RESTRICTED_DATA',
          severity: 'BLOCK',
          message: 'Restricted data referenced. An approved processing path and security review are required.',
        },
      ],
    },
    decision: {
      decision: 'REJECTED',
      comment:
        'Rejected as proposed. High-impact automated HR decisions without oversight are out of policy. Revisit only with human-in-the-loop, fairness assessment, and legal sign-off.',
      conditions: [],
    },
    golden: {
      // Senior scored this even lower than the AI across risk and readiness —
      // high-impact automated HR decisions with restricted data and no oversight.
      scores: {
        businessValue: 42,
        technicalFeasibility: 55,
        dataReadiness: 20,
        securityAndPrivacyRisk: 12,
        responsibleAiRisk: 8,
      },
      recommendation: 'SPECIALIST_REVIEW_REQUIRED',
      notes: 'Not viable as proposed. Needs human-in-the-loop, fairness assessment, and legal sign-off.',
    },
    daysAgo: 5,
  },
];

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export const handler: Schema['seedDemoData']['functionHandler'] = async (event, context) => {
  const identity = (event.identity ?? {}) as { sub?: string; username?: string };
  const owner = identity.sub ? `${identity.sub}::${identity.username ?? identity.sub}` : 'seed';
  const actorId = identity.sub ?? 'seed';

  // Idempotency: skip if demo data already exists.
  const { data: existing } = await client.models.UseCase.list({
    filter: { title: { beginsWith: SEED_PREFIX } },
  });
  if ((existing?.length ?? 0) > 0) {
    return { seeded: 0, message: 'Demo data already present.' };
  }

  let seeded = 0;
  for (const scenario of SCENARIOS) {
    const submittedAt = isoDaysAgo(scenario.daysAgo + 1);

    const { data: useCase, errors: ucErrors } = await client.models.UseCase.create({
      title: scenario.title,
      businessProblem: scenario.businessProblem,
      targetUsers: scenario.targetUsers,
      expectedOutcome: scenario.expectedOutcome,
      successMetrics: scenario.successMetrics,
      proposedCapability: scenario.proposedCapability,
      dataSources: scenario.dataSources,
      dataClassification: scenario.dataClassification,
      externalFacing: scenario.externalFacing,
      humanOversight: scenario.humanOversight,
      estimatedMonthlyVolume: scenario.estimatedMonthlyVolume,
      riskConcerns: scenario.riskConcerns,
      status: scenario.finalStatus,
      submittedAt,
      owner,
    });
    if (ucErrors?.length || !useCase) {
      console.log(JSON.stringify({ operation: 'seed', outcome: 'usecase_error', errors: ucErrors }));
      continue;
    }

    const { data: evaluation } = await client.models.Evaluation.create({
      useCaseId: useCase.id,
      recommendation: scenario.evaluation.recommendation as Schema['Evaluation']['type']['recommendation'],
      overallScore: scenario.evaluation.overallScore,
      summary: scenario.evaluation.summary,
      scores: JSON.stringify(scenario.evaluation.scores),
      recommendedPattern: scenario.evaluation.recommendedPattern,
      requiredControls: scenario.evaluation.requiredControls,
      missingInformation: scenario.evaluation.missingInformation,
      policyReferences: JSON.stringify(scenario.evaluation.policyReferences),
      deterministicFlags: JSON.stringify(scenario.evaluation.deterministicFlags),
      modelId: DEFAULT_MODEL_ID,
      modelConfiguration: JSON.stringify({ maxTokens: 1500, temperature: 0.2, topP: 0.9, seeded: true }),
      promptVersion: PROMPT_VERSION,
      rubricVersion: RUBRIC_VERSION,
      rulesVersion: RULES_VERSION,
      createdBy: 'seed-demo-data',
    });

    if (evaluation) {
      await client.models.UseCase.update({ id: useCase.id, currentEvaluationId: evaluation.id });
    }

    await client.models.ReviewerDecision.create({
      useCaseId: useCase.id,
      evaluationId: evaluation?.id,
      reviewerId: actorId,
      decision: scenario.decision.decision,
      comment: scenario.decision.comment,
      conditions: scenario.decision.conditions,
    });

    // Senior golden label (§9.5): absolute-truth human score with a structured
    // feature snapshot. Seeding all three makes the supervised model active for
    // the demo immediately (MIN_GOLDEN = 3). Extraction reuses the exact same
    // code path as the evaluation Lambda, so features never drift.
    const useCaseInput: UseCaseInput = {
      id: useCase.id,
      title: scenario.title,
      businessProblem: scenario.businessProblem,
      targetUsers: scenario.targetUsers,
      expectedOutcome: scenario.expectedOutcome,
      successMetrics: scenario.successMetrics,
      proposedCapability: scenario.proposedCapability,
      dataSources: scenario.dataSources,
      dataClassification: scenario.dataClassification,
      externalFacing: scenario.externalFacing,
      humanOversight: scenario.humanOversight,
      estimatedMonthlyVolume: scenario.estimatedMonthlyVolume,
      riskConcerns: scenario.riskConcerns,
    };
    await client.models.GoldenLabel.create({
      useCaseId: useCase.id,
      features: JSON.stringify(extractFeatures(useCaseInput)),
      scores: JSON.stringify(scenario.golden.scores),
      overallScore: overallFromDimensions(scenario.golden.scores),
      recommendation: scenario.golden
        .recommendation as Schema['GoldenLabel']['type']['recommendation'],
      scoredBy: 'seed-senior-reviewer',
      notes: scenario.golden.notes,
    });

    // Append-only status history reflecting the historical workflow.
    const events: Array<{ from: string; to: string; type: string; actor: 'USER' | 'SYSTEM' }> = [
      { from: '', to: 'DRAFT', type: 'CREATED', actor: 'USER' },
      { from: 'DRAFT', to: 'SUBMITTED', type: 'SUBMITTED', actor: 'USER' },
      { from: 'SUBMITTED', to: 'EVALUATING', type: 'EVALUATION_STARTED', actor: 'USER' },
      { from: 'EVALUATING', to: 'PENDING_REVIEW', type: 'EVALUATION_COMPLETED', actor: 'SYSTEM' },
      { from: 'PENDING_REVIEW', to: scenario.finalStatus, type: 'DECISION_RECORDED', actor: 'USER' },
    ];
    for (const ev of events) {
      await client.models.StatusEvent.create({
        useCaseId: useCase.id,
        actorId: ev.actor === 'SYSTEM' ? 'seed-demo-data' : actorId,
        actorType: ev.actor,
        fromStatus: ev.from,
        toStatus: ev.to,
        eventType: ev.type,
      });
    }

    seeded += 1;
  }

  console.log(JSON.stringify({ operation: 'seed', outcome: 'success', seeded, correlationId: context.awsRequestId }));
  return { seeded, message: `Seeded ${seeded} historical use cases.` };
};
