import { readFile } from "node:fs/promises";
import { URL } from "node:url";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";

import { defaultPromptTemplates } from "@novel-harness/prompts";
import {
  conceptPackArtifactSchema,
  ideaSpreadArtifactSchema,
  openingDraftArtifactSchema,
  reviewScorecardSchema,
  type FailureType,
  type NodeName,
  type ReviewScorecard,
} from "@novel-harness/schemas";

import type { ExecutorAdapter, ExecutorResult, ResolvedExecutor, RunContract } from "./types.js";

export interface OpenAIResponsesExecutorOptions {
  apiKey: string;
  model?: string;
  baseURL?: string;
  adapterId?: string;
  reasoningEffort?: "minimal" | "low" | "medium" | "high";
}

type StructuredNodeName =
  | "idea_spread"
  | "concept_pack"
  | "opening_draft"
  | "opening_review";

const structuredNodeSpecs = {
  idea_spread: {
    schema: ideaSpreadArtifactSchema,
    formatName: "idea_spread_artifact",
    maxOutputTokens: 2400,
    outputReminder:
      "Return 4-6 high-upside idea candidates with Chinese title, hook, premise, and differentiator.",
  },
  concept_pack: {
    schema: conceptPackArtifactSchema,
    formatName: "concept_pack_artifact",
    maxOutputTokens: 2600,
    outputReminder:
      "Return one complete concept pack in Simplified Chinese, with clear serial promise and strong commercial readability.",
  },
  opening_draft: {
    schema: openingDraftArtifactSchema,
    formatName: "opening_draft_artifact",
    maxOutputTokens: 5200,
    outputReminder:
      "Return 3 opening chapters in Simplified Chinese with strong hook density and readable serialized pacing.",
  },
  opening_review: {
    schema: reviewScorecardSchema,
    formatName: "opening_review_artifact",
    maxOutputTokens: 1400,
    outputReminder:
      "Return a strict review scorecard in Simplified Chinese with grounded notes and realistic risk flags.",
  },
} as const;

export class OpenAIResponsesExecutor implements ExecutorAdapter {
  readonly id: string;
  readonly displayName = "OpenAI Responses Executor";
  readonly modelId: string;

  private readonly client: OpenAI;
  private readonly endpointLabel: string;
  private readonly reasoningEffort?: OpenAIResponsesExecutorOptions["reasoningEffort"];

  constructor(options: OpenAIResponsesExecutorOptions) {
    this.id = options.adapterId ?? "openai-responses";
    this.modelId = options.model ?? "gpt-5-mini";
    this.endpointLabel = describeEndpoint(options.baseURL);
    this.reasoningEffort = options.reasoningEffort;
    this.client = new OpenAI({
      apiKey: options.apiKey,
      ...(options.baseURL ? { baseURL: options.baseURL } : {}),
    });
  }

  async run(contract: RunContract): Promise<ExecutorResult> {
    const startedAt = new Date().toISOString();
    const spec = getStructuredNodeSpec(contract.nodeName);

    if (!spec) {
      return failureResult({
        adapterId: this.id,
        modelId: this.modelId,
        startedAt,
        failureType: "terminal",
        errorMessage: `OpenAI executor does not support node ${contract.nodeName}.`,
      });
    }

    const template = defaultPromptTemplates[contract.roleName];

    try {
      const contextBlock = await buildContextBlock(contract.contextRefs);
      const request: Parameters<typeof this.client.responses.parse>[0] = {
        model: this.modelId,
        input: [
          {
            role: "system" as const,
            content: buildSystemPrompt({
              systemPrompt: template.systemPrompt,
              rubric: template.rubric,
              outputReminder: spec.outputReminder,
            }),
          },
          {
            role: "user" as const,
            content: buildUserPrompt({
              contract,
              contextBlock,
            }),
          },
        ],
        max_output_tokens: spec.maxOutputTokens,
        text: {
          format: zodTextFormat(spec.schema, spec.formatName),
        },
      };

      const reasoningEffort = this.reasoningEffort;
      if (reasoningEffort && shouldAttachReasoning(this.modelId, reasoningEffort)) {
        Object.assign(request, {
          reasoning: {
            effort: reasoningEffort,
          },
        });
      }

      const response = await this.client.responses.parse(request);
      const parsed = response.output_parsed;
      const usage = extractUsage(response);

      if (!parsed) {
        return failureResult({
          adapterId: this.id,
          modelId: this.modelId,
          startedAt,
          failureType: "review_required",
          errorMessage:
            response.output_text?.trim() ||
            "Model returned no structured output.",
          ...(usage ? { usage } : {}),
        });
      }

      const trace = {
        adapterId: this.id,
        modelId: this.modelId,
        startedAt,
        completedAt: new Date().toISOString(),
        ...(usage ? { usage } : {}),
      };

      return {
        status: "succeeded",
        artifact: parsed,
        metrics: extractMetrics(contract.nodeName, parsed),
        trace,
      };
    } catch (error) {
      return failureResult({
        adapterId: this.id,
        modelId: this.modelId,
        startedAt,
        failureType: classifyOpenAIError(error),
        errorMessage: formatOpenAIError(error, this.endpointLabel, this.modelId),
      });
    }
  }
}

