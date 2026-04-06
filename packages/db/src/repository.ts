import { eq, desc } from "drizzle-orm";

import {
  artifactManifestSchema,
  batchSchema,
  gateTaskSchema,
  nodeRunSchema,
  projectSchema,
  type ArtifactKind,
  type ArtifactManifest,
  type Batch,
  type GateTask,
  type NodeRun,
  type Project,
} from "@novel-harness/schemas";

import type { HarnessDatabase } from "./client.js";
import {
  artifactManifestsTable,
  batchesTable,
  gateTasksTable,
  nodeRunsTable,
  projectsTable,
} from "./schema.js";

export class NovelHarnessRepository {
  constructor(private readonly db: HarnessDatabase) {}

  async saveBatch(batch: Batch) {
    const input = batchSchema.parse(batch);

    await this.db
      .insert(batchesTable)
      .values({
        batchId: input.batchId,
        name: input.name,
        targetLane: input.targetLane,
        audience: input.audience,
        constraintsJson: JSON.stringify(input.constraints),
        status: input.status,
        currentStage: input.currentStage,
        projectIdsJson: JSON.stringify(input.projectIds),
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
      })
      .onConflictDoUpdate({
        target: batchesTable.batchId,
        set: {
          name: input.name,
          targetLane: input.targetLane,
          audience: input.audience,
          constraintsJson: JSON.stringify(input.constraints),
          status: input.status,
          currentStage: input.currentStage,
          projectIdsJson: JSON.stringify(input.projectIds),
          updatedAt: input.updatedAt,
        },
      });
  }

  async getBatch(batchId: string) {
    const [row] = await this.db
      .select()
      .from(batchesTable)
      .where(eq(batchesTable.batchId, batchId))
      .limit(1);

    return row ? this.mapBatch(row) : null;
  }

  async saveProject(project: Project) {
    const input = projectSchema.parse(project);

    await this.db
      .insert(projectsTable)
      .values({
        projectId: input.projectId,
        slug: input.slug,
        title: input.title,
        status: input.status,
        stage: input.stage,
        batchId: input.batchId,
        bibleVersion: input.bibleVersion,
        latestScore: input.latestScore,
        decision: input.decision,
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
      })
      .onConflictDoUpdate({
        target: projectsTable.projectId,
        set: {
          slug: input.slug,
          title: input.title,
          status: input.status,
          stage: input.stage,
          batchId: input.batchId,
          bibleVersion: input.bibleVersion,
          latestScore: input.latestScore,
          decision: input.decision,
          updatedAt: input.updatedAt,
        },
      });
  }

