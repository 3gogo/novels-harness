import { mkdir } from "node:fs/promises";
import path from "node:path";

import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";

import * as schema from "./schema.js";

export type HarnessDatabase = LibSQLDatabase<typeof schema>;

export interface DatabaseHandle {
  client: Client;
  db: HarnessDatabase;
  close(): Promise<void>;
}

export async function createDatabaseHandle(
  databaseFilePath: string,
): Promise<DatabaseHandle> {
  await mkdir(path.dirname(databaseFilePath), { recursive: true });

  const client = createClient({
    url: `file:${databaseFilePath}`,
  });

  await bootstrapDatabase(client);

  return {
    client,
    db: drizzle(client, { schema }),
    async close() {
      client.close();
      await new Promise((resolve) => setTimeout(resolve, 25));
    },
  };
}

async function bootstrapDatabase(client: Client) {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS batches (
      batch_id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      target_lane TEXT NOT NULL,
      audience TEXT NOT NULL,
      constraints_json TEXT NOT NULL,
      status TEXT NOT NULL,
      current_stage TEXT NOT NULL,
      project_ids_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS projects (
      project_id TEXT PRIMARY KEY NOT NULL,
      slug TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      stage TEXT NOT NULL,
      batch_id TEXT NOT NULL,
      bible_version INTEGER NOT NULL,
      latest_score REAL,
      decision TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS node_runs (
      run_id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL,
      node_name TEXT NOT NULL,
      role_name TEXT NOT NULL,
      executor_id TEXT NOT NULL,
      status TEXT NOT NULL,
      failure_type TEXT,
      retry_count INTEGER NOT NULL,
      input_refs_json TEXT NOT NULL,
      output_refs_json TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS artifact_manifests (
      artifact_id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      path TEXT NOT NULL,
      version INTEGER NOT NULL,
      producer TEXT NOT NULL,
      source_run_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS gate_tasks (
      gate_id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL,
      gate_type TEXT NOT NULL,
      status TEXT NOT NULL,
      payload_refs_json TEXT NOT NULL,
      approved_by TEXT,
      decision TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS workflow_runs (
      workflow_run_id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL,
      batch_id TEXT NOT NULL,
      workflow_name TEXT NOT NULL,
      status TEXT NOT NULL,
      current_stage TEXT,
      latest_checkpoint_id TEXT,
      parent_workflow_run_id TEXT,
      source_checkpoint_id TEXT,
      started_at TEXT NOT NULL,
      completed_at TEXT
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS stage_runs (
      stage_run_id TEXT PRIMARY KEY NOT NULL,
      workflow_run_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      node_name TEXT NOT NULL,
      attempt INTEGER NOT NULL,
      status TEXT NOT NULL,
      failure_type TEXT,
      started_at TEXT,
      completed_at TEXT
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS task_runs (
      task_run_id TEXT PRIMARY KEY NOT NULL,
      workflow_run_id TEXT NOT NULL,
      stage_run_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      node_name TEXT NOT NULL,
      role_name TEXT NOT NULL,
      executor_id TEXT NOT NULL,
      attempt INTEGER NOT NULL,
      status TEXT NOT NULL,
      failure_type TEXT,
      input_refs_json TEXT NOT NULL,
      output_refs_json TEXT NOT NULL,
      reused_from_checkpoint_id TEXT,
      started_at TEXT,
      completed_at TEXT
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS checkpoints (
      checkpoint_id TEXT PRIMARY KEY NOT NULL,
      workflow_run_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      stage_run_id TEXT NOT NULL,
      node_name TEXT NOT NULL,
      status TEXT NOT NULL,
      artifact_id TEXT,
      created_at TEXT NOT NULL
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS run_actions (
      action_id TEXT PRIMARY KEY NOT NULL,
      workflow_run_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      action_type TEXT NOT NULL,
      actor TEXT NOT NULL,
      reason TEXT,
      target_node_name TEXT,
      target_stage_run_id TEXT,
      target_task_run_id TEXT,
      checkpoint_id TEXT,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
}
