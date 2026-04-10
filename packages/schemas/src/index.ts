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

export const workflowRunStatusSchema = z.enum([
  "queued",
  "running",
  "awaiting_review",
  "succeeded",
  "failed",
  "rolled_back",
]);

export const runStepStatusSchema = z.enum([
  "pending",
  "ready",
  "running",
  "blocked",
  "awaiting_review",
  "succeeded",
  "failed",
  "skipped",
  "rolled_back",
  "reused_from_checkpoint",
]);

export const checkpointStatusSchema = z.enum([
  "ready",
  "consumed",
  "superseded",
]);

export const runActionTypeSchema = z.enum([
  "workflow_started",
  "workflow_completed",
  "workflow_failed",
  "stage_started",
  "stage_completed",
  "stage_failed",
  "checkpoint_created",
  "resume_from_checkpoint",
  "skip_stage",
  "rollback_to_checkpoint",
  "gate_recorded",
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

export const workflowRunSchema = z.object({
  workflowRunId: idSchema,
  projectId: idSchema,
  batchId: idSchema,
  workflowName: z.string().min(1),
  status: workflowRunStatusSchema,
  currentStage: nodeNameSchema.nullable(),
  latestCheckpointId: idSchema.nullable(),
  parentWorkflowRunId: idSchema.nullable(),
  sourceCheckpointId: idSchema.nullable(),
  startedAt: isoTimeSchema,
  completedAt: isoTimeSchema.nullable(),
});

export const stageRunSchema = z.object({
  stageRunId: idSchema,
  workflowRunId: idSchema,
  projectId: idSchema,
  nodeName: nodeNameSchema,
  attempt: z.number().int().positive(),
  status: runStepStatusSchema,
  failureType: failureTypeSchema.nullable(),
  startedAt: isoTimeSchema.nullable(),
  completedAt: isoTimeSchema.nullable(),
});

export const taskRunSchema = z.object({
  taskRunId: idSchema,
  workflowRunId: idSchema,
  stageRunId: idSchema,
  projectId: idSchema,
  nodeName: nodeNameSchema,
  roleName: roleNameSchema,
  executorId: z.string().min(1),
  attempt: z.number().int().positive(),
  status: runStepStatusSchema,
  failureType: failureTypeSchema.nullable(),
  inputRefs: z.array(z.string().min(1)).default([]),
  outputRefs: z.array(z.string().min(1)).default([]),
  reusedFromCheckpointId: idSchema.nullable(),
  startedAt: isoTimeSchema.nullable(),
  completedAt: isoTimeSchema.nullable(),
});

export const checkpointSchema = z.object({
  checkpointId: idSchema,
  workflowRunId: idSchema,
  projectId: idSchema,
  stageRunId: idSchema,
  nodeName: nodeNameSchema,
  status: checkpointStatusSchema,
  artifactId: idSchema.nullable(),
  createdAt: isoTimeSchema,
});

export const runActionSchema = z.object({
  actionId: idSchema,
  workflowRunId: idSchema,
  projectId: idSchema,
  actionType: runActionTypeSchema,
  actor: z.string().min(1),
  reason: z.string().min(1).nullable(),
  targetNodeName: nodeNameSchema.nullable(),
  targetStageRunId: idSchema.nullable(),
  targetTaskRunId: idSchema.nullable(),
  checkpointId: idSchema.nullable(),
  payload: z.record(z.string(), z.unknown()).default({}),
  createdAt: isoTimeSchema,
});

export const batchBriefArtifactSchema = z.object({
  batchId: idSchema,
  batchName: z.string().min(1),
  targetLane: z.string().min(1),
  audience: z.string().min(1),
  constraints: z.array(z.string().min(1)).default([]),
  goal: z.string().min(1),
});

export const ideaCandidateSchema = z.object({
  title: z.string().min(1),
  hook: z.string().min(1),
  premise: z.string().min(1),
  differentiator: z.string().min(1),
});

export const ideaSpreadArtifactSchema = z.object({
  candidates: z.array(ideaCandidateSchema).min(1),
});

export const conceptPackArtifactSchema = z.object({
  title: z.string().min(1),
  tagline: z.string().min(1),
  premise: z.string().min(1),
  synopsis: z.string().min(1),
  protagonist: z.string().min(1),
  stakes: z.string().min(1),
  worldRules: z.array(z.string().min(1)).min(1),
  openingPromise: z.array(z.string().min(1)).min(1),
});

export const openingChapterSchema = z.object({
  chapterNumber: z.number().int().positive(),
  title: z.string().min(1),
  body: z.string().min(1),
});

export const openingDraftArtifactSchema = z.object({
  chapters: z.array(openingChapterSchema).min(1),
});

export const promotionDecisionArtifactSchema = z.object({
  decision: gateDecisionSchema,
  weightedScore: z.number().min(0).max(100),
  rationale: z.string().min(1),
  riskFlags: z.array(z.string().min(1)).default([]),
});

export const traceLogSchema = z.object({
  adapterId: z.string().min(1),
  modelId: z.string().min(1),
  startedAt: isoTimeSchema,
  completedAt: isoTimeSchema,
  rawOutputRef: z.string().min(1).optional(),
  usage: z
    .object({
      inputTokens: z.number().int().nonnegative().optional(),
      outputTokens: z.number().int().nonnegative().optional(),
    })
    .optional(),
  metrics: z.record(z.string(), z.number()),
  status: z.enum(["succeeded", "failed"]),
  failureType: failureTypeSchema.optional(),
  errorMessage: z.string().optional(),
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
export type WorkflowRunStatus = z.infer<typeof workflowRunStatusSchema>;
export type RunStepStatus = z.infer<typeof runStepStatusSchema>;
export type CheckpointStatus = z.infer<typeof checkpointStatusSchema>;
export type RunActionType = z.infer<typeof runActionTypeSchema>;
export type NodeRun = z.infer<typeof nodeRunSchema>;
export type ArtifactManifest = z.infer<typeof artifactManifestSchema>;
export type ReviewScorecard = z.infer<typeof reviewScorecardSchema>;
export type GateTask = z.infer<typeof gateTaskSchema>;
export type WorkflowRun = z.infer<typeof workflowRunSchema>;
export type StageRun = z.infer<typeof stageRunSchema>;
export type TaskRun = z.infer<typeof taskRunSchema>;
export type Checkpoint = z.infer<typeof checkpointSchema>;
export type RunAction = z.infer<typeof runActionSchema>;
export type BatchBriefArtifact = z.infer<typeof batchBriefArtifactSchema>;
export type IdeaCandidate = z.infer<typeof ideaCandidateSchema>;
export type IdeaSpreadArtifact = z.infer<typeof ideaSpreadArtifactSchema>;
export type ConceptPackArtifact = z.infer<typeof conceptPackArtifactSchema>;
export type OpeningChapter = z.infer<typeof openingChapterSchema>;
export type OpeningDraftArtifact = z.infer<typeof openingDraftArtifactSchema>;
export type PromotionDecisionArtifact = z.infer<
  typeof promotionDecisionArtifactSchema
>;
export type TraceLog = z.infer<typeof traceLogSchema>;
