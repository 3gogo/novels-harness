import path from "node:path";

import { createDatabaseHandle, NovelHarnessRepository } from "@novel-harness/db";
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

  app.get("/health", async () => ({
    ok: true,
    service: "orchestrator",
    workflowNodes: incubationNodeOrder.length,
    promptTemplates: Object.keys(defaultPromptTemplates).length,
  }));

  app.get("/api/workflows/incubation", async () => ({
    order: incubationNodeOrder,
    nodes: defaultIncubationNodes,
  }));

  app.get("/api/prompts/roles", async () => ({
    roles: Object.values(defaultPromptTemplates),
  }));

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

    const workspaceRoot = path.join(process.cwd(), "workspace");
    const databasePath = path.join(process.cwd(), "data", "novel-harness.db");
    const databaseHandle = await createDatabaseHandle(databasePath);

    try {
      const repository = new NovelHarnessRepository(databaseHandle.db);
      const runner = new IncubationWorkflowRunner(
        repository,
        new FakeExecutor(),
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
