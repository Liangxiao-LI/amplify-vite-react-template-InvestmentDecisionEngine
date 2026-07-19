import { type ClientSchema, a, defineData } from '@aws-amplify/backend';
import { evaluateUseCase } from '../functions/evaluate-use-case/resource';
import { seedDemoData } from '../functions/seed-demo-data/resource';

/*== GenAI Use-Case Decision Platform — data model =========================
Implements the logical model in architecture.md §8 with the authorization
rules from §7 and §13:

- Requesters own their use cases (owner-based access).
- Reviewers/Admins get group-based read (and status update) access.
- Evaluations are created only by the evaluate-use-case function; the AI
  output is stored separately from the human decision (ADR-007).
- StatusEvents are append-only through normal application workflows
  (create/read only; no update/delete grants).
- All access requires authentication (no public API key).
===========================================================================*/
const schema = a
  .schema({
    DataClassification: a.enum(['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED']),

    UseCaseStatus: a.enum([
      'DRAFT',
      'SUBMITTED',
      'EVALUATING',
      'EVALUATION_FAILED',
      'PENDING_REVIEW',
      'CHANGES_REQUESTED',
      'APPROVED',
      'REJECTED',
      'ARCHIVED',
    ]),

    Recommendation: a.enum([
      'PROCEED',
      'PROCEED_WITH_CONTROLS',
      'REVISE_AND_RESUBMIT',
      'DO_NOT_PROCEED',
      'SPECIALIST_REVIEW_REQUIRED',
    ]),

    UseCase: a
      .model({
        title: a.string().required(),
        businessProblem: a.string().required(),
        targetUsers: a.string().array(),
        expectedOutcome: a.string(),
        successMetrics: a.string().array(),
        proposedCapability: a.string(),
        dataSources: a.string().array(),
        dataClassification: a.ref('DataClassification'),
        externalFacing: a.boolean().default(false),
        humanOversight: a.boolean().default(true),
        estimatedMonthlyVolume: a.integer(),
        riskConcerns: a.string(),
        status: a.ref('UseCaseStatus'),
        currentEvaluationId: a.string(),
        submittedAt: a.datetime(),
        owner: a.string(),
        evaluations: a.hasMany('Evaluation', 'useCaseId'),
        decisions: a.hasMany('ReviewerDecision', 'useCaseId'),
        comments: a.hasMany('Comment', 'useCaseId'),
        statusEvents: a.hasMany('StatusEvent', 'useCaseId'),
      })
      .authorization((allow) => [
        allow.owner(),
        allow.groups(['REVIEWER', 'ADMIN']).to(['read', 'update']),
        // Senior reviewers may browse the entire portfolio (any stage) but not
        // mutate it — read-only oversight (§9.5, §11).
        allow.groups(['SENIOR_REVIEWER']).to(['read']),
      ]),

    // AI output is advisory and immutable through the app: created only by
    // the evaluation function, readable by authenticated users (§7, ADR-007).
    Evaluation: a
      .model({
        useCaseId: a.id().required(),
        useCase: a.belongsTo('UseCase', 'useCaseId'),
        recommendation: a.ref('Recommendation'),
        overallScore: a.integer(),
        summary: a.string(),
        scores: a.json(),
        recommendedPattern: a.string(),
        requiredControls: a.string().array(),
        missingInformation: a.string().array(),
        policyReferences: a.json(),
        deterministicFlags: a.json(),
        // Supervised scoring loop (§9.5): scoreSource = SUPERVISED_MODEL or
        // LLM_COLDSTART; features = snapshot; featureContributions = the "why";
        // goldenSampleCount = golden labels the model was fit from.
        scoreSource: a.string(),
        features: a.json(),
        featureContributions: a.json(),
        goldenSampleCount: a.integer(),
        modelId: a.string(),
        modelConfiguration: a.json(),
        promptVersion: a.string(),
        rubricVersion: a.string(),
        rulesVersion: a.string(),
        createdBy: a.string(),
      })
      .authorization((allow) => [allow.authenticated().to(['read'])]),

    // The final human decision, stored separately from the AI output (ADR-007).
    ReviewerDecision: a
      .model({
        useCaseId: a.id().required(),
        useCase: a.belongsTo('UseCase', 'useCaseId'),
        evaluationId: a.string(),
        reviewerId: a.string(),
        decision: a.enum(['APPROVED', 'REJECTED', 'CHANGES_REQUESTED']),
        comment: a.string(),
        conditions: a.string().array(),
      })
      .authorization((allow) => [
        allow.groups(['REVIEWER', 'ADMIN']).to(['create', 'read']),
        allow.authenticated().to(['read']),
      ]),

    // Golden labels — senior human scores, absolute truth for the supervised
    // model (§9.5). Append-only (SENIOR_REVIEWER/ADMIN create only, no update/
    // delete); all authenticated users may read. features = snapshot; scores =
    // the five 0-100 dimension scores the senior assigned.
    GoldenLabel: a
      .model({
        useCaseId: a.id().required(),
        features: a.json(),
        scores: a.json(),
        overallScore: a.integer(),
        recommendation: a.ref('Recommendation'),
        scoredBy: a.string(),
        notes: a.string(),
      })
      .authorization((allow) => [
        // Only senior reviewers record golden labels — not admins (§9.5).
        allow.groups(['SENIOR_REVIEWER']).to(['create', 'read']),
        allow.authenticated().to(['read']),
      ]),

    Comment: a
      .model({
        useCaseId: a.id().required(),
        useCase: a.belongsTo('UseCase', 'useCaseId'),
        authorId: a.string(),
        body: a.string().required(),
        visibility: a.enum(['ALL', 'REVIEWERS_ONLY']),
      })
      .authorization((allow) => [allow.authenticated().to(['create', 'read'])]),

    // Append-only status history (§7): no update/delete grants.
    StatusEvent: a
      .model({
        useCaseId: a.id().required(),
        useCase: a.belongsTo('UseCase', 'useCaseId'),
        actorId: a.string(),
        actorType: a.enum(['USER', 'SYSTEM']),
        fromStatus: a.string(),
        toStatus: a.string(),
        eventType: a.string(),
        detail: a.string(),
      })
      .authorization((allow) => [allow.authenticated().to(['create', 'read'])]),

    RubricVersion: a
      .model({
        version: a.string().required(),
        name: a.string(),
        description: a.string(),
        criteria: a.json(),
        thresholds: a.json(),
        isActive: a.boolean().default(false),
      })
      .authorization((allow) => [
        allow.groups(['ADMIN']),
        allow.authenticated().to(['read']),
      ]),

    // Singleton config (id = "GLOBAL"): only ADMIN may change the active model
    // or toggle evaluations; all authenticated users read it (§9.4, §14.3). The
    // evaluate function validates activeModelId against the allow-list.
    PlatformConfig: a
      .model({
        activeModelId: a.string(),
        evaluationsEnabled: a.boolean().default(true),
        updatedBy: a.string(),
      })
      .authorization((allow) => [
        allow.groups(['ADMIN']),
        allow.authenticated().to(['read']),
      ]),

    // Protected business operation (§10): evaluation runs only in the backend.
    evaluateUseCase: a
      .mutation()
      .arguments({ useCaseId: a.string().required() })
      .returns(a.json())
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(evaluateUseCase)),

    // Admin-only: insert historical demo use cases (§17). No Bedrock calls.
    seedDemoData: a
      .mutation()
      .returns(a.json())
      .authorization((allow) => [allow.group('ADMIN')])
      .handler(a.handler.function(seedDemoData)),
  })
  // Grant the backend functions access to the data API (least privilege is
  // enforced inside each handler; see §13).
  .authorization((allow) => [
    allow.resource(evaluateUseCase),
    allow.resource(seedDemoData),
  ]);

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    // No public API key: all data access requires a signed-in user (§13).
    defaultAuthorizationMode: 'userPool',
  },
});
