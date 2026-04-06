import { describe, expect, it } from "vitest";

import { batchSchema, reviewScorecardSchema } from "../src/index.js";

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
