import { mkdir } from "node:fs/promises";
import path from "node:path";

import type { ArtifactKind } from "@novel-harness/schemas";

export interface WorkspaceLayout {
  rootDir: string;
  batchesDir: string;
  projectsDir: string;
}

export function createWorkspaceLayout(rootDir: string): WorkspaceLayout {
  return {
    rootDir,
    batchesDir: path.join(rootDir, "batches"),
    projectsDir: path.join(rootDir, "projects"),
  };
}

export async function ensureWorkspaceDirectories(rootDir: string) {
  const layout = createWorkspaceLayout(rootDir);

  await Promise.all([
    mkdir(layout.rootDir, { recursive: true }),
    mkdir(layout.batchesDir, { recursive: true }),
    mkdir(layout.projectsDir, { recursive: true }),
  ]);

  return layout;
}

export function getBatchDirectory(rootDir: string, batchSlug: string) {
  return path.join(rootDir, "batches", batchSlug);
}

export function getProjectDirectory(rootDir: string, projectSlug: string) {
  return path.join(rootDir, "projects", projectSlug);
}

export function getProjectBibleDirectory(rootDir: string, projectSlug: string) {
  return path.join(getProjectDirectory(rootDir, projectSlug), "bible");
}

export function getProjectIncubationDirectory(
  rootDir: string,
  projectSlug: string,
) {
  return path.join(getProjectDirectory(rootDir, projectSlug), "incubation");
}

export function getProjectLineageDirectory(rootDir: string, projectSlug: string) {
  return path.join(getProjectDirectory(rootDir, projectSlug), "lineage");
}

export function getArtifactFilePath(input: {
  rootDir: string;
  projectSlug: string;
  artifactKind: ArtifactKind;
  version: number;
  fileName: string;
}) {
  const incubationDir = getProjectIncubationDirectory(
    input.rootDir,
    input.projectSlug,
  );

  return path.join(
    incubationDir,
    input.artifactKind,
    `v${input.version}`,
    input.fileName,
  );
}
