import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const batchesTable = sqliteTable("batches", {
  batchId: text("batch_id").primaryKey(),
  name: text("name").notNull(),
  targetLane: text("target_lane").notNull(),
  audience: text("audience").notNull(),
  constraintsJson: text("constraints_json").notNull(),
  status: text("status").notNull(),
  currentStage: text("current_stage").notNull(),
  projectIdsJson: text("project_ids_json").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const projectsTable = sqliteTable("projects", {
  projectId: text("project_id").primaryKey(),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  status: text("status").notNull(),
  stage: text("stage").notNull(),
  batchId: text("batch_id").notNull(),
  bibleVersion: integer("bible_version").notNull(),
  latestScore: real("latest_score"),
  decision: text("decision"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const nodeRunsTable = sqliteTable("node_runs", {
  runId: text("run_id").primaryKey(),
  projectId: text("project_id").notNull(),
  nodeName: text("node_name").notNull(),
  roleName: text("role_name").notNull(),
  executorId: text("executor_id").notNull(),
  status: text("status").notNull(),
  failureType: text("failure_type"),
  retryCount: integer("retry_count").notNull(),
  inputRefsJson: text("input_refs_json").notNull(),
  outputRefsJson: text("output_refs_json").notNull(),
  startedAt: text("started_at").notNull(),
  completedAt: text("completed_at"),
});

export const artifactManifestsTable = sqliteTable("artifact_manifests", {
  artifactId: text("artifact_id").primaryKey(),
  projectId: text("project_id").notNull(),
  kind: text("kind").notNull(),
  path: text("path").notNull(),
  version: integer("version").notNull(),
  producer: text("producer").notNull(),
  sourceRunId: text("source_run_id").notNull(),
  createdAt: text("created_at").notNull(),
});

export const gateTasksTable = sqliteTable("gate_tasks", {
  gateId: text("gate_id").primaryKey(),
  projectId: text("project_id").notNull(),
  gateType: text("gate_type").notNull(),
  status: text("status").notNull(),
  payloadRefsJson: text("payload_refs_json").notNull(),
  approvedBy: text("approved_by"),
  decision: text("decision"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
