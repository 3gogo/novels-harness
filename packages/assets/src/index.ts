import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  artifactManifestSchema,
  batchBriefArtifactSchema,
  conceptPackArtifactSchema,
  ideaSpreadArtifactSchema,
  openingDraftArtifactSchema,
  promotionDecisionArtifactSchema,
  reviewScorecardSchema,
  traceLogSchema,
  type ArtifactKind,
  type ArtifactManifest,
  type BatchBriefArtifact,
  type ConceptPackArtifact,
  type OpeningDraftArtifact,
  type PromotionDecisionArtifact,
  type ReviewScorecard,
  type TraceLog,
} from "@novel-harness/schemas";

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

export function getProjectDecisionsDirectory(
  rootDir: string,
  projectSlug: string,
) {
  return path.join(getProjectDirectory(rootDir, projectSlug), "decisions");
}

export async function ensureProjectDirectories(
  rootDir: string,
  projectSlug: string,
) {
  const projectDir = getProjectDirectory(rootDir, projectSlug);
  const directories = [
    projectDir,
    getProjectBibleDirectory(rootDir, projectSlug),
    getProjectIncubationDirectory(rootDir, projectSlug),
    getProjectLineageDirectory(rootDir, projectSlug),
    getProjectDecisionsDirectory(rootDir, projectSlug),
    path.join(projectDir, "serial"),
  ];

  await Promise.all(
    directories.map((directoryPath) =>
      mkdir(directoryPath, { recursive: true }),
    ),
  );

  return {
    projectDir,
    bibleDir: getProjectBibleDirectory(rootDir, projectSlug),
    incubationDir: getProjectIncubationDirectory(rootDir, projectSlug),
    lineageDir: getProjectLineageDirectory(rootDir, projectSlug),
    decisionsDir: getProjectDecisionsDirectory(rootDir, projectSlug),
  };
}

export async function ensureBatchDirectory(rootDir: string, batchSlug: string) {
  const batchDir = getBatchDirectory(rootDir, batchSlug);
  await mkdir(batchDir, { recursive: true });
  return batchDir;
}

export function getArtifactFilePath(input: {
  rootDir: string;
  projectSlug: string;
  artifactKind: ArtifactKind;
  version: number;
  fileName: string;
}) {
  const baseDir = getArtifactBaseDirectory(
    input.rootDir,
    input.projectSlug,
    input.artifactKind,
  );

  return path.join(
    baseDir,
    `v${input.version}`,
    input.fileName,
  );
}

export interface PersistProjectArtifactInput {
  rootDir: string;
  projectId: string;
  projectSlug: string;
  artifactKind: ArtifactKind;
  payload: unknown;
  producer: string;
  sourceRunId: string;
}

export interface PersistedArtifact {
  manifest: ArtifactManifest;
  contentPath: string;
  manifestPath: string;
}

export async function persistProjectArtifact(
  input: PersistProjectArtifactInput,
): Promise<PersistedArtifact> {
  await ensureProjectDirectories(input.rootDir, input.projectSlug);

  const version = await getNextArtifactVersion(
    getArtifactBaseDirectory(
      input.rootDir,
      input.projectSlug,
      input.artifactKind,
    ),
  );
  const fileName = getArtifactFileName(input.artifactKind);
  const contentPath = getArtifactFilePath({
    rootDir: input.rootDir,
    projectSlug: input.projectSlug,
    artifactKind: input.artifactKind,
    version,
    fileName,
  });

  await mkdir(path.dirname(contentPath), { recursive: true });

  const manifest = artifactManifestSchema.parse({
    artifactId: `${input.projectId}:${input.artifactKind}:v${version}`,
    projectId: input.projectId,
    kind: input.artifactKind,
    path: contentPath,
    version,
    producer: input.producer,
    sourceRunId: input.sourceRunId,
    createdAt: new Date().toISOString(),
  });
  const manifestPath = path.join(path.dirname(contentPath), "manifest.json");

  await writeFile(
    contentPath,
    formatArtifactContent(input.artifactKind, input.payload),
    "utf8",
  );
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  return {
    manifest,
    contentPath,
    manifestPath,
  };
}

export async function persistBatchBriefSnapshot(input: {
  rootDir: string;
  batchSlug: string;
  payload: BatchBriefArtifact;
}) {
  const batchDir = await ensureBatchDirectory(input.rootDir, input.batchSlug);
  const filePath = path.join(batchDir, "brief.md");

  await writeFile(filePath, formatBatchBrief(input.payload), "utf8");

  return filePath;
}

export async function readJsonArtifact<T>(filePath: string) {
  const content = await readFile(filePath, "utf8");
  return JSON.parse(content) as T;
}

export async function readTextArtifact(filePath: string) {
  return readFile(filePath, "utf8");
}

