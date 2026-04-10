import { randomUUID } from "node:crypto";

import {
  persistBatchBriefSnapshot,
  persistProjectArtifact,
  readJsonArtifact,
} from "@novel-harness/assets";
import { NovelHarnessRepository } from "@novel-harness/db";
import { computeWeightedScore, suggestGateDecision } from "@novel-harness/evaluation";
import type { ExecutorAdapter, RunContract } from "@novel-harness/executors";
import {
  reviewScorecardSchema,
  type ArtifactKind,
  type ArtifactManifest,
  type Batch,
  type Checkpoint,
  type FailureType,
  type GateDecision,
  type GateTask,
  type NodeName,
  type NodeRun,
  type Project,
  type ProjectStatus,
  type ReviewScorecard,
  type RunAction,
  type RunActionType,
  type RunStepStatus,
  type StageRun,
  type TaskRun,
  type WorkflowRun,
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

export interface ResumeWorkflowFromCheckpointInput {
  rootDir: string;
  checkpointId: string;
  sourceWorkflowRunId?: string;
  startNodeName?: NodeName;
  goal?: string;
  autoApproveFinalGate?: boolean;
}

export interface RunIncubationProjectResult {
  batch: Batch;
  project: Project;
  workflowRun: WorkflowRun;
  stageRuns: StageRun[];
  taskRuns: TaskRun[];
  checkpoints: Checkpoint[];
  runActions: RunAction[];
  nodeRuns: NodeRun[];
  artifacts: ArtifactManifest[];
  gates: GateTask[];
}

interface ArtifactState {
  manifest: ArtifactManifest;
  payload: unknown;
}

interface PlannedStageExecution {
  stageRun: StageRun;
  taskRun: TaskRun;
}

interface ResumePlanResult {
  artifactState: Map<ArtifactKind, ArtifactState>;
  plans: PlannedStageExecution[];
  copiedCheckpoints: Checkpoint[];
  latestCheckpointId: string | null;
}

interface ExecuteWorkflowInput {
  rootDir: string;
  batch: Batch;
  project: Project;
  workflowRun: WorkflowRun;
  plannedStages: PlannedStageExecution[];
  artifactState: Map<ArtifactKind, ArtifactState>;
  batchSlug: string;
  projectSlug: string;
  constraints: string[];
  goal: string;
  autoApproveFinalGate: boolean;
  startIndex: number;
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
    const workflowRunId = randomUUID();
    const batchSlug = input.batchSlug ?? safeSlug(input.batchName, batchId);
    const projectSlug =
      input.projectSlug ?? safeSlug(input.projectTitle, `project-${projectId.slice(0, 8)}`);

    const batch: Batch = {
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

    const project: Project = {
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

    const workflowRun: WorkflowRun = {
      workflowRunId,
      projectId,
      batchId,
      workflowName: "incubation",
      status: "queued",
      currentStage: "batch_brief",
      latestCheckpointId: null,
      parentWorkflowRunId: null,
      sourceCheckpointId: null,
      startedAt: now,
      completedAt: null,
    };

    const plannedStages = this.createInitialPlannedStages({
      workflowRunId,
      projectId,
    });

    await this.repository.saveBatch(batch);
    await this.repository.saveProject(project);
    await this.repository.saveWorkflowRun(workflowRun);
    await this.persistPlannedStages(plannedStages);
    await this.recordRunAction({
      workflowRunId,
      projectId,
      actionType: "workflow_started",
      actor: "system:runtime",
      reason: null,
      targetNodeName: null,
      targetStageRunId: null,
      targetTaskRunId: null,
      checkpointId: null,
      payload: {
        workflowName: "incubation",
      },
      createdAt: now,
    });

    return this.executeWorkflow({
      rootDir: input.rootDir,
      batch,
      project,
      workflowRun,
      plannedStages,
      artifactState: new Map<ArtifactKind, ArtifactState>(),
      batchSlug,
      projectSlug,
      constraints: input.constraints,
      goal: input.goal ?? defaultGoalForLane(input.targetLane),
      autoApproveFinalGate: input.autoApproveFinalGate ?? true,
      startIndex: 0,
    });
  }

  async resumeFromCheckpoint(
    input: ResumeWorkflowFromCheckpointInput,
  ): Promise<RunIncubationProjectResult> {
    const checkpoint = await this.repository.getCheckpoint(input.checkpointId);

    if (!checkpoint) {
      throw new Error("Checkpoint 不存在。");
    }

    if (checkpoint.status !== "ready") {
      throw new Error("Checkpoint 当前不可恢复。");
    }

    if (
      input.sourceWorkflowRunId &&
      checkpoint.workflowRunId !== input.sourceWorkflowRunId
    ) {
      throw new Error("Checkpoint 不属于当前选中的运行。");
    }

    const [sourceWorkflowRun, project, batch] = await Promise.all([
      this.repository.getWorkflowRun(checkpoint.workflowRunId),
      this.repository.getProject(checkpoint.projectId),
      this.repository.getProject(checkpoint.projectId).then((savedProject) =>
        savedProject ? this.repository.getBatch(savedProject.batchId) : null,
      ),
    ]);

    if (!sourceWorkflowRun || !project || !batch) {
      throw new Error("无法读取 checkpoint 对应的运行上下文。");
    }

    const startNodeName = input.startNodeName ?? checkpoint.nodeName;
    const startIndex = getNodeIndex(startNodeName);
    const now = new Date().toISOString();
    const workflowRunId = randomUUID();

    let workflowRun: WorkflowRun = {
      workflowRunId,
      projectId: project.projectId,
      batchId: batch.batchId,
      workflowName: sourceWorkflowRun.workflowName,
      status: "queued",
      currentStage: startNodeName,
      latestCheckpointId: null,
      parentWorkflowRunId: sourceWorkflowRun.workflowRunId,
      sourceCheckpointId: checkpoint.checkpointId,
      startedAt: now,
      completedAt: null,
    };

    const resumePlan = await this.createResumePlan({
      projectId: project.projectId,
      workflowRunId,
      startIndex,
      createdAt: now,
    });

    workflowRun = {
      ...workflowRun,
      latestCheckpointId: resumePlan.latestCheckpointId,
    };

    await this.repository.saveWorkflowRun(workflowRun);
    await this.persistPlannedStages(resumePlan.plans);
    await Promise.all(
      resumePlan.copiedCheckpoints.map((copiedCheckpoint) =>
        this.repository.saveCheckpoint(copiedCheckpoint),
      ),
    );
    await this.recordRunAction({
      workflowRunId,
      projectId: project.projectId,
      actionType: "workflow_started",
      actor: "system:runtime",
      reason: null,
      targetNodeName: startNodeName,
      targetStageRunId: getPlannedStage(resumePlan.plans, startIndex).stageRun.stageRunId,
      targetTaskRunId: getPlannedStage(resumePlan.plans, startIndex).taskRun.taskRunId,
      checkpointId: workflowRun.latestCheckpointId,
      payload: {
        workflowName: workflowRun.workflowName,
        mode: "resume",
      },
      createdAt: now,
    });
    await this.recordRunAction({
      workflowRunId,
      projectId: project.projectId,
      actionType: "resume_from_checkpoint",
      actor: "user:control-room",
      reason: `Resume from ${checkpoint.nodeName}.`,
      targetNodeName: startNodeName,
      targetStageRunId: getPlannedStage(resumePlan.plans, startIndex).stageRun.stageRunId,
      targetTaskRunId: getPlannedStage(resumePlan.plans, startIndex).taskRun.taskRunId,
      checkpointId: checkpoint.checkpointId,
      payload: {
        sourceWorkflowRunId: sourceWorkflowRun.workflowRunId,
        sourceCheckpointId: checkpoint.checkpointId,
        startNodeName,
      },
      createdAt: now,
    });

    return this.executeWorkflow({
      rootDir: input.rootDir,
      batch,
      project,
      workflowRun,
      plannedStages: resumePlan.plans,
      artifactState: resumePlan.artifactState,
      batchSlug: safeSlug(batch.name, batch.batchId),
      projectSlug: project.slug,
      constraints: batch.constraints,
      goal: input.goal ?? defaultGoalForLane(batch.targetLane),
      autoApproveFinalGate: input.autoApproveFinalGate ?? true,
      startIndex,
    });
  }

  private async executeWorkflow(
    input: ExecuteWorkflowInput,
  ): Promise<RunIncubationProjectResult> {
    let batch = input.batch;
    let project = input.project;
    let workflowRun = input.workflowRun;

    for (let index = input.startIndex; index < defaultIncubationNodes.length; index += 1) {
      const node = getWorkflowNode(index);
      const plan = getPlannedStage(input.plannedStages, index);
      const startedAt = new Date().toISOString();
      const inputRefs = node.inputKinds
        .map((kind) => input.artifactState.get(kind)?.manifest.path)
        .filter((value): value is string => Boolean(value));
      const runId = randomUUID();
      const roleName = plan.taskRun.roleName;

      let nodeRun: NodeRun = {
        runId,
        projectId: project.projectId,
        nodeName: node.name,
        roleName,
        executorId: this.getExecutorIdForNode(node.name),
        status: "running",
        failureType: null,
        retryCount: 0,
        inputRefs,
        outputRefs: [],
        startedAt,
        completedAt: null,
      };

      await this.repository.saveNodeRun(nodeRun);

      workflowRun = {
        ...workflowRun,
        status: "running",
        currentStage: node.name,
      };
      await this.repository.saveWorkflowRun(workflowRun);
      await this.updatePlannedExecution(input.plannedStages, index, {
        stageRun: {
          status: "running",
          failureType: null,
          startedAt,
          completedAt: null,
        },
        taskRun: {
          status: "running",
          failureType: null,
          inputRefs,
          outputRefs: [],
          startedAt,
          completedAt: null,
        },
      });
      await this.markDownstreamStages(input.plannedStages, index, "blocked");
      await this.recordRunAction({
        workflowRunId: workflowRun.workflowRunId,
        projectId: project.projectId,
        actionType: "stage_started",
        actor: "system:runtime",
        reason: null,
        targetNodeName: node.name,
        targetStageRunId: plan.stageRun.stageRunId,
        targetTaskRunId: plan.taskRun.taskRunId,
        checkpointId: workflowRun.latestCheckpointId,
        payload: {
          attempt: plan.stageRun.attempt,
          inputRefs,
        },
        createdAt: startedAt,
      });

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
                projectSlug: input.projectSlug,
                batchSlug: input.batchSlug,
                runId,
                roleName,
                rootDir: input.rootDir,
                goal: input.goal,
              })
            : node.name === "promotion_decision"
              ? await this.runPromotionDecisionNode({
                  rootDir: input.rootDir,
                  project,
                  projectSlug: input.projectSlug,
                  runId,
                  scorecard: reviewScorecardSchema.parse(
                    input.artifactState.get("review_scorecard")?.payload,
                  ),
                })
              : await this.runExecutorNode({
                  rootDir: input.rootDir,
                  nodeName: node.name,
                  roleName,
                  project,
                  projectSlug: input.projectSlug,
                  runId,
                  taskBrief: buildTaskBrief(node.name, project.title, batch.targetLane),
                  inputRefs,
                  constraints: input.constraints,
                });

        input.artifactState.set(outcome.primaryManifest.kind, {
          manifest: outcome.primaryManifest,
          payload: outcome.payload,
        });

        const completedAt = new Date().toISOString();
        nodeRun = {
          ...nodeRun,
          status: "succeeded",
          outputRefs: outcome.outputRefs,
          completedAt,
        };
        await this.repository.saveNodeRun(nodeRun);

        await this.updatePlannedExecution(input.plannedStages, index, {
          stageRun: {
            status: "succeeded",
            failureType: null,
            completedAt,
          },
          taskRun: {
            status: "succeeded",
            failureType: null,
            outputRefs: outcome.outputRefs,
            completedAt,
          },
        });
        await this.recordRunAction({
          workflowRunId: workflowRun.workflowRunId,
          projectId: project.projectId,
          actionType: "stage_completed",
          actor: "system:runtime",
          reason: null,
          targetNodeName: node.name,
          targetStageRunId: plan.stageRun.stageRunId,
          targetTaskRunId: plan.taskRun.taskRunId,
          checkpointId: workflowRun.latestCheckpointId,
          payload: {
            outputRefs: outcome.outputRefs,
          },
          createdAt: completedAt,
        });

        const checkpoint = await this.createCheckpoint({
          workflowRunId: workflowRun.workflowRunId,
          projectId: project.projectId,
          stageRunId: plan.stageRun.stageRunId,
          nodeName: node.name,
          artifactId: outcome.primaryManifest.artifactId,
          createdAt: completedAt,
        });
        workflowRun = {
          ...workflowRun,
          latestCheckpointId: checkpoint.checkpointId,
        };
        await this.repository.saveWorkflowRun(workflowRun);
        await this.updatePlannedExecution(input.plannedStages, index, {
          stageRun: {},
          taskRun: {
            reusedFromCheckpointId: null,
          },
        });
        await this.recordRunAction({
          workflowRunId: workflowRun.workflowRunId,
          projectId: project.projectId,
          actionType: "checkpoint_created",
          actor: "system:runtime",
          reason: null,
          targetNodeName: node.name,
          targetStageRunId: plan.stageRun.stageRunId,
          targetTaskRunId: plan.taskRun.taskRunId,
          checkpointId: checkpoint.checkpointId,
          payload: {
            artifactId: outcome.primaryManifest.artifactId,
          },
          createdAt: completedAt,
        });

        if (node.name === "opening_review") {
          const scorecard = reviewScorecardSchema.parse(outcome.payload);
          project = {
            ...project,
            latestScore: computeWeightedScore(scorecard),
            updatedAt: completedAt,
          };
          await this.repository.saveProject(project);
        }

        if (node.name === "promotion_decision") {
          const decision = extractDecision(outcome.payload);
          const gate = await this.createFinalGate({
            projectId: project.projectId,
            outputRefs: outcome.outputRefs,
            decision,
            autoApprove: input.autoApproveFinalGate,
          });
          await this.repository.saveGateTask(gate);
          await this.recordRunAction({
            workflowRunId: workflowRun.workflowRunId,
            projectId: project.projectId,
            actionType: "gate_recorded",
            actor: gate.approvedBy ?? "system:gate",
            reason: null,
            targetNodeName: node.name,
            targetStageRunId: plan.stageRun.stageRunId,
            targetTaskRunId: plan.taskRun.taskRunId,
            checkpointId: checkpoint.checkpointId,
            payload: {
              gateId: gate.gateId,
              status: gate.status,
              decision: gate.decision,
            },
            createdAt: gate.updatedAt,
          });

          if (input.autoApproveFinalGate) {
            project = {
              ...project,
              decision,
              status: mapDecisionToProjectStatus(decision),
              stage: "serial_ready",
              updatedAt: completedAt,
            };

            batch = {
              ...batch,
              status: "completed",
              currentStage: node.name,
              updatedAt: completedAt,
            };

            workflowRun = {
              ...workflowRun,
              status: "succeeded",
              currentStage: null,
              completedAt,
            };
            await this.repository.saveWorkflowRun(workflowRun);
            await this.recordRunAction({
              workflowRunId: workflowRun.workflowRunId,
              projectId: project.projectId,
              actionType: "workflow_completed",
              actor: "system:runtime",
              reason: null,
              targetNodeName: node.name,
              targetStageRunId: plan.stageRun.stageRunId,
              targetTaskRunId: plan.taskRun.taskRunId,
              checkpointId: checkpoint.checkpointId,
              payload: {
                finalDecision: decision,
              },
              createdAt: completedAt,
            });
          } else {
            project = {
              ...project,
              decision,
              status: "awaiting_gate",
              stage: "promotion_decision",
              updatedAt: completedAt,
            };

            batch = {
              ...batch,
              status: "awaiting_gate",
              currentStage: node.name,
              updatedAt: completedAt,
            };

            workflowRun = {
              ...workflowRun,
              status: "awaiting_review",
              currentStage: node.name,
              completedAt: null,
            };
            await this.repository.saveWorkflowRun(workflowRun);
            await this.updatePlannedExecution(input.plannedStages, index, {
              stageRun: {
                status: "awaiting_review",
              },
              taskRun: {},
            });
          }

          await this.repository.saveProject(project);
          await this.repository.saveBatch(batch);
        } else {
          await this.prepareNextStage(input.plannedStages, index);
        }
      } catch (error) {
        const failureType =
          error instanceof WorkflowExecutionError
            ? error.failureType
            : "terminal";
        const completedAt = new Date().toISOString();
        const stageStatus =
          failureType === "review_required" ? "awaiting_review" : "failed";

        nodeRun = {
          ...nodeRun,
          status: "failed",
          failureType,
          completedAt,
        };
        await this.repository.saveNodeRun(nodeRun);

        await this.updatePlannedExecution(input.plannedStages, index, {
          stageRun: {
            status: stageStatus,
            failureType,
            completedAt,
          },
          taskRun: {
            status: stageStatus,
            failureType,
            completedAt,
          },
        });
        await this.markDownstreamStages(input.plannedStages, index, "blocked");

        workflowRun = {
          ...workflowRun,
          status: failureType === "review_required" ? "awaiting_review" : "failed",
          currentStage: node.name,
          completedAt: failureType === "review_required" ? null : completedAt,
        };
        await this.repository.saveWorkflowRun(workflowRun);

        await this.recordRunAction({
          workflowRunId: workflowRun.workflowRunId,
          projectId: project.projectId,
          actionType: "stage_failed",
          actor: "system:runtime",
          reason: extractErrorMessage(error),
          targetNodeName: node.name,
          targetStageRunId: plan.stageRun.stageRunId,
          targetTaskRunId: plan.taskRun.taskRunId,
          checkpointId: workflowRun.latestCheckpointId,
          payload: {
            failureType,
          },
          createdAt: completedAt,
        });

        if (failureType !== "review_required") {
          await this.recordRunAction({
            workflowRunId: workflowRun.workflowRunId,
            projectId: project.projectId,
            actionType: "workflow_failed",
            actor: "system:runtime",
            reason: extractErrorMessage(error),
            targetNodeName: node.name,
            targetStageRunId: plan.stageRun.stageRunId,
            targetTaskRunId: plan.taskRun.taskRunId,
            checkpointId: workflowRun.latestCheckpointId,
            payload: {
              failureType,
            },
            createdAt: completedAt,
          });
        }

        project = {
          ...project,
          status: mapFailureToProjectStatus(failureType),
          updatedAt: completedAt,
        };
        batch = {
          ...batch,
          status: failureType === "review_required" ? "awaiting_gate" : "failed",
          currentStage: node.name,
          updatedAt: completedAt,
        };
        await this.repository.saveProject(project);
        await this.repository.saveBatch(batch);
        throw error;
      }
    }

    if (workflowRun.status === "running") {
      const completedAt = new Date().toISOString();
      workflowRun = {
        ...workflowRun,
        status: "succeeded",
        currentStage: null,
        completedAt,
      };
      await this.repository.saveWorkflowRun(workflowRun);
      await this.recordRunAction({
        workflowRunId: workflowRun.workflowRunId,
        projectId: project.projectId,
        actionType: "workflow_completed",
        actor: "system:runtime",
        reason: null,
        targetNodeName: null,
        targetStageRunId: null,
        targetTaskRunId: null,
        checkpointId: workflowRun.latestCheckpointId,
        payload: {},
        createdAt: completedAt,
      });
    }

    return this.finalizeResult(batch.batchId, project.projectId, workflowRun.workflowRunId);
  }

  private async finalizeResult(
    batchId: string,
    projectId: string,
    workflowRunId: string,
  ): Promise<RunIncubationProjectResult> {
    const [
      savedBatch,
      savedProject,
      savedWorkflowRun,
      stageRuns,
      taskRuns,
      checkpoints,
      runActions,
      nodeRuns,
      artifacts,
      gates,
    ] = await Promise.all([
      this.repository.getBatch(batchId),
      this.repository.getProject(projectId),
      this.repository.getWorkflowRun(workflowRunId),
      this.repository.listStageRunsForWorkflowRun(workflowRunId),
      this.repository.listTaskRunsForWorkflowRun(workflowRunId),
      this.repository.listCheckpointsForWorkflowRun(workflowRunId),
      this.repository.listRunActionsForWorkflowRun(workflowRunId),
      this.repository.listNodeRunsForProject(projectId),
      this.repository.listArtifactsForProject(projectId),
      this.repository.listGateTasksForProject(projectId),
    ]);

    if (!savedBatch || !savedProject || !savedWorkflowRun) {
      throw new Error("Workflow finished without persisted control state.");
    }

    return {
      batch: savedBatch,
      project: savedProject,
      workflowRun: savedWorkflowRun,
      stageRuns,
      taskRuns,
      checkpoints,
      runActions,
      nodeRuns,
      artifacts,
      gates,
    };
  }

  private createInitialPlannedStages(input: {
    workflowRunId: string;
    projectId: string;
  }): PlannedStageExecution[] {
    return defaultIncubationNodes
      .map((node, index) => {
        const roleName = node.roleNames[0];

        if (!roleName) {
          throw new Error(`Workflow node ${node.name} is missing a role binding.`);
        }

        const status: RunStepStatus = index === 0 ? "ready" : "pending";
        return {
          stageRun: {
            stageRunId: randomUUID(),
            workflowRunId: input.workflowRunId,
            projectId: input.projectId,
            nodeName: node.name,
            attempt: 1,
            status,
            failureType: null,
            startedAt: null,
            completedAt: null,
          },
          taskRun: {
            taskRunId: randomUUID(),
            workflowRunId: input.workflowRunId,
            stageRunId: "",
            projectId: input.projectId,
            nodeName: node.name,
            roleName,
            executorId: this.getExecutorIdForNode(node.name),
            attempt: 1,
            status,
            failureType: null,
            inputRefs: [],
            outputRefs: [],
            reusedFromCheckpointId: null,
            startedAt: null,
            completedAt: null,
          },
        };
      })
      .map((plan) => ({
        stageRun: plan.stageRun,
        taskRun: {
          ...plan.taskRun,
          stageRunId: plan.stageRun.stageRunId,
        },
      }));
  }

  private async createResumePlan(input: {
    projectId: string;
    workflowRunId: string;
    startIndex: number;
    createdAt: string;
  }): Promise<ResumePlanResult> {
    const artifactState = new Map<ArtifactKind, ArtifactState>();
    const copiedCheckpoints: Checkpoint[] = [];
    const plans: PlannedStageExecution[] = [];
    let latestCheckpointId: string | null = null;

    for (const [index, node] of defaultIncubationNodes.entries()) {
      const roleName = node.roleNames[0];

      if (!roleName) {
        throw new Error(`Workflow node ${node.name} is missing a role binding.`);
      }

      const status =
        index < input.startIndex
          ? "reused_from_checkpoint"
          : index === input.startIndex
            ? "ready"
            : "pending";
      const inputRefs =
        index < input.startIndex
          ? node.inputKinds
              .map((kind) => artifactState.get(kind)?.manifest.path)
              .filter((value): value is string => Boolean(value))
          : [];
      const stageRunId = randomUUID();
      let outputRefs: string[] = [];
      let reusedFromCheckpointId: string | null = null;

      if (index < input.startIndex) {
        const artifactKind = mapNodeToArtifactKind(node.name);
        const manifest = await this.requireLatestArtifact(input.projectId, artifactKind);
        const payload = await readArtifactPayload(manifest);

        artifactState.set(artifactKind, {
          manifest,
          payload,
        });
        outputRefs = [manifest.path];

        const copiedCheckpoint: Checkpoint = {
          checkpointId: randomUUID(),
          workflowRunId: input.workflowRunId,
          projectId: input.projectId,
          stageRunId,
          nodeName: node.name,
          status: "ready",
          artifactId: manifest.artifactId,
          createdAt: input.createdAt,
        };
        copiedCheckpoints.push(copiedCheckpoint);
        latestCheckpointId = copiedCheckpoint.checkpointId;
        reusedFromCheckpointId = copiedCheckpoint.checkpointId;
      }

      plans.push({
        stageRun: {
          stageRunId,
          workflowRunId: input.workflowRunId,
          projectId: input.projectId,
          nodeName: node.name,
          attempt: 1,
          status,
          failureType: null,
          startedAt: index < input.startIndex ? input.createdAt : null,
          completedAt: index < input.startIndex ? input.createdAt : null,
        },
        taskRun: {
          taskRunId: randomUUID(),
          workflowRunId: input.workflowRunId,
          stageRunId,
          projectId: input.projectId,
          nodeName: node.name,
          roleName,
          executorId: this.getExecutorIdForNode(node.name),
          attempt: 1,
          status,
          failureType: null,
          inputRefs,
          outputRefs,
          reusedFromCheckpointId,
          startedAt: index < input.startIndex ? input.createdAt : null,
          completedAt: index < input.startIndex ? input.createdAt : null,
        },
      });
    }

    return {
      artifactState,
      plans,
      copiedCheckpoints,
      latestCheckpointId,
    };
  }

  private async requireLatestArtifact(projectId: string, kind: ArtifactKind) {
    const manifest = await this.repository.getLatestArtifact(projectId, kind);

    if (!manifest) {
      throw new Error(`无法从 checkpoint 恢复，缺少 ${kind} 产物。`);
    }

    return manifest;
  }

  private async persistPlannedStages(plans: PlannedStageExecution[]) {
    await Promise.all(
      plans.flatMap((plan) => [
        this.repository.saveStageRun(plan.stageRun),
        this.repository.saveTaskRun(plan.taskRun),
      ]),
    );
  }

  private async updatePlannedExecution(
    plans: PlannedStageExecution[],
    index: number,
    updates: {
      stageRun: Partial<StageRun>;
      taskRun: Partial<TaskRun>;
    },
  ) {
    const plan = getPlannedStage(plans, index);

    plan.stageRun = {
      ...plan.stageRun,
      ...updates.stageRun,
    };
    plan.taskRun = {
      ...plan.taskRun,
      ...updates.taskRun,
    };

    await Promise.all([
      this.repository.saveStageRun(plan.stageRun),
      this.repository.saveTaskRun(plan.taskRun),
    ]);
  }

  private async markDownstreamStages(
    plans: PlannedStageExecution[],
    index: number,
    status: Extract<RunStepStatus, "blocked" | "pending">,
  ) {
    for (let currentIndex = index + 1; currentIndex < plans.length; currentIndex += 1) {
      const plan = getPlannedStage(plans, currentIndex);

      if (isTerminalStepStatus(plan.stageRun.status)) {
        continue;
      }

      await this.updatePlannedExecution(plans, currentIndex, {
        stageRun: {
          status,
        },
        taskRun: {
          status,
        },
      });
    }
  }

  private async prepareNextStage(plans: PlannedStageExecution[], index: number) {
    for (let currentIndex = index + 1; currentIndex < plans.length; currentIndex += 1) {
      const plan = getPlannedStage(plans, currentIndex);

      if (isTerminalStepStatus(plan.stageRun.status)) {
        continue;
      }

      await this.updatePlannedExecution(plans, currentIndex, {
        stageRun: {
          status: currentIndex === index + 1 ? "ready" : "pending",
        },
        taskRun: {
          status: currentIndex === index + 1 ? "ready" : "pending",
        },
      });
    }
  }

  private async createCheckpoint(input: {
    workflowRunId: string;
    projectId: string;
    stageRunId: string;
    nodeName: NodeName;
    artifactId: string | null;
    createdAt: string;
  }) {
    const checkpoint: Checkpoint = {
      checkpointId: randomUUID(),
      workflowRunId: input.workflowRunId,
      projectId: input.projectId,
      stageRunId: input.stageRunId,
      nodeName: input.nodeName,
      status: "ready",
      artifactId: input.artifactId,
      createdAt: input.createdAt,
    };
    await this.repository.saveCheckpoint(checkpoint);
    return checkpoint;
  }

  private async recordRunAction(input: {
    workflowRunId: string;
    projectId: string;
    actionType: RunActionType;
    actor: string;
    reason: string | null;
    targetNodeName: NodeName | null;
    targetStageRunId: string | null;
    targetTaskRunId: string | null;
    checkpointId: string | null;
    payload: Record<string, unknown>;
    createdAt: string;
  }) {
    const action: RunAction = {
      actionId: randomUUID(),
      workflowRunId: input.workflowRunId,
      projectId: input.projectId,
      actionType: input.actionType,
      actor: input.actor,
      reason: input.reason,
      targetNodeName: input.targetNodeName,
      targetStageRunId: input.targetStageRunId,
      targetTaskRunId: input.targetTaskRunId,
      checkpointId: input.checkpointId,
      payload: input.payload,
      createdAt: input.createdAt,
    };
    await this.repository.saveRunAction(action);
    return action;
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

  private getExecutorIdForNode(nodeName: NodeName) {
    return nodeName === "promotion_decision" ? "runtime-policy" : this.executor.id;
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

function isTerminalStepStatus(status: RunStepStatus) {
  return [
    "succeeded",
    "failed",
    "awaiting_review",
    "skipped",
    "rolled_back",
    "reused_from_checkpoint",
  ].includes(status);
}

function extractErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function getPlannedStage(plans: PlannedStageExecution[], index: number) {
  const plan = plans[index];

  if (!plan) {
    throw new Error(`Missing planned stage at index ${index}.`);
  }

  return plan;
}

function getWorkflowNode(index: number) {
  const node = defaultIncubationNodes[index];

  if (!node) {
    throw new Error(`Missing workflow node at index ${index}.`);
  }

  return node;
}

function getNodeIndex(nodeName: NodeName) {
  const index = defaultIncubationNodes.findIndex((node) => node.name === nodeName);

  if (index < 0) {
    throw new Error(`Unknown workflow node ${nodeName}.`);
  }

  return index;
}

function defaultGoalForLane(targetLane: string) {
  return `Incubate a commercially viable ${targetLane} project with strong opening retention.`;
}

async function readArtifactPayload(manifest: ArtifactManifest) {
  switch (manifest.kind) {
    case "review_scorecard":
      return readJsonArtifact<ReviewScorecard>(manifest.path);
    default:
      return null;
  }
}
