#!/usr/bin/env bash
#
# Create demo users in the deployed Cognito user pool and assign their roles.
#
# Prerequisites:
#   - The backend is deployed (ampx sandbox / pipeline-deploy) so that
#     amplify_outputs.json and the ADMIN / REVIEWER / REQUESTER groups exist.
#   - AWS CLI is configured with credentials for the SAME account/region.
#
# Usage:
#   bash scripts/seed-users.sh
#
# Idempotent-ish: re-running resets each user's password and group membership;
# "user already exists" is treated as non-fatal.

set -uo pipefail

OUTPUTS="${AMPLIFY_OUTPUTS:-amplify_outputs.json}"

if [ ! -f "$OUTPUTS" ]; then
  echo "ERROR: $OUTPUTS not found. Deploy the backend first (ampx sandbox)." >&2
  exit 1
fi

# Parse pool id + region from amplify_outputs.json using node (always present here).
USER_POOL_ID="$(node -e "console.log(require('./${OUTPUTS}').auth.user_pool_id)")"
REGION="$(node -e "console.log(require('./${OUTPUTS}').auth.aws_region)")"

if [ -z "$USER_POOL_ID" ] || [ "$USER_POOL_ID" = "undefined" ]; then
  echo "ERROR: could not read auth.user_pool_id from $OUTPUTS." >&2
  exit 1
fi

echo "User pool: $USER_POOL_ID  (region: $REGION)"
echo

# email | password | group
USERS=(
  "admin@example.com|Demo!Admin2026|ADMIN"
  "reviewer@example.com|Demo!Review2026|REVIEWER"
  "requester1@example.com|Demo!User2026|REQUESTER"
  "requester2@example.com|Demo!User2026|REQUESTER"
)

for entry in "${USERS[@]}"; do
  IFS='|' read -r EMAIL PASSWORD GROUP <<< "$entry"
  echo "==> $EMAIL ($GROUP)"

  # Create the user with a verified email and no invite email.
  aws cognito-idp admin-create-user \
    --region "$REGION" \
    --user-pool-id "$USER_POOL_ID" \
    --username "$EMAIL" \
    --message-action SUPPRESS \
    --user-attributes Name=email,Value="$EMAIL" Name=email_verified,Value=true \
    >/dev/null 2>&1 && echo "   created" || echo "   exists (continuing)"

  # Set a permanent password so there is no forced-change prompt.
  aws cognito-idp admin-set-user-password \
    --region "$REGION" \
    --user-pool-id "$USER_POOL_ID" \
    --username "$EMAIL" \
    --password "$PASSWORD" \
    --permanent \
    >/dev/null 2>&1 && echo "   password set" || echo "   WARN: password not set"

  # Add to the role group.
  aws cognito-idp admin-add-user-to-group \
    --region "$REGION" \
    --user-pool-id "$USER_POOL_ID" \
    --username "$EMAIL" \
    --group-name "$GROUP" \
    >/dev/null 2>&1 && echo "   added to $GROUP" || echo "   WARN: could not add to $GROUP"

  echo
done

echo "Done. Demo credentials:"
printf '  %-26s %-16s %s\n' "EMAIL" "PASSWORD" "ROLE"
for entry in "${USERS[@]}"; do
  IFS='|' read -r EMAIL PASSWORD GROUP <<< "$entry"
  printf '  %-26s %-16s %s\n' "$EMAIL" "$PASSWORD" "$GROUP"
done
