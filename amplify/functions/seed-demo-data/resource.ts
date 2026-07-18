import { defineFunction } from '@aws-amplify/backend';

/** Admin-only function that inserts historical demo use cases with pre-authored
 *  AI decision cards and human decisions (§10, §17). No Bedrock calls, so seeding
 *  is free, deterministic, and always demo-ready (§14.3). */
export const seedDemoData = defineFunction({
  name: 'seed-demo-data',
  entry: './handler.ts',
  timeoutSeconds: 60,
  memoryMB: 128,
});
