import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';

/** Single typed Amplify Data client shared by all features (§11). */
export const client = generateClient<Schema>();

export type UseCase = Schema['UseCase']['type'];
export type Evaluation = Schema['Evaluation']['type'];
export type ReviewerDecision = Schema['ReviewerDecision']['type'];
export type CommentRecord = Schema['Comment']['type'];
export type StatusEvent = Schema['StatusEvent']['type'];

export type UseCaseStatus = NonNullable<UseCase['status']>;
export type Decision = NonNullable<ReviewerDecision['decision']>;

/** Parse a JSON field that may be stored as a string. */
export function parseJsonField<T>(value: unknown): T | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }
  return value as T;
}
