import { z } from "zod";

export const nodeNameValues = [
  "batch_brief",
  "idea_spread",
  "concept_pack",
  "opening_draft",
  "opening_review",
  "promotion_decision",
] as const;

export const roleNameValues = [
  "trend_scout",
  "trope_mixer",
  "positioning_editor",
  "concept_packer",
  "opening_drafter",
  "hook_surgeon",
  "market_reviewer",
  "story_critic",
  "promotion_judge",
] as const;

export const artifactKindValues = [
  "batch_brief",
  "idea_card",
  "concept_pack",
  "opening_draft",
  "review_scorecard",
  "decision_record",
  "project_bible",
  "trace_log",
  "prompt_snapshot",
] as const;

export const batchStatusSchema = z.enum([
  "draft",
  "queued",
  "running",
  "awaiting_gate",
  "completed",
  "archived",
  "failed",
]);

export const projectStatusSchema = z.enum([
  "candidate",
  "incubating",
  "awaiting_gate",
  "promoted",
  "retrying",
  "killed",
  "archived",
]);

export const nodeNameSchema = z.enum(nodeNameValues);
export const roleNameSchema = z.enum(roleNameValues);
export const artifactKindSchema = z.enum(artifactKindValues);

export const projectStageSchema = z.enum([
  ...nodeNameValues,
  "serial_ready",
  "archived",
]);

export const failureTypeSchema = z.enum([
  "retryable",
  "repairable",
  "review_required",
  "terminal",
]);

export const gateTypeSchema = z.enum([
  "shortlist_review",
  "promotion_approval",
]);

export const gateDecisionSchema = z.enum([
  "approve",
  "revise",
  "retry",
  "kill",
]);

const idSchema = z.string().min(1);
const isoTimeSchema = z.string().min(1);

export const batchSchema = z.object({
  batchId: idSchema,
  name: z.string().min(1),
  targetLane: z.string().min(1),
  audience: z.string().min(1),
  constraints: z.array(z.string().min(1)).default([]),
  status: batchStatusSchema,
  currentStage: nodeNameSchema,
  projectIds: z.array(idSchema).default([]),
  createdAt: isoTimeSchema,
  updatedAt: isoTimeSchema,
});

export const projectSchema = z.object({
  projectId: idSchema,
  slug: z.string().min(1),
  title: z.string().min(1),
  status: projectStatusSchema,
  stage: projectStageSchema,
  batchId: idSchema,
  bibleVersion: z.number().int().nonnegative(),
  latestScore: z.number().min(0).max(100).nullable(),
  decision: gateDecisionSchema.nullable(),
  createdAt: isoTimeSchema,
  updatedAt: isoTimeSchema,
});

export const nodeRunSchema = z.object({
  runId: idSchema,
  projectId: idSchema,
  nodeName: nodeNameSchema,
  roleName: roleNameSchema,
  executorId: z.string().min(1),
  status: z.enum(["queued", "running", "succeeded", "failed"]),
  failureType: failureTypeSchema.nullable(),
  retryCount: z.number().int().nonnegative(),
  inputRefs: z.array(z.string().min(1)).default([]),
  outputRefs: z.array(z.string().min(1)).default([]),
  startedAt: isoTimeSchema,
  completedAt: isoTimeSchema.nullable(),
});

export const artifactManifestSchema = z.object({
  artifactId: idSchema,
  projectId: idSchema,
  kind: artifactKindSchema,
  path: z.string().min(1),
  version: z.number().int().positive(),
  producer: z.string().min(1),
  sourceRunId: idSchema,
  createdAt: isoTimeSchema,
});

export const reviewScorecardSchema = z.object({
  hookScore: z.number().min(0).max(100),
  retentionScore: z.number().min(0).max(100),
  noveltyScore: z.number().min(0).max(100),
  proseScore: z.number().min(0).max(100),
  serialPotentialScore: z.number().min(0).max(100),
  riskFlags: z.array(z.string().min(1)).default([]),
  notes: z.string().min(1),
  decisionSuggestion: gateDecisionSchema,
});

export const gateTaskSchema = z.object({
  gateId: idSchema,
  projectId: idSchema,
  gateType: gateTypeSchema,
  status: z.enum(["pending", "approved", "rejected"]),
  payloadRefs: z.array(z.string().min(1)).default([]),
  approvedBy: z.string().min(1).nullable(),
  decision: gateDecisionSchema.nullable(),
  createdAt: isoTimeSchema,
  updatedAt: isoTimeSchema,
});

export type Batch = z.infer<typeof batchSchema>;
export type BatchStatus = z.infer<typeof batchStatusSchema>;
export type Project = z.infer<typeof projectSchema>;
export type ProjectStatus = z.infer<typeof projectStatusSchema>;
export type ProjectStage = z.infer<typeof projectStageSchema>;
export type NodeName = z.infer<typeof nodeNameSchema>;
export type RoleName = z.infer<typeof roleNameSchema>;
export type ArtifactKind = z.infer<typeof artifactKindSchema>;
export type FailureType = z.infer<typeof failureTypeSchema>;
export type GateType = z.infer<typeof gateTypeSchema>;
export type GateDecision = z.infer<typeof gateDecisionSchema>;
export type NodeRun = z.infer<typeof nodeRunSchema>;
export type ArtifactManifest = z.infer<typeof artifactManifestSchema>;
export type ReviewScorecard = z.infer<typeof reviewScorecardSchema>;
export type GateTask = z.infer<typeof gateTaskSchema>;