export function createOpenAIExecutorFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ResolvedExecutor | null {
  const apiKey = env.OPENAI_API_KEY;

  if (!apiKey) {
    return null;
  }

  const options: OpenAIResponsesExecutorOptions = {
    apiKey,
    model: env.OPENAI_MODEL ?? "gpt-5-mini",
  };
  const baseURL = env.OPENAI_BASE_URL;
  const reasoningEffort = parseReasoningEffort(env.OPENAI_REASONING_EFFORT);

  if (baseURL) {
    options.baseURL = baseURL;
  }

  if (reasoningEffort) {
    options.reasoningEffort = reasoningEffort;
  }

  const executor = new OpenAIResponsesExecutor(options);

  return {
    executor,
    mode: "openai",
    adapterId: executor.id,
    displayName: executor.displayName,
    modelId: executor.modelId,
    reason: "OPENAI_API_KEY detected; using OpenAI Responses API.",
  };
}

function getStructuredNodeSpec(nodeName: NodeName) {
  if (nodeName in structuredNodeSpecs) {
    return structuredNodeSpecs[nodeName as StructuredNodeName];
  }

  return null;
}

async function buildContextBlock(contextRefs: string[]) {
  if (contextRefs.length === 0) {
    return "No prior artifact context was provided.";
  }

  const contextParts = await Promise.all(
    contextRefs.slice(0, 6).map(async (filePath, index) => {
      try {
        const content = await readFile(filePath, "utf8");
        const trimmed = content.length > 12000
          ? `${content.slice(0, 9000)}\n\n...[truncated]...\n\n${content.slice(-2000)}`
          : content;

        return [
          `### Context ${index + 1}`,
          `Path: ${filePath}`,
          trimmed,
        ].join("\n");
      } catch (error) {
        return [
          `### Context ${index + 1}`,
          `Path: ${filePath}`,
          `Unreadable context: ${error instanceof Error ? error.message : String(error)}`,
        ].join("\n");
      }
    }),
  );

  return contextParts.join("\n\n");
}

function buildSystemPrompt(input: {
  systemPrompt: string;
  rubric: string[];
  outputReminder: string;
}) {
  return [
    "You are part of a Chinese web-novel production harness.",
    "Write all narrative-facing text in Simplified Chinese.",
    input.systemPrompt,
    `Rubric priorities: ${input.rubric.join(", ")}.`,
    input.outputReminder,
    "Follow the requested schema exactly. Do not add commentary outside the schema.",
  ].join("\n");
}

function buildUserPrompt(input: {
  contract: RunContract;
  contextBlock: string;
}) {
  return [
    `Project ID: ${input.contract.projectId}`,
    `Workflow Node: ${input.contract.nodeName}`,
    `Role: ${input.contract.roleName}`,
    "",
    "Task Brief:",
    input.contract.taskBrief,
    "",
    "Constraints:",
    ...input.contract.constraints.map((constraint) => `- ${constraint}`),
    "",
    "Context Artifacts:",
    input.contextBlock,
  ].join("\n");
}

