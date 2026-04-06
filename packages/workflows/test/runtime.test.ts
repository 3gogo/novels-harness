import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createDatabaseHandle, NovelHarnessRepository } from "@novel-harness/db";
import { FakeExecutor } from "@novel-harness/testkit";

import { IncubationWorkflowRunner } from "../src/runtime.js";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map(async (directoryPath) => {
      await new Promise((resolve) => setTimeout(resolve, 100));

      try {
        await rm(directoryPath, { recursive: true, force: true });
      } catch (error) {
        const code =
          typeof error === "object" && error !== null && "code" in error
            ? String(error.code)
            : "";

        if (code !== "EBUSY") {
          throw error;
        }
      }
    }),
  );
});

describe("IncubationWorkflowRunner", () => {
  it("runs the minimal incubation flow end-to-end", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "novel-harness-"));
    tempDirectories.push(tempRoot);

    const databasePath = path.join(tempRoot, "data", "novel-harness.db");
    const workspaceRoot = path.join(tempRoot, "workspace");
    const databaseHandle = await createDatabaseHandle(databasePath);
    const repository = new NovelHarnessRepository(databaseHandle.db);
    const runner = new IncubationWorkflowRunner(repository, new FakeExecutor());

    try {
      const result = await runner.runProject({
        rootDir: workspaceRoot,
        batchName: "测试批次",
        targetLane: "xianxia",
        audience: "male",
        constraints: ["前三章强钩子", "可放大为长线连载"],
        projectTitle: "玄门逆命",
      });

      expect(result.project.status).toBe("promoted");
      expect(result.project.decision).toBe("approve");
      expect(result.nodeRuns).toHaveLength(6);
      expect(result.gates).toHaveLength(1);
      expect(result.gates[0]?.status).toBe("approved");
      expect(
        result.artifacts.some((artifact) => artifact.kind === "decision_record"),
      ).toBe(true);
      expect(
        result.artifacts.some((artifact) => artifact.kind === "review_scorecard"),
      ).toBe(true);
    } finally {
      await databaseHandle.close();
    }
  });
});
