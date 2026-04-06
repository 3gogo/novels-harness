import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  createWorkspaceLayout,
  getArtifactFilePath,
  getProjectBibleDirectory,
} from "../src/index.js";

describe("createWorkspaceLayout", () => {
  it("returns stable top-level directories", () => {
    const layout = createWorkspaceLayout("D:/novel");

    expect(layout.batchesDir).toBe(path.join("D:/novel", "batches"));
    expect(layout.projectsDir).toBe(path.join("D:/novel", "projects"));
  });
});

describe("getArtifactFilePath", () => {
  it("nests artifacts under project incubation directories", () => {
    const result = getArtifactFilePath({
      rootDir: "D:/novel",
      projectSlug: "project-001",
      artifactKind: "concept_pack",
      version: 2,
      fileName: "summary.md",
    });

    expect(result).toContain(
      path.join("projects", "project-001", "incubation", "concept_pack"),
    );
    expect(getProjectBibleDirectory("D:/novel", "project-001")).toContain(
      path.join("projects", "project-001", "bible"),
    );
  });
});
