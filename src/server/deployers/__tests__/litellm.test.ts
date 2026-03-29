import { describe, expect, it } from "vitest";
import {
  generateLitellmConfig,
  litellmSidecarEnvVars,
  litellmRegisteredModelNames,
  litellmModelName,
} from "../litellm.js";
import type { DeployConfig } from "../types.js";

function makeConfig(overrides: Partial<DeployConfig> = {}): DeployConfig {
  return {
    mode: "kubernetes",
    agentName: "test",
    agentDisplayName: "Test",
    vertexEnabled: true,
    gcpServiceAccountJson: '{"project_id":"test-project"}',
    googleCloudProject: "test-project",
    googleCloudLocation: "us-central1",
    ...overrides,
  };
}

// Regression tests for #78: secondary provider API keys and models in LiteLLM proxy
describe("litellm multi-provider support (#78)", () => {
  describe("generateLitellmConfig", () => {
    it("includes OpenAI model entry when openaiApiKey is configured", () => {
      const config = makeConfig({ openaiApiKey: "sk-oai-test" });
      const yaml = generateLitellmConfig(config, "sk-master");

      expect(yaml).toContain("model_name: gpt-5.4");
      expect(yaml).toContain("model: openai/gpt-5.4");
      // OpenAI models should not have vertex params
      const lines = yaml.split("\n");
      const gptLine = lines.findIndex((l) => l.includes("model_name: gpt-5.4"));
      const paramsSection = lines.slice(gptLine, gptLine + 5).join("\n");
      expect(paramsSection).not.toContain("vertex_project");
    });

    it("includes Anthropic model entry when anthropicApiKey is configured", () => {
      // With vertex-google as primary, adding direct Anthropic as secondary
      const config = makeConfig({
        vertexProvider: "google",
        anthropicApiKey: "sk-ant-test",
      });
      const yaml = generateLitellmConfig(config, "sk-master");

      expect(yaml).toContain("model_name: claude-sonnet-4-6");
      expect(yaml).toContain("model: anthropic/claude-sonnet-4-6");
    });

    it("does not duplicate model_name when secondary matches existing Vertex model", () => {
      // Vertex Anthropic primary already has claude-sonnet-4-6; adding direct
      // Anthropic with same model name should not create a duplicate entry.
      const config = makeConfig({
        vertexProvider: "anthropic",
        anthropicApiKey: "sk-ant-test",
      });
      const yaml = generateLitellmConfig(config, "sk-master");

      const matches = yaml.match(/model_name: claude-sonnet-4-6/g);
      expect(matches).toHaveLength(1);
    });

    it("uses custom openaiModel name when specified", () => {
      const config = makeConfig({
        openaiApiKey: "sk-oai-test",
        openaiModel: "gpt-4.1",
      });
      const yaml = generateLitellmConfig(config, "sk-master");

      expect(yaml).toContain("model_name: gpt-4.1");
      expect(yaml).toContain("model: openai/gpt-4.1");
    });

    it("still includes Vertex models alongside secondary providers", () => {
      const config = makeConfig({
        vertexProvider: "anthropic",
        openaiApiKey: "sk-oai-test",
      });
      const yaml = generateLitellmConfig(config, "sk-master");

      // Vertex primary models
      expect(yaml).toContain("model: vertex_ai/claude-sonnet-4-6");
      expect(yaml).toContain("model: vertex_ai/claude-haiku-4-5");
      // Secondary OpenAI model
      expect(yaml).toContain("model: openai/gpt-5.4");
    });

    it("includes secondary models when openaiApiKeyRef is set instead of raw key", () => {
      const config = makeConfig({
        openaiApiKeyRef: { source: "env", provider: "default", id: "OPENAI_API_KEY" },
      });
      const yaml = generateLitellmConfig(config, "sk-master");

      expect(yaml).toContain("model_name: gpt-5.4");
    });

    it("omits secondary models when no secondary provider keys are configured", () => {
      const config = makeConfig();
      const yaml = generateLitellmConfig(config, "sk-master");

      expect(yaml).not.toContain("model: openai/");
      expect(yaml).not.toContain("model: anthropic/");
    });
  });

  describe("litellmSidecarEnvVars", () => {
    it("returns OPENAI_API_KEY when configured", () => {
      const config = makeConfig({ openaiApiKey: "sk-oai-test" });
      const env = litellmSidecarEnvVars(config);

      expect(env).toEqual({ OPENAI_API_KEY: "sk-oai-test" });
    });

    it("returns ANTHROPIC_API_KEY when configured", () => {
      const config = makeConfig({ anthropicApiKey: "sk-ant-test" });
      const env = litellmSidecarEnvVars(config);

      expect(env).toEqual({ ANTHROPIC_API_KEY: "sk-ant-test" });
    });

    it("returns both keys when both are configured", () => {
      const config = makeConfig({
        openaiApiKey: "sk-oai-test",
        anthropicApiKey: "sk-ant-test",
      });
      const env = litellmSidecarEnvVars(config);

      expect(env).toEqual({
        OPENAI_API_KEY: "sk-oai-test",
        ANTHROPIC_API_KEY: "sk-ant-test",
      });
    });

    it("returns empty object when no secondary keys are configured", () => {
      const config = makeConfig();
      const env = litellmSidecarEnvVars(config);

      expect(env).toEqual({});
    });
  });

  describe("litellmRegisteredModelNames", () => {
    it("returns Vertex models plus secondary OpenAI model", () => {
      const config = makeConfig({
        vertexProvider: "anthropic",
        openaiApiKey: "sk-oai-test",
      });
      const names = litellmRegisteredModelNames(config);

      expect(names).toContain("claude-sonnet-4-6");
      expect(names).toContain("claude-haiku-4-5");
      expect(names).toContain("gpt-5.4");
    });

    it("returns only Vertex models when no secondary providers", () => {
      const config = makeConfig({ vertexProvider: "anthropic" });
      const names = litellmRegisteredModelNames(config);

      expect(names).toEqual(["claude-sonnet-4-6", "claude-haiku-4-5"]);
    });

    it("returns Google Vertex models when vertexProvider is google", () => {
      const config = makeConfig({ vertexProvider: "google" });
      const names = litellmRegisteredModelNames(config);

      expect(names).toEqual(["gemini-2.5-pro", "gemini-2.5-flash"]);
    });
  });
});