function extractMetrics(nodeName: NodeName, artifact: unknown) {
  switch (nodeName) {
    case "idea_spread":
      return {
        candidateCount:
          typeof artifact === "object" &&
          artifact !== null &&
          "candidates" in artifact &&
          Array.isArray((artifact as { candidates?: unknown[] }).candidates)
            ? (artifact as { candidates: unknown[] }).candidates.length
            : 0,
      };
    case "opening_draft":
      return {
        chapterCount:
          typeof artifact === "object" &&
          artifact !== null &&
          "chapters" in artifact &&
          Array.isArray((artifact as { chapters?: unknown[] }).chapters)
            ? (artifact as { chapters: unknown[] }).chapters.length
            : 0,
      };
    case "opening_review": {
      const scorecard = artifact as ReviewScorecard;
      return {
        hookScore: scorecard.hookScore,
        retentionScore: scorecard.retentionScore,
        serialPotentialScore: scorecard.serialPotentialScore,
      };
    }
    default:
      return {};
  }
}

function extractUsage(response: {
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}) {
  if (!response.usage) {
    return undefined;
  }

  const usage: {
    inputTokens?: number;
    outputTokens?: number;
  } = {};

  if (typeof response.usage.input_tokens === "number") {
    usage.inputTokens = response.usage.input_tokens;
  }

  if (typeof response.usage.output_tokens === "number") {
    usage.outputTokens = response.usage.output_tokens;
  }

  return Object.keys(usage).length > 0 ? usage : undefined;
}

function shouldAttachReasoning(
  modelId: string,
  reasoningEffort?: OpenAIResponsesExecutorOptions["reasoningEffort"],
) {
  return Boolean(reasoningEffort) && /^gpt-5|^o[13]/.test(modelId);
}

function parseReasoningEffort(
  value: string | undefined,
): OpenAIResponsesExecutorOptions["reasoningEffort"] | undefined {
  if (
    value === "minimal" ||
    value === "low" ||
    value === "medium" ||
    value === "high"
  ) {
    return value;
  }

  return undefined;
}

function describeEndpoint(baseURL?: string) {
  if (!baseURL) {
    return "api.openai.com";
  }

  try {
    return new URL(baseURL).host || baseURL;
  } catch {
    return baseURL;
  }
}

function formatOpenAIError(
  error: unknown,
  endpointLabel: string,
  modelId: string,
) {
  const providerLabel = endpointLabel === "api.openai.com"
    ? "OpenAI API"
    : `OpenAI-compatible endpoint ${endpointLabel}`;

  if (error instanceof OpenAI.APIError) {
    return `${providerLabel} rejected model ${modelId}: ${error.status} ${error.message}`;
  }

  return error instanceof Error
    ? `${providerLabel} failed for model ${modelId}: ${error.message}`
    : `${providerLabel} failed for model ${modelId}: ${String(error)}`;
}

function classifyOpenAIError(error: unknown): FailureType {
  if (error instanceof OpenAI.APIConnectionError) {
    return "retryable";
  }

  if (error instanceof OpenAI.RateLimitError) {
    return "retryable";
  }

  if (error instanceof OpenAI.InternalServerError) {
    return "retryable";
  }

  if (error instanceof OpenAI.BadRequestError) {
    return "terminal";
  }

  if (error instanceof OpenAI.AuthenticationError) {
    return "terminal";
  }

  if (error instanceof OpenAI.PermissionDeniedError) {
    return "terminal";
  }

  if (error instanceof OpenAI.NotFoundError) {
    return "terminal";
  }

  return "review_required";
}

function failureResult(input: {
  adapterId: string;
  modelId: string;
  startedAt: string;
  failureType: FailureType;
  errorMessage: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
}): ExecutorResult {
  const trace = {
    adapterId: input.adapterId,
    modelId: input.modelId,
    startedAt: input.startedAt,
    completedAt: new Date().toISOString(),
    ...(input.usage ? { usage: input.usage } : {}),
  };

  return {
    status: "failed",
    metrics: {},
    failureType: input.failureType,
    errorMessage: input.errorMessage,
    trace,
  };
}
