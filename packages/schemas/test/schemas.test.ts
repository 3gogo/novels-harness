import { describe, expect, it } from "vitest";

import {
  batchSchema,
  ideaSpreadArtifactSchema,
  openingDraftArtifactSchema,
  reviewScorecardSchema,
} from "../src/index.js";

describe("batchSchema", () => {
  it("accepts a valid incubation batch", () => {
    const parsed = batchSchema.parse({
      batchId: "batch-001",
      name: "xianxia-opening-batch",
      targetLane: "xianxia",
      audience: "male",
      constraints: ["fast hook", "serial upside"],
      status: "queued",
      currentStage: "batch_brief",
      projectIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    expect(parsed.status).toBe("queued");
  });
});

describe("reviewScorecardSchema", () => {
  it("rejects invalid score values", () => {
    const parsed = reviewScorecardSchema.safeParse({
      hookScore: 120,
      retentionScore: 80,
      noveltyScore: 70,
      proseScore: 75,
      serialPotentialScore: 88,
      riskFlags: [],
      notes: "Scores should fail on invalid hook range.",
      decisionSuggestion: "approve",
    });

    expect(parsed.success).toBe(false);
  });
});

describe("incubation artifact schemas", () => {
  it("requires enough idea candidates for a useful spread", () => {
    const parsed = ideaSpreadArtifactSchema.safeParse({
      candidates: [
        {
          title: "A",
          hook: "hook",
          premise: "premise",
          differentiator: "different",
        },
      ],
    });

    expect(parsed.success).toBe(false);
  });

  it("requires a trial opening draft to contain at least three chapters", () => {
    const parsed = openingDraftArtifactSchema.safeParse({
      chapters: [
        {
          chapterNumber: 1,
          title: "第一章",
          body: "正文",
        },
      ],
    });

    expect(parsed.success).toBe(false);
  });
});
