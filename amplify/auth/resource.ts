import { defineAuth } from '@aws-amplify/backend';

/**
 * Authentication for the GenAI Use-Case Decision Platform.
 *
 * - Email/password sign-in (enterprise federation is a post-MVP item, see
 *   architecture.md §13 and §22).
 * - Cognito groups carry the platform roles. Group membership is managed by
 *   an Administrator (Cognito console or Admin API), not self-assigned.
 * - SENIOR_REVIEWER is a trusted subset of reviewers authorized to record
 *   golden labels (absolute-truth human scores) for the supervised scoring
 *   model (architecture.md §7, §9.5). Golden labels are append-only.
 */
export const auth = defineAuth({
  loginWith: {
    email: true,
  },
  groups: ['ADMIN', 'SENIOR_REVIEWER', 'REVIEWER', 'REQUESTER'],
});
