import { defineFunction } from '@aws-amplify/backend';

/**
 * Admin-only function that inserts historical demo use cases with
 * pre-authored AI decision cards and human decisions (architecture.md §10
 * seed-demo-data, §17 seeded scenarios). It does NOT call Bedrock, so seeding
 * is free, deterministic, and always demo-ready (§14.3).
 */
export const seedDemoData = defineFunction({
  name: 'seed-demo-data',
  entry: './handler.ts',
  timeoutSeconds: 60,
  memoryMB: 256,
});