  async getProject(projectId: string) {
    const [row] = await this.db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.projectId, projectId))
      .limit(1);

    return row ? projectSchema.parse(row) : null;
  }

  async listProjectsForBatch(batchId: string) {
    const rows = await this.db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.batchId, batchId));

    return rows.map((row) => projectSchema.parse(row));
  }

  async listRecentProjects(limit = 10) {
    const rows = await this.db
      .select()
      .from(projectsTable)
      .orderBy(desc(projectsTable.updatedAt))
      .limit(limit);

    return rows.map((row) => projectSchema.parse(row));
  }

  async saveNodeRun(nodeRun: NodeRun) {
    const input = nodeRunSchema.parse(nodeRun);

    await this.db
      .insert(nodeRunsTable)
      .values({
        runId: input.runId,
        projectId: input.projectId,
        nodeName: input.nodeName,
        roleName: input.roleName,
        executorId: input.executorId,
        status: input.status,
        failureType: input.failureType,
        retryCount: input.retryCount,
        inputRefsJson: JSON.stringify(input.inputRefs),
        outputRefsJson: JSON.stringify(input.outputRefs),
        startedAt: input.startedAt,
        completedAt: input.completedAt,
      })
      .onConflictDoUpdate({
        target: nodeRunsTable.runId,
        set: {
          projectId: input.projectId,
          nodeName: input.nodeName,
          roleName: input.roleName,
          executorId: input.executorId,
          status: input.status,
          failureType: input.failureType,
          retryCount: input.retryCount,
          inputRefsJson: JSON.stringify(input.inputRefs),
          outputRefsJson: JSON.stringify(input.outputRefs),
          startedAt: input.startedAt,
          completedAt: input.completedAt,
        },
      });
  }

  async listNodeRunsForProject(projectId: string) {
    const rows = await this.db
      .select()
      .from(nodeRunsTable)
      .where(eq(nodeRunsTable.projectId, projectId))
      .orderBy(desc(nodeRunsTable.startedAt));

    return rows.map((row) =>
      nodeRunSchema.parse({
        runId: row.runId,
        projectId: row.projectId,
        nodeName: row.nodeName,
        roleName: row.roleName,
        executorId: row.executorId,
        status: row.status,
        failureType: row.failureType,
        retryCount: row.retryCount,
        inputRefs: JSON.parse(row.inputRefsJson) as string[],
        outputRefs: JSON.parse(row.outputRefsJson) as string[],
        startedAt: row.startedAt,
        completedAt: row.completedAt,
      }),
    );
  }

  async saveArtifactManifest(manifest: ArtifactManifest) {
    const input = artifactManifestSchema.parse(manifest);

    await this.db
      .insert(artifactManifestsTable)
      .values({
        artifactId: input.artifactId,
        projectId: input.projectId,
        kind: input.kind,
        path: input.path,
        version: input.version,
        producer: input.producer,
        sourceRunId: input.sourceRunId,
        createdAt: input.createdAt,
      })
      .onConflictDoUpdate({
        target: artifactManifestsTable.artifactId,
        set: {
          projectId: input.projectId,
          kind: input.kind,
          path: input.path,
          version: input.version,
          producer: input.producer,
          sourceRunId: input.sourceRunId,
          createdAt: input.createdAt,
        },
      });
  }

  async listArtifactsForProject(projectId: string) {
    const rows = await this.db
      .select()
      .from(artifactManifestsTable)
      .where(eq(artifactManifestsTable.projectId, projectId))
      .orderBy(desc(artifactManifestsTable.createdAt));

    return rows.map((row) => artifactManifestSchema.parse(row));
  }

  async getLatestArtifact(projectId: string, kind: ArtifactKind) {
    const [row] = await this.db
      .select()
      .from(artifactManifestsTable)
      .where(eq(artifactManifestsTable.projectId, projectId))
      .orderBy(desc(artifactManifestsTable.version))
      .limit(1);

    if (row?.kind === kind) {
      return artifactManifestSchema.parse(row);
    }

    const candidates = await this.db
      .select()
      .from(artifactManifestsTable)
      .where(eq(artifactManifestsTable.projectId, projectId))
      .orderBy(desc(artifactManifestsTable.version));

    const match = candidates.find((candidate) => candidate.kind === kind);
    return match ? artifactManifestSchema.parse(match) : null;
  }

  async saveGateTask(gateTask: GateTask) {
    const input = gateTaskSchema.parse(gateTask);

    await this.db
      .insert(gateTasksTable)
      .values({
        gateId: input.gateId,
        projectId: input.projectId,
        gateType: input.gateType,
        status: input.status,
        payloadRefsJson: JSON.stringify(input.payloadRefs),
        approvedBy: input.approvedBy,
        decision: input.decision,
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
      })
      .onConflictDoUpdate({
        target: gateTasksTable.gateId,
        set: {
          projectId: input.projectId,
          gateType: input.gateType,
          status: input.status,
          payloadRefsJson: JSON.stringify(input.payloadRefs),
          approvedBy: input.approvedBy,
          decision: input.decision,
          createdAt: input.createdAt,
          updatedAt: input.updatedAt,
        },
      });
  }

  async listGateTasksForProject(projectId: string) {
    const rows = await this.db
      .select()
      .from(gateTasksTable)
      .where(eq(gateTasksTable.projectId, projectId))
      .orderBy(desc(gateTasksTable.updatedAt));

    return rows.map((row) =>
      gateTaskSchema.parse({
        gateId: row.gateId,
        projectId: row.projectId,
        gateType: row.gateType,
        status: row.status,
        payloadRefs: JSON.parse(row.payloadRefsJson) as string[],
        approvedBy: row.approvedBy,
        decision: row.decision,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }),
    );
  }

  private mapBatch(row: typeof batchesTable.$inferSelect) {
    return batchSchema.parse({
      batchId: row.batchId,
      name: row.name,
      targetLane: row.targetLane,
      audience: row.audience,
      constraints: JSON.parse(row.constraintsJson) as string[],
      status: row.status,
      currentStage: row.currentStage,
      projectIds: JSON.parse(row.projectIdsJson) as string[],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
