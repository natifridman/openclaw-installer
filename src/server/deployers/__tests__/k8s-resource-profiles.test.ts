import { describe, it, expect } from "vitest";
import {
  getResourceProfile,
  applyCustomOverrides,
  calculateTotalResources,
  SMALL_PROFILE,
  MEDIUM_PROFILE,
  LARGE_PROFILE,
  XLARGE_PROFILE,
  type ResourceProfileSize,
} from "../k8s-resource-profiles.js";

describe("k8s-resource-profiles", () => {
  describe("getResourceProfile", () => {
    it("should return small profile", () => {
      const profile = getResourceProfile("small");
      expect(profile.size).toBe("small");
      expect(profile.gateway.requests.memory).toBe("512Mi");
      expect(profile.gateway.requests.cpu).toBe("125m");
    });

    it("should return medium profile", () => {
      const profile = getResourceProfile("medium");
      expect(profile.size).toBe("medium");
      expect(profile.gateway.requests.memory).toBe("1Gi");
      expect(profile.gateway.requests.cpu).toBe("250m");
    });

    it("should return large profile", () => {
      const profile = getResourceProfile("large");
      expect(profile.size).toBe("large");
      expect(profile.gateway.requests.memory).toBe("2Gi");
      expect(profile.gateway.requests.cpu).toBe("500m");
    });

    it("should return xlarge profile", () => {
      const profile = getResourceProfile("xlarge");
      expect(profile.size).toBe("xlarge");
      expect(profile.gateway.requests.memory).toBe("4Gi");
      expect(profile.gateway.requests.cpu).toBe("1000m");
    });

    it("should return medium profile for custom size", () => {
      const profile = getResourceProfile("custom");
      expect(profile.size).toBe("medium");
      expect(profile.gateway.requests.memory).toBe("1Gi");
    });

    it("should default to medium for invalid size", () => {
      const profile = getResourceProfile("invalid" as ResourceProfileSize);
      expect(profile.size).toBe("medium");
    });

    it("should include all container resource definitions", () => {
      const profile = getResourceProfile("medium");
      expect(profile.gateway).toBeDefined();
      expect(profile.initContainer).toBeDefined();
      expect(profile.litellm).toBeDefined();
      expect(profile.otelCollector).toBeDefined();
      expect(profile.agentCard).toBeDefined();
    });
  });

  describe("applyCustomOverrides", () => {
    it("should override gateway memory requests", () => {
      const base = MEDIUM_PROFILE;
      const overridden = applyCustomOverrides(base, {
        gateway: {
          requests: { memory: "3Gi", cpu: "500m" },
        },
      });

      expect(overridden.size).toBe("custom");
      expect(overridden.gateway.requests.memory).toBe("3Gi");
      expect(overridden.gateway.requests.cpu).toBe("500m");
      expect(overridden.gateway.limits.memory).toBe(base.gateway.limits.memory);
    });

    it("should override multiple containers", () => {
      const base = MEDIUM_PROFILE;
      const overridden = applyCustomOverrides(base, {
        gateway: {
          requests: { memory: "2Gi", cpu: "500m" },
        },
        litellm: {
          limits: { memory: "2Gi", cpu: "750m" },
        },
      });

      expect(overridden.gateway.requests.memory).toBe("2Gi");
      expect(overridden.litellm?.limits.memory).toBe("2Gi");
      expect(overridden.litellm?.limits.cpu).toBe("750m");
    });

    it("should preserve base values when no override provided", () => {
      const base = LARGE_PROFILE;
      const overridden = applyCustomOverrides(base, {
        gateway: {
          requests: { memory: "3Gi", cpu: base.gateway.requests.cpu },
        },
      });

      expect(overridden.gateway.requests.memory).toBe("3Gi");
      expect(overridden.gateway.requests.cpu).toBe(base.gateway.requests.cpu);
      expect(overridden.initContainer).toEqual(base.initContainer);
    });

    it("should handle partial overrides", () => {
      const base = SMALL_PROFILE;
      const overridden = applyCustomOverrides(base, {
        gateway: {
          requests: { memory: "1Gi" },
        } as any,
      });

      expect(overridden.gateway.requests.memory).toBe("1Gi");
      expect(overridden.gateway.requests.cpu).toBe(base.gateway.requests.cpu);
    });
  });

  describe("calculateTotalResources", () => {
    it("should calculate total for gateway only", () => {
      const totals = calculateTotalResources(MEDIUM_PROFILE, {
        useLitellm: false,
        useOtel: false,
        useA2a: false,
      });

      // Gateway (1Gi requests + 4Gi limits) + Init (64Mi requests + 128Mi limits)
      expect(totals.totalMemoryRequests).toBe("1.06Gi");
      expect(totals.totalMemoryLimits).toBe("4.13Gi");
      expect(totals.totalCpuRequests).toBe("300m"); // 250m + 50m
      expect(totals.totalCpuLimits).toBe("1.20"); // 1000m + 200m = 1200m = 1.20 cores
    });

    it("should include LiteLLM when enabled", () => {
      const totals = calculateTotalResources(MEDIUM_PROFILE, {
        useLitellm: true,
        useOtel: false,
        useA2a: false,
      });

      // Gateway (1Gi) + Init (64Mi) + LiteLLM (512Mi) = 1600Mi = 1.56Gi
      expect(totals.totalMemoryRequests).toBe("1.56Gi");
      expect(totals.totalCpuRequests).toBe("400m"); // 250m + 50m + 100m
    });

    it("should include OTEL when enabled", () => {
      const totals = calculateTotalResources(MEDIUM_PROFILE, {
        useLitellm: false,
        useOtel: true,
        useA2a: false,
      });

      // Gateway (1Gi) + Init (64Mi) + OTEL (128Mi) = 1216Mi = 1.19Gi
      expect(totals.totalMemoryRequests).toBe("1.19Gi");
      expect(totals.totalCpuRequests).toBe("400m"); // 250m + 50m + 100m
    });

    it("should include A2A when enabled", () => {
      const totals = calculateTotalResources(MEDIUM_PROFILE, {
        useLitellm: false,
        useOtel: false,
        useA2a: true,
      });

      // Gateway (1Gi) + Init (64Mi) + A2A (32Mi) = 1120Mi = 1.09Gi
      expect(totals.totalMemoryRequests).toBe("1.09Gi");
      expect(totals.totalCpuRequests).toBe("310m"); // 250m + 50m + 10m
    });

    it("should include all sidecars when enabled", () => {
      const totals = calculateTotalResources(MEDIUM_PROFILE, {
        useLitellm: true,
        useOtel: true,
        useA2a: true,
      });

      // Gateway (1Gi) + Init (64Mi) + LiteLLM (512Mi) + OTEL (128Mi) + A2A (32Mi) = 1760Mi = 1.72Gi
      expect(totals.totalMemoryRequests).toBe("1.72Gi");
      expect(totals.totalCpuRequests).toBe("510m"); // 250m + 50m + 100m + 100m + 10m
    });

    it("should format memory in Gi for large values", () => {
      const totals = calculateTotalResources(XLARGE_PROFILE, {
        useLitellm: true,
        useOtel: true,
        useA2a: true,
      });

      // Should be in Gi since total > 1024Mi
      expect(totals.totalMemoryRequests).toMatch(/Gi$/);
      expect(totals.totalMemoryLimits).toMatch(/Gi$/);
    });

    it("should format CPU in cores for large values", () => {
      const totals = calculateTotalResources(XLARGE_PROFILE, {
        useLitellm: true,
        useOtel: true,
        useA2a: true,
      });

      // Total CPU should be >= 1000m, formatted as cores
      const cpuRequests = totals.totalCpuRequests;
      expect(cpuRequests).toMatch(/^\d+\.\d+$/); // Should be like "1.84" (cores)
    });

    it("should calculate correctly for small profile", () => {
      const totals = calculateTotalResources(SMALL_PROFILE, {
        useLitellm: false,
        useOtel: false,
        useA2a: false,
      });

      // Gateway (512Mi) + Init (32Mi) = 544Mi
      expect(totals.totalMemoryRequests).toBe("544Mi");
      expect(totals.totalCpuRequests).toBe("150m"); // 125m + 25m
    });

    it("should calculate correctly for large profile with all sidecars", () => {
      const totals = calculateTotalResources(LARGE_PROFILE, {
        useLitellm: true,
        useOtel: true,
        useA2a: true,
      });

      // Gateway (2Gi) + Init (128Mi) + LiteLLM (1Gi) + OTEL (256Mi) + A2A (64Mi)
      expect(totals.totalMemoryRequests).toMatch(/Gi$/);
      const memoryValue = Number.parseFloat(totals.totalMemoryRequests);
      expect(memoryValue).toBeGreaterThan(3); // > 3Gi total
    });
  });

  describe("profile consistency", () => {
    it("should have increasing resource allocations across profiles", () => {
      const profiles = [SMALL_PROFILE, MEDIUM_PROFILE, LARGE_PROFILE, XLARGE_PROFILE];

      for (let i = 0; i < profiles.length - 1; i++) {
        const current = profiles[i];
        const next = profiles[i + 1];

        // Parse memory values for comparison (simplified check)
        const parseMemory = (mem: string) => {
          const match = mem.match(/^(\d+)(Mi|Gi)$/);
          if (!match) return 0;
          const value = Number.parseInt(match[1]);
          return match[2] === "Gi" ? value * 1024 : value;
        };

        const currentMemory = parseMemory(current.gateway.requests.memory);
        const nextMemory = parseMemory(next.gateway.requests.memory);

        expect(nextMemory).toBeGreaterThan(currentMemory);
      }
    });

    it("should have requests less than or equal to limits", () => {
      const profiles = [SMALL_PROFILE, MEDIUM_PROFILE, LARGE_PROFILE, XLARGE_PROFILE];

      for (const profile of profiles) {
        const parseMemory = (mem: string) => {
          const match = mem.match(/^(\d+)(Mi|Gi)$/);
          if (!match) return 0;
          const value = Number.parseInt(match[1]);
          return match[2] === "Gi" ? value * 1024 : value;
        };

        const requestMemory = parseMemory(profile.gateway.requests.memory);
        const limitMemory = parseMemory(profile.gateway.limits.memory);

        expect(limitMemory).toBeGreaterThanOrEqual(requestMemory);
      }
    });
  });
});
