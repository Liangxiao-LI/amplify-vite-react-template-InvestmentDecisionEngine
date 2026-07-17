import type { UseCaseStatus } from '../lib/amplify-client';
import { STATUS_LABELS } from '../lib/workflow';

const STATUS_CLASS: Record<UseCaseStatus, string> = {
  DRAFT: 'badge-neutral',
  SUBMITTED: 'badge-info',
  EVALUATING: 'badge-progress',
  EVALUATION_FAILED: 'badge-danger',
  PENDING_REVIEW: 'badge-warning',
  CHANGES_REQUESTED: 'badge-warning',
  APPROVED: 'badge-success',
  REJECTED: 'badge-danger',
  ARCHIVED: 'badge-neutral',
};

export function StatusBadge({ status }: { status: UseCaseStatus | null | undefined }) {
  if (!status) return null;
  return <span className={`badge ${STATUS_CLASS[status]}`}>{STATUS_LABELS[status]}</span>;
}
