import path from "node:path";

import { readTextArtifact } from "@novel-harness/assets";
import { createDatabaseHandle, NovelHarnessRepository } from "@novel-harness/db";
import { createOpenAIExecutorFromEnv, type ResolvedExecutor } from "@novel-harness/executors";
import Fastify from "fastify";

import { suggestGateDecision } from "@novel-harness/evaluation";
import { defaultPromptTemplates } from "@novel-harness/prompts";
import { reviewScorecardSchema } from "@novel-harness/schemas";
import { FakeExecutor } from "@novel-harness/testkit";
import {
  defaultIncubationNodes,
  incubationNodeOrder,
  IncubationWorkflowRunner,
} from "@novel-harness/workflows";

export function buildApp() {
  const app = Fastify({
    logger: true,
  });

  const workspaceRoot = path.join(process.cwd(), "workspace");
  const databasePath = path.join(process.cwd(), "data", "novel-harness.db");
  const executorResolution = resolveExecutor();
  const publicExecutorInfo = toExecutorInfo(executorResolution);

  app.get("/health", async () => ({
    ok: true,
    service: "orchestrator",
    workflowNodes: incubationNodeOrder.length,
    promptTemplates: Object.keys(defaultPromptTemplates).length,
    executor: publicExecutorInfo,
  }));

  app.get("/api/workflows/incubation", async () => ({
    order: incubationNodeOrder,
    nodes: defaultIncubationNodes,
  }));

  app.get("/api/prompts/roles", async () => ({
    roles: Object.values(defaultPromptTemplates),
  }));

  app.get("/api/artifacts/:artifactId/content", async (request, reply) => {
    const { artifactId } = request.params as { artifactId: string };
    const databaseHandle = await createDatabaseHandle(databasePath);

    try {
      const repository = new NovelHarnessRepository(databaseHandle.db);
      const manifest = await repository.getArtifactManifest(artifactId);

      if (!manifest) {
        reply.code(404);
        return {
          ok: false,
          error: "产物不存在。",
        };
      }

      const content = await readTextArtifact(manifest.path);
      return {
        ok: true,
        manifest,
        content,
      };
    } catch (error) {
      request.log.error(error);
      reply.code(500);
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      await databaseHandle.close();
    }
  });

  app.get("/api/runs/:runId", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const databaseHandle = await createDatabaseHandle(databasePath);

    try {
      const repository = new NovelHarnessRepository(databaseHandle.db);
      const workflowRun = await repository.getWorkflowRun(runId);

      if (!workflowRun) {
        reply.code(404);
        return {
          ok: false,
          error: "运行记录不存在。",
        };
      }

      const [project, batch, stageRuns, taskRuns, checkpoints, runActions, nodeRuns, artifacts, gates] =
        await Promise.all([
          repository.getProject(workflowRun.projectId),
          repository.getBatch(workflowRun.batchId),
          repository.listStageRunsForWorkflowRun(workflowRun.workflowRunId),
          repository.listTaskRunsForWorkflowRun(workflowRun.workflowRunId),
          repository.listCheckpointsForWorkflowRun(workflowRun.workflowRunId),
          repository.listRunActionsForWorkflowRun(workflowRun.workflowRunId),
          repository.listNodeRunsForProject(workflowRun.projectId),
          repository.listArtifactsForProject(workflowRun.projectId),
          repository.listGateTasksForProject(workflowRun.projectId),
        ]);

      if (!project || !batch) {
        reply.code(404);
        return {
          ok: false,
          error: "运行记录缺少关联的项目或批次。",
        };
      }

      return {
        ok: true,
        workspaceRoot,
        databasePath,
        executor: publicExecutorInfo,
        run: {
          workflowRun,
          batch,
          project,
          stageRuns,
          taskRuns,
          checkpoints,
          runActions,
          nodeRuns,
          artifacts,
          gates,
        },
      };
    } catch (error) {
      request.log.error(error);
      reply.code(500);
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      await databaseHandle.close();
    }
  });

  app.post("/api/runs/:runId/resume", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const body = (request.body as Partial<{
      checkpointId: string;
      startNodeName: string;
      goal: string;
      autoApproveFinalGate: boolean;
    }>) ?? {};
    const databaseHandle = await createDatabaseHandle(databasePath);

    try {
      if (!body.checkpointId) {
        reply.code(400);
        return {
          ok: false,
          error: "缺少 checkpointId。",
        };
      }

      const repository = new NovelHarnessRepository(databaseHandle.db);
      const runner = new IncubationWorkflowRunner(
        repository,
        executorResolution.executor,
      );
      const result = await runner.resumeFromCheckpoint({
        rootDir: workspaceRoot,
        checkpointId: body.checkpointId,
        sourceWorkflowRunId: runId,
        ...(body.goal ? { goal: body.goal } : {}),
        autoApproveFinalGate: body.autoApproveFinalGate ?? true,
      });

      return {
        ok: true,
        workspaceRoot,
        databasePath,
        executor: publicExecutorInfo,
        result,
      };
    } catch (error) {
      request.log.error(error);
      reply.code(500);
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      await databaseHandle.close();
    }
  });

  app.post("/api/evaluation/suggest", async (request, reply) => {
    const parsed = reviewScorecardSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return {
        ok: false,
        errors: parsed.error.flatten(),
      };
    }

    return {
      ok: true,
      decision: suggestGateDecision(parsed.data),
    };
  });

  app.get("/api/demo/state", async (request, reply) => {
    const databaseHandle = await createDatabaseHandle(databasePath);

    try {
      const repository = new NovelHarnessRepository(databaseHandle.db);
      const [latestProject] = await repository.listRecentProjects(1);

      if (!latestProject) {
        return {
          ok: true,
          workspaceRoot,
          databasePath,
          executor: publicExecutorInfo,
          latestRun: null,
        };
      }

      const [workflowRun] = await repository.listWorkflowRunsForProject(
        latestProject.projectId,
        1,
      );
      const [batch, nodeRuns, artifacts, gates, stageRuns, taskRuns, checkpoints, runActions] =
        await Promise.all([
        repository.getBatch(latestProject.batchId),
        repository.listNodeRunsForProject(latestProject.projectId),
        repository.listArtifactsForProject(latestProject.projectId),
        repository.listGateTasksForProject(latestProject.projectId),
          workflowRun
            ? repository.listStageRunsForWorkflowRun(workflowRun.workflowRunId)
            : Promise.resolve([]),
          workflowRun
            ? repository.listTaskRunsForWorkflowRun(workflowRun.workflowRunId)
            : Promise.resolve([]),
          workflowRun
            ? repository.listCheckpointsForWorkflowRun(workflowRun.workflowRunId)
            : Promise.resolve([]),
          workflowRun
            ? repository.listRunActionsForWorkflowRun(workflowRun.workflowRunId)
            : Promise.resolve([]),
        ]);

      return {
        ok: true,
        workspaceRoot,
        databasePath,
        executor: publicExecutorInfo,
        latestRun: {
          batch,
          project: latestProject,
          workflowRun: workflowRun ?? null,
          stageRuns,
          taskRuns,
          checkpoints,
          runActions,
          nodeRuns,
          artifacts,
          gates,
        },
      };
    } catch (error) {
      request.log.error(error);
      reply.code(500);
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      await databaseHandle.close();
    }
  });

  app.post("/api/demo/incubation", async (request, reply) => {
    const body = (request.body as Partial<{
      batchName: string;
      targetLane: string;
      audience: string;
      constraints: string[];
      projectTitle: string;
      goal: string;
      autoApproveFinalGate: boolean;
    }>) ?? {};

    const databaseHandle = await createDatabaseHandle(databasePath);

    try {
      const repository = new NovelHarnessRepository(databaseHandle.db);
      const runner = new IncubationWorkflowRunner(
        repository,
        executorResolution.executor,
      );
      const result = await runner.runProject({
        rootDir: workspaceRoot,
        batchName: body.batchName ?? "Demo Xianxia Batch",
        targetLane: body.targetLane ?? "xianxia",
        audience: body.audience ?? "male",
        constraints: body.constraints ?? [
          "前三章必须有强钩子",
          "概念要适合长线连载放大",
        ],
        projectTitle: body.projectTitle ?? "玄门逆命",
        goal:
          body.goal ?? "测试从试产到晋级裁决的最小闭环是否跑通。",
        autoApproveFinalGate: body.autoApproveFinalGate ?? true,
      });

      return {
        ok: true,
        workspaceRoot,
        databasePath,
        executor: publicExecutorInfo,
        result,
      };
    } catch (error) {
      request.log.error(error);
      reply.code(500);
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      await databaseHandle.close();
    }
  });

  return app;
}

function resolveExecutor(): ResolvedExecutor {
  const openaiExecutor = createOpenAIExecutorFromEnv();

  if (openaiExecutor) {
    return openaiExecutor;
  }

  const fakeExecutor = new FakeExecutor();
  return {
    executor: fakeExecutor,
    mode: "fake",
    adapterId: fakeExecutor.id,
    displayName: fakeExecutor.displayName,
    reason: "OPENAI_API_KEY not set; falling back to FakeExecutor.",
  };
}

function toExecutorInfo(executorResolution: ResolvedExecutor) {
  return {
    mode: executorResolution.mode,
    adapterId: executorResolution.adapterId,
    displayName: executorResolution.displayName,
    ...(executorResolution.modelId
      ? { modelId: executorResolution.modelId }
      : {}),
    reason: executorResolution.reason,
  };
}