function getArtifactBaseDirectory(
  rootDir: string,
  projectSlug: string,
  artifactKind: ArtifactKind,
) {
  switch (artifactKind) {
    case "project_bible":
      return getProjectBibleDirectory(rootDir, projectSlug);
    case "decision_record":
      return path.join(getProjectDecisionsDirectory(rootDir, projectSlug), "records");
    case "trace_log":
      return path.join(getProjectLineageDirectory(rootDir, projectSlug), "traces");
    case "prompt_snapshot":
      return path.join(getProjectLineageDirectory(rootDir, projectSlug), "prompts");
    default:
      return path.join(
        getProjectIncubationDirectory(rootDir, projectSlug),
        artifactKind,
      );
  }
}

async function getNextArtifactVersion(baseDir: string) {
  try {
    const entries = await readdir(baseDir, { withFileTypes: true });
    const versions = entries
      .filter((entry) => entry.isDirectory() && /^v\d+$/.test(entry.name))
      .map((entry) => Number(entry.name.slice(1)))
      .filter((value) => Number.isFinite(value));

    return versions.length > 0 ? Math.max(...versions) + 1 : 1;
  } catch {
    return 1;
  }
}

function getArtifactFileName(artifactKind: ArtifactKind) {
  switch (artifactKind) {
    case "review_scorecard":
      return "scorecard.json";
    case "trace_log":
      return "trace.json";
    case "decision_record":
      return "decision.md";
    case "concept_pack":
      return "concept-pack.md";
    case "opening_draft":
      return "opening.md";
    case "project_bible":
      return "bible.md";
    case "prompt_snapshot":
      return "prompt.md";
    case "idea_card":
      return "ideas.md";
    default:
      return "artifact.md";
  }
}

function formatArtifactContent(artifactKind: ArtifactKind, payload: unknown) {
  switch (artifactKind) {
    case "batch_brief":
      return formatBatchBrief(batchBriefArtifactSchema.parse(payload));
    case "idea_card":
      return formatIdeaSpread(payload);
    case "concept_pack":
      return formatConceptPack(conceptPackArtifactSchema.parse(payload));
    case "opening_draft":
      return formatOpeningDraft(openingDraftArtifactSchema.parse(payload));
    case "review_scorecard":
      return JSON.stringify(reviewScorecardSchema.parse(payload), null, 2);
    case "decision_record":
      return formatDecisionRecord(
        promotionDecisionArtifactSchema.parse(payload),
      );
    case "trace_log":
      return JSON.stringify(traceLogSchema.parse(payload), null, 2);
    default:
      return JSON.stringify(payload, null, 2);
  }
}

function formatBatchBrief(payload: BatchBriefArtifact) {
  return [
    `# ${payload.batchName}`,
    "",
    `- Batch ID: ${payload.batchId}`,
    `- Target Lane: ${payload.targetLane}`,
    `- Audience: ${payload.audience}`,
    "",
    "## Goal",
    payload.goal,
    "",
    "## Constraints",
    ...payload.constraints.map((constraint) => `- ${constraint}`),
  ].join("\n");
}

function formatIdeaSpread(payload: unknown) {
  const { candidates } = ideaSpreadArtifactSchema.parse(payload);
  return [
    "# Idea Spread",
    "",
    ...candidates.flatMap((candidate, index) => [
      `## Candidate ${index + 1}: ${candidate.title}`,
      `- Hook: ${candidate.hook}`,
      `- Premise: ${candidate.premise}`,
      `- Differentiator: ${candidate.differentiator}`,
      "",
    ]),
  ].join("\n");
}

function formatConceptPack(payload: ConceptPackArtifact) {
  return [
    `# ${payload.title}`,
    "",
    `> ${payload.tagline}`,
    "",
    "## Premise",
    payload.premise,
    "",
    "## Synopsis",
    payload.synopsis,
    "",
    "## Protagonist",
    payload.protagonist,
    "",
    "## Stakes",
    payload.stakes,
    "",
    "## World Rules",
    ...payload.worldRules.map((rule) => `- ${rule}`),
    "",
    "## Opening Promise",
    ...payload.openingPromise.map((promise) => `- ${promise}`),
  ].join("\n");
}

function formatOpeningDraft(payload: OpeningDraftArtifact) {
  return payload.chapters
    .flatMap((chapter) => [
      `# 第${chapter.chapterNumber}章 ${chapter.title}`,
      "",
      chapter.body,
      "",
    ])
    .join("\n");
}

function formatDecisionRecord(payload: PromotionDecisionArtifact) {
  return [
    `# Decision: ${payload.decision}`,
    "",
    `- Weighted Score: ${payload.weightedScore}`,
    "",
    "## Rationale",
    payload.rationale,
    "",
    "## Risk Flags",
    ...(payload.riskFlags.length > 0
      ? payload.riskFlags.map((flag) => `- ${flag}`)
      : ["- none"]),
  ].join("\n");
}
