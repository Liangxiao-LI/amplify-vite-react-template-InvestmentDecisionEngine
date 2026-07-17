import { defineAuth } from '@aws-amplify/backend';

/**
 * Authentication for the GenAI Use-Case Decision Platform.
 *
 * - Email/password sign-in (enterprise federation is a post-MVP item, see
 *   architecture.md §13 and §22).
 * - Cognito groups carry the platform roles. Group membership is managed by
 *   an Administrator (Cognito console or Admin API), not self-assigned.
 */
export const auth = defineAuth({
  loginWith: {
    email: true,
  },
  groups: ['ADMIN', 'REVIEWER', 'REQUESTER'],
});
