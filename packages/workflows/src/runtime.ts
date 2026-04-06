import { randomUUID } from "node:crypto";

import {
  persistBatchBriefSnapshot,
  persistProjectArtifact,
} from "@novel-harness/assets";
import { NovelHarnessRepository } from "@novel-harness/db";
import { computeWeightedScore, suggestGateDecision } from "@novel-harness/evaluation";
import type { ExecutorAdapter, ExecutorResult, RunContract } from "@novel-harness/executors";
import {
  reviewScorecardSchema,
  type ArtifactKind,
  type ArtifactManifest,
  type Batch,
  type FailureType,
  type GateDecision,
  type GateTask,
  type NodeName,
  type NodeRun,
  type Project,
  type ProjectStatus,
  type ReviewScorecard,
} from "@novel-harness/schemas";

import { defaultIncubationNodes } from "./definitions.js";

export interface RunIncubationProjectInput {
  rootDir: string;
  batchName: string;
  targetLane: string;
  audience: string;
  constraints: string[];
  projectTitle: string;
  batchId?: string;
  batchSlug?: string;
  projectId?: string;
  projectSlug?: string;
  goal?: string;
  autoApproveFinalGate?: boolean;
}

export interface RunIncubationProjectResult {
  batch: Batch;
  project: Project;
  nodeRuns: NodeRun[];
  artifacts: ArtifactManifest[];
  gates: GateTask[];
}

interface ArtifactState {
  manifest: ArtifactManifest;
  payload: unknown;
}

export class IncubationWorkflowRunner {
  constructor(
    private readonly repository: NovelHarnessRepository,
    private readonly executor: ExecutorAdapter,
  ) {}

  async runProject(
    input: RunIncubationProjectInput,
  ): Promise<RunIncubationProjectResult> {
    const now = new Date().toISOString();
    const batchId = input.batchId ?? randomUUID();
    const projectId = input.projectId ?? randomUUID();
    const batchSlug = input.batchSlug ?? safeSlug(input.batchName, batchId);
    const projectSlug =
      input.projectSlug ?? safeSlug(input.projectTitle, `project-${projectId.slice(0, 8)}`);

    let batch: Batch = {
      batchId,
      name: input.batchName,
      targetLane: input.targetLane,
      audience: input.audience,
      constraints: input.constraints,
      status: "queued",
      currentStage: "batch_brief",
      projectIds: [projectId],
      createdAt: now,
      updatedAt: now,
    };

    let project: Project = {
      projectId,
      slug: projectSlug,
      title: input.projectTitle,
      status: "candidate",
      stage: "batch_brief",
      batchId,
      bibleVersion: 0,
      latestScore: null,
      decision: null,
      createdAt: now,
      updatedAt: now,
    };

    await this.repository.saveBatch(batch);
    await this.repository.saveProject(project);

    const artifactState = new Map<ArtifactKind, ArtifactState>();
    const autoApproveFinalGate = input.autoApproveFinalGate ?? true;

    for (const node of defaultIncubationNodes) {
      const startedAt = new Date().toISOString();
      const inputRefs = node.inputKinds
        .map((kind) => artifactState.get(kind)?.manifest.path)
        .filter((value): value is string => Boolean(value));
      const runId = randomUUID();
      const roleName = node.roleNames[0];

      if (!roleName) {
        throw new Error(`Workflow node ${node.name} is missing a role binding.`);
      }

      let nodeRun: NodeRun = {
        runId,
        projectId,
        nodeName: node.name,
        roleName,
        executorId:
          node.name === "promotion_decision" ? "runtime-policy" : this.executor.id,
        status: "running",
        failureType: null,
        retryCount: 0,
        inputRefs,
        outputRefs: [],
        startedAt,
        completedAt: null,
      };

      await this.repository.saveNodeRun(nodeRun);

      batch = {
        ...batch,
        status: "running",
        currentStage: node.name,
        updatedAt: startedAt,
      };
      project = {
        ...project,
        status: "incubating",
        stage: node.name,
        updatedAt: startedAt,
      };

      await this.repository.saveBatch(batch);
      await this.repository.saveProject(project);

      try {
        const outcome =
          node.name === "batch_brief"
            ? await this.runBatchBriefNode({
                batch,
                project,
                projectSlug,
                batchSlug,
                runId,
                roleName,
                rootDir: input.rootDir,
                goal:
                  input.goal ??
                  `Incubate a commercially viable ${input.targetLane} project with strong opening retention.`,
              })
            : node.name === "promotion_decision"
              ? await this.runPromotionDecisionNode({
                  rootDir: input.rootDir,
                  project,
                  projectSlug,
                  runId,
                  scorecard: reviewScorecardSchema.parse(
                    artifactState.get("review_scorecard")?.payload,
                  ),
                })
              : await this.runExecutorNode({
                  rootDir: input.rootDir,
                  nodeName: node.name,
                  roleName,
                  project,
                  projectSlug,
                  runId,
                  taskBrief: buildTaskBrief(node.name, project.title, input.targetLane),
                  inputRefs,
                  constraints: input.constraints,
                });

        artifactState.set(outcome.primaryManifest.kind, {
          manifest: outcome.primaryManifest,
          payload: outcome.payload,
        });

        nodeRun = {
          ...nodeRun,
          status: "succeeded",
          outputRefs: outcome.outputRefs,
          completedAt: new Date().toISOString(),
        };
        await this.repository.saveNodeRun(nodeRun);

        if (node.name === "opening_review") {
          const scorecard = reviewScorecardSchema.parse(outcome.payload);
          project = {
            ...project,
            latestScore: computeWeightedScore(scorecard),
            updatedAt: new Date().toISOString(),
          };
          await this.repository.saveProject(project);
        }

        if (node.name === "promotion_decision") {
          const decision = extractDecision(outcome.payload);
          const gate = await this.createFinalGate({
            projectId,
            outputRefs: outcome.outputRefs,
            decision,
            autoApprove: autoApproveFinalGate,
          });
          await this.repository.saveGateTask(gate);

          project = {
            ...project,
            decision,
            status: autoApproveFinalGate
              ? mapDecisionToProjectStatus(decision)
              : "awaiting_gate",
            stage: autoApproveFinalGate ? "serial_ready" : "promotion_decision",
            updatedAt: new Date().toISOString(),
          };

          batch = {
            ...batch,
            status: autoApproveFinalGate ? "completed" : "awaiting_gate",
            currentStage: node.name,
            updatedAt: new Date().toISOString(),
          };

          await this.repository.saveProject(project);
          await this.repository.saveBatch(batch);
        }
      } catch (error) {
        const failureType =
          error instanceof WorkflowExecutionError
            ? error.failureType
            : "terminal";
        nodeRun = {
          ...nodeRun,
          status: "failed",
          failureType,
          completedAt: new Date().toISOString(),
        };
        await this.repository.saveNodeRun(nodeRun);

        project = {
          ...project,
          status: mapFailureToProjectStatus(failureType),
          updatedAt: new Date().toISOString(),
        };
        batch = {
          ...batch,
          status: failureType === "review_required" ? "awaiting_gate" : "failed",
          currentStage: node.name,
          updatedAt: new Date().toISOString(),
        };
        await this.repository.saveProject(project);
        await this.repository.saveBatch(batch);
        throw error;
      }
    }

    const [savedBatch, savedProject, nodeRuns, artifacts, gates] = await Promise.all([
      this.repository.getBatch(batchId),
      this.repository.getProject(projectId),
      this.repository.listNodeRunsForProject(projectId),
      this.repository.listArtifactsForProject(projectId),
      this.repository.listGateTasksForProject(projectId),
    ]);

    if (!savedBatch || !savedProject) {
      throw new Error("Workflow finished without persisted batch or project.");
    }

    return {
      batch: savedBatch,
      project: savedProject,
      nodeRuns,
      artifacts,
      gates,
    };
  }

