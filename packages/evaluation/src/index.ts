import type { GateDecision, ReviewScorecard } from "@novel-harness/schemas";

const weights = {
  hookScore: 0.28,
  retentionScore: 0.24,
  noveltyScore: 0.14,
  proseScore: 0.14,
  serialPotentialScore: 0.2,
} satisfies Record<
  keyof Omit<ReviewScorecard, "riskFlags" | "notes" | "decisionSuggestion">,
  number
>;

export function computeWeightedScore(scorecard: ReviewScorecard) {
  return Math.round(
    scorecard.hookScore * weights.hookScore +
      scorecard.retentionScore * weights.retentionScore +
      scorecard.noveltyScore * weights.noveltyScore +
      scorecard.proseScore * weights.proseScore +
      scorecard.serialPotentialScore * weights.serialPotentialScore,
  );
}

export function suggestGateDecision(scorecard: ReviewScorecard): GateDecision {
  const weightedScore = computeWeightedScore(scorecard);

  if (weightedScore >= 78 && scorecard.riskFlags.length <= 2) {
    return "approve";
  }

  if (weightedScore >= 62) {
    return "revise";
  }

  if (weightedScore >= 48) {
    return "retry";
  }

  return "kill";
}
