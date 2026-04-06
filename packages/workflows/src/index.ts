import type { ArtifactKind, FailureType, NodeName, RoleName } from "@novel-harness/schemas";

export interface WorkflowNodeDefinition {
  name: NodeName;
  description: string;
  inputKinds: ArtifactKind[];
  outputKinds: ArtifactKind[];
  roleNames: RoleName[];
  retryLimit: number;
  recoverableFailureTypes: FailureType[];
}

export const incubationNodeOrder: NodeName[] = [
  "batch_brief",
  "idea_spread",
  "concept_pack",
  "opening_draft",
  "opening_review",
  "promotion_decision",
];

export const defaultIncubationNodes: WorkflowNodeDefinition[] = [
  {
    name: "batch_brief",
    description: "Freeze the batch brief and route it into idea generation.",
    inputKinds: ["batch_brief"],
    outputKinds: ["batch_brief"],
    roleNames: ["trend_scout"],
    retryLimit: 1,
    recoverableFailureTypes: ["retryable"],
  },
  {
    name: "idea_spread",
    description: "Generate candidate hooks, titles, and lanes.",
    inputKinds: ["batch_brief"],
    outputKinds: ["idea_card"],
    roleNames: ["trend_scout", "trope_mixer", "positioning_editor"],
    retryLimit: 2,
    recoverableFailureTypes: ["retryable", "repairable"],
  },
  {
    name: "concept_pack",
    description: "Expand shortlisted ideas into structured concept packs.",
    inputKinds: ["idea_card"],
    outputKinds: ["concept_pack"],
    roleNames: ["concept_packer"],
    retryLimit: 2,
    recoverableFailureTypes: ["retryable", "repairable"],
  },
  {
    name: "opening_draft",
    description: "Draft opening chapters for finalist concepts.",
    inputKinds: ["concept_pack"],
    outputKinds: ["opening_draft"],
    roleNames: ["opening_drafter", "hook_surgeon"],
    retryLimit: 2,
    recoverableFailureTypes: ["retryable", "repairable"],
  },
  {
    name: "opening_review",
    description: "Score hook force, retention risk, and serial potential.",
    inputKinds: ["concept_pack", "opening_draft"],
    outputKinds: ["review_scorecard"],
    roleNames: ["market_reviewer", "story_critic"],
    retryLimit: 1,
    recoverableFailureTypes: ["retryable", "review_required"],
  },
  {
    name: "promotion_decision",
    description: "Emit the gate decision for promotion, retry, or kill.",
    inputKinds: ["review_scorecard"],
    outputKinds: ["decision_record"],
    roleNames: ["promotion_judge"],
    retryLimit: 1,
    recoverableFailureTypes: ["review_required"],
  },
];
