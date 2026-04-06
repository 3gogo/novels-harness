import Fastify from "fastify";

import { suggestGateDecision } from "@novel-harness/evaluation";
import { defaultPromptTemplates } from "@novel-harness/prompts";
import { reviewScorecardSchema } from "@novel-harness/schemas";
import { defaultIncubationNodes, incubationNodeOrder } from "@novel-harness/workflows";

export function buildApp() {
  const app = Fastify({
    logger: true,
  });

  app.get("/health", async () => ({
    ok: true,
    service: "orchestrator",
    workflowNodes: incubationNodeOrder.length,
    promptTemplates: Object.keys(defaultPromptTemplates).length,
  }));

  app.get("/api/workflows/incubation", async () => ({
    order: incubationNodeOrder,
    nodes: defaultIncubationNodes,
  }));

  app.get("/api/prompts/roles", async () => ({
    roles: Object.values(defaultPromptTemplates),
  }));

  app.post("/api/evaluation/suggest", async (request, reply) => {
    const parsed = reviewScorecardSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return {
        ok: false,
        errors: parsed.error.flatten(),
      };
    }

    return {
      ok: true,
      decision: suggestGateDecision(parsed.data),
    };
  });

  return app;
}
