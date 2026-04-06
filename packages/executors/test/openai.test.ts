import { describe, expect, it } from "vitest";

import { createOpenAIExecutorFromEnv } from "../src/openai.js";

describe("createOpenAIExecutorFromEnv", () => {
  it("returns null when OPENAI_API_KEY is missing", () => {
    expect(createOpenAIExecutorFromEnv({})).toBeNull();
  });

  it("returns an openai executor when OPENAI_API_KEY exists", () => {
    const resolved = createOpenAIExecutorFromEnv({
      OPENAI_API_KEY: "test-key",
      OPENAI_MODEL: "gpt-5-mini",
    });

    expect(resolved?.mode).toBe("openai");
    expect(resolved?.modelId).toBe("gpt-5-mini");
  });
});