  private async runBatchBriefNode(input: {
    rootDir: string;
    batch: Batch;
    project: Project;
    projectSlug: string;
    batchSlug: string;
    runId: string;
    roleName: string;
    goal: string;
  }) {
    const payload = {
      batchId: input.batch.batchId,
      batchName: input.batch.name,
      targetLane: input.batch.targetLane,
      audience: input.batch.audience,
      constraints: input.batch.constraints,
      goal: input.goal,
    };

    const [batchSnapshotPath, artifact, traceArtifact] = await Promise.all([
      persistBatchBriefSnapshot({
        rootDir: input.rootDir,
        batchSlug: input.batchSlug,
        payload,
      }),
      persistProjectArtifact({
        rootDir: input.rootDir,
        projectId: input.project.projectId,
        projectSlug: input.projectSlug,
        artifactKind: "batch_brief",
        payload,
        producer: input.roleName,
        sourceRunId: input.runId,
      }),
      persistProjectArtifact({
        rootDir: input.rootDir,
        projectId: input.project.projectId,
        projectSlug: input.projectSlug,
        artifactKind: "trace_log",
        payload: {
          adapterId: "runtime-seed",
          modelId: "seed-data",
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          metrics: {},
          status: "succeeded",
        },
        producer: "runtime-seed",
        sourceRunId: input.runId,
      }),
    ]);

    await this.repository.saveArtifactManifest(artifact.manifest);
    await this.repository.saveArtifactManifest(traceArtifact.manifest);

    return {
      payload,
      primaryManifest: artifact.manifest,
      outputRefs: [batchSnapshotPath, artifact.contentPath, traceArtifact.contentPath],
    };
  }

