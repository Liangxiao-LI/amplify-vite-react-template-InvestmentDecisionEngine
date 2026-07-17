import { client } from './amplify-client';
import type { Schema } from '../../amplify/data/resource';

/**
 * Admin operations: platform configuration (active model + feature flag) and
 * demo data seeding. All are authorized to the ADMIN group in the data model
 * (architecture.md §7); the UI here is a convenience, not the security boundary.
 */

const CONFIG_ID = 'GLOBAL';

export type PlatformConfig = Schema['PlatformConfig']['type'];

export async function getPlatformConfig(): Promise<PlatformConfig | null> {
  const { data } = await client.models.PlatformConfig.get({ id: CONFIG_ID });
  return data ?? null;
}

/** Create the singleton config row if it does not exist yet. */
async function ensureConfig(): Promise<void> {
  const existing = await getPlatformConfig();
  if (!existing) {
    await client.models.PlatformConfig.create({ id: CONFIG_ID, evaluationsEnabled: true });
  }
}

export async function setActiveModel(modelId: string, adminId: string): Promise<string | null> {
  await ensureConfig();
  const { errors } = await client.models.PlatformConfig.update({
    id: CONFIG_ID,
    activeModelId: modelId,
    updatedBy: adminId,
  });
  return errors?.length ? errors[0].message : null;
}

export async function setEvaluationsEnabled(
  enabled: boolean,
  adminId: string,
): Promise<string | null> {
  await ensureConfig();
  const { errors } = await client.models.PlatformConfig.update({
    id: CONFIG_ID,
    evaluationsEnabled: enabled,
    updatedBy: adminId,
  });
  return errors?.length ? errors[0].message : null;
}

export async function seedDemoData(): Promise<{ seeded: number; message: string } | { error: string }> {
  const { data, errors } = await client.mutations.seedDemoData();
  if (errors?.length) return { error: errors[0].message };
  const result = (typeof data === 'string' ? JSON.parse(data) : data) as {
    seeded: number;
    message: string;
  } | null;
  return result ?? { error: 'No response from the seed service.' };
}
