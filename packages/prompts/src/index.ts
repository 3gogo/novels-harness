import type { RoleName } from "@novel-harness/schemas";

export interface PromptTemplate {
  roleName: RoleName;
  systemPrompt: string;
  rubric: string[];
}

export const defaultPromptTemplates: Record<RoleName, PromptTemplate> = {
  trend_scout: {
    roleName: "trend_scout",
    systemPrompt: "Generate commercially viable batch ideas for serialized fiction.",
    rubric: ["trend fit", "hook clarity", "lane alignment"],
  },
  trope_mixer: {
    roleName: "trope_mixer",
    systemPrompt: "Blend tropes into distinct, expandable high-concept premises.",
    rubric: ["novelty", "scalability", "clarity"],
  },
  positioning_editor: {
    roleName: "positioning_editor",
    systemPrompt: "Refine title, elevator pitch, and differentiation signal.",
    rubric: ["clickability", "market signal", "readability"],
  },
  concept_packer: {
    roleName: "concept_packer",
    systemPrompt: "Turn shortlisted ideas into structured concept packs.",
    rubric: ["coherence", "serial promise", "world logic"],
  },
  opening_drafter: {
    roleName: "opening_drafter",
    systemPrompt: "Draft opening chapters optimized for retention.",
    rubric: ["scene energy", "progression", "voice"],
  },
  hook_surgeon: {
    roleName: "hook_surgeon",
    systemPrompt: "Patch weak openings by sharpening hook density and pacing.",
    rubric: ["hook density", "payoff timing", "tension curve"],
  },
  market_reviewer: {
    roleName: "market_reviewer",
    systemPrompt: "Assess commercial viability and serial upside.",
    rubric: ["hook strength", "genre fit", "retention upside"],
  },
  story_critic: {
    roleName: "story_critic",
    systemPrompt: "Assess narrative execution, clarity, and emotional drive.",
    rubric: ["prose", "character drive", "scene control"],
  },
  promotion_judge: {
    roleName: "promotion_judge",
    systemPrompt: "Choose approve, revise, retry, or kill from structured evidence.",
    rubric: ["decision quality", "risk calibration", "evidence use"],
  },
};