  private async runExecutorNode(input: {
    rootDir: string;
    nodeName: NodeName;
    roleName: RunContract["roleName"];
    project: Project;
    projectSlug: string;
    runId: string;
    taskBrief: string;
    inputRefs: string[];
    constraints: string[];
  }) {
    const result = await this.executor.run({
      projectId: input.project.projectId,
      nodeName: input.nodeName,
      roleName: input.roleName,
      taskBrief: input.taskBrief,
      contextRefs: input.inputRefs,
      constraints: input.constraints,
      outputSchemaName: input.nodeName,
    });

    if (result.status === "failed") {
      throw new WorkflowExecutionError(
        result.errorMessage ?? `Executor failed on ${input.nodeName}.`,
        result.failureType ?? "terminal",
      );
    }

    const artifactKind = mapNodeToArtifactKind(input.nodeName);
    const artifact = await persistProjectArtifact({
      rootDir: input.rootDir,
      projectId: input.project.projectId,
      projectSlug: input.projectSlug,
      artifactKind,
      payload: result.artifact,
      producer: input.roleName,
      sourceRunId: input.runId,
    });
    const traceArtifact = await persistProjectArtifact({
      rootDir: input.rootDir,
      projectId: input.project.projectId,
      projectSlug: input.projectSlug,
      artifactKind: "trace_log",
      payload: {
        ...result.trace,
        metrics: result.metrics,
        status: result.status,
      },
      producer: this.executor.id,
      sourceRunId: input.runId,
    });

    await this.repository.saveArtifactManifest(artifact.manifest);
    await this.repository.saveArtifactManifest(traceArtifact.manifest);

    return {
      payload: result.artifact,
      primaryManifest: artifact.manifest,
      outputRefs: [artifact.contentPath, traceArtifact.contentPath],
    };
  }

  private async runPromotionDecisionNode(input: {
    rootDir: string;
    project: Project;
    projectSlug: string;
    runId: string;
    scorecard: ReviewScorecard;
  }) {
    const weightedScore = computeWeightedScore(input.scorecard);
    const decision = suggestGateDecision(input.scorecard);
    const payload = {
      decision,
      weightedScore,
      rationale: `Auto-generated from weighted score ${weightedScore} and scorecard suggestion ${input.scorecard.decisionSuggestion}.`,
      riskFlags: input.scorecard.riskFlags,
    };

    const artifact = await persistProjectArtifact({
      rootDir: input.rootDir,
      projectId: input.project.projectId,
      projectSlug: input.projectSlug,
      artifactKind: "decision_record",
      payload,
      producer: "runtime-policy",
      sourceRunId: input.runId,
    });
    const traceArtifact = await persistProjectArtifact({
      rootDir: input.rootDir,
      projectId: input.project.projectId,
      projectSlug: input.projectSlug,
      artifactKind: "trace_log",
      payload: {
        adapterId: "runtime-policy",
        modelId: "deterministic-policy",
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        metrics: {
          weightedScore,
        },
        status: "succeeded",
      },
      producer: "runtime-policy",
      sourceRunId: input.runId,
    });

    await this.repository.saveArtifactManifest(artifact.manifest);
    await this.repository.saveArtifactManifest(traceArtifact.manifest);

    return {
      payload,
      primaryManifest: artifact.manifest,
      outputRefs: [artifact.contentPath, traceArtifact.contentPath],
    };
  }

  private createFinalGate(input: {
    projectId: string;
    outputRefs: string[];
    decision: GateDecision;
    autoApprove: boolean;
  }): Promise<GateTask> {
    const now = new Date().toISOString();
    return Promise.resolve({
      gateId: randomUUID(),
      projectId: input.projectId,
      gateType: "promotion_approval",
      status: input.autoApprove ? "approved" : "pending",
      payloadRefs: input.outputRefs,
      approvedBy: input.autoApprove ? "system:auto" : null,
      decision: input.autoApprove ? input.decision : null,
      createdAt: now,
      updatedAt: now,
    });
  }
}

class WorkflowExecutionError extends Error {
  constructor(
    message: string,
    readonly failureType: FailureType,
  ) {
    super(message);
  }
}

function buildTaskBrief(nodeName: NodeName, projectTitle: string, targetLane: string) {
  return `Node ${nodeName}: advance project "${projectTitle}" as a ${targetLane} serial candidate.`;
}

function safeSlug(input: string, fallback: string) {
  const normalized = input
    .toLowerCase()
    .trim()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");

  return normalized.length > 0 ? normalized : fallback;
}

function mapNodeToArtifactKind(nodeName: NodeName): ArtifactKind {
  switch (nodeName) {
    case "idea_spread":
      return "idea_card";
    case "concept_pack":
      return "concept_pack";
    case "opening_draft":
      return "opening_draft";
    case "opening_review":
      return "review_scorecard";
    case "promotion_decision":
      return "decision_record";
    default:
      return "batch_brief";
  }
}

function extractDecision(payload: unknown): GateDecision {
  const parsed = payload as { decision?: GateDecision };
  return parsed.decision ?? "retry";
}

function mapDecisionToProjectStatus(decision: GateDecision): ProjectStatus {
  switch (decision) {
    case "approve":
      return "promoted";
    case "kill":
      return "killed";
    default:
      return "retrying";
  }
}

function mapFailureToProjectStatus(failureType: FailureType) {
  switch (failureType) {
    case "review_required":
      return "awaiting_gate";
    case "terminal":
      return "killed";
    default:
      return "retrying";
  }
}
