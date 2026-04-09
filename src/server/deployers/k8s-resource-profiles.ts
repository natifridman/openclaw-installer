/**
 * Kubernetes resource profiles for OpenClaw deployments
 *
 * Provides configurable CPU and memory allocations for different deployment sizes.
 * Each profile defines requests (guaranteed resources) and limits (maximum burst).
 */

export type ResourceProfileSize = "small" | "medium" | "large" | "xlarge" | "custom";

export interface ContainerResources {
  requests: {
    memory: string;
    cpu: string;
  };
  limits: {
    memory: string;
    cpu: string;
  };
}

export interface ResourceProfile {
  size: ResourceProfileSize;
  description: string;
  gateway: ContainerResources;
  initContainer: ContainerResources;
  litellm?: ContainerResources;
  otelCollector?: ContainerResources;
  agentCard?: ContainerResources;
}

export interface CustomResourceOverrides {
  gateway?: Partial<ContainerResources>;
  initContainer?: Partial<ContainerResources>;
  litellm?: Partial<ContainerResources>;
  otelCollector?: Partial<ContainerResources>;
  agentCard?: Partial<ContainerResources>;
}

/**
 * Small profile: Development/testing environments
 * Minimal resource footprint for lightweight deployments
 */
export const SMALL_PROFILE: ResourceProfile = {
  size: "small",
  description: "Development/testing (minimal resources)",
  gateway: {
    requests: { memory: "512Mi", cpu: "125m" },
    limits: { memory: "2Gi", cpu: "500m" },
  },
  initContainer: {
    requests: { memory: "32Mi", cpu: "25m" },
    limits: { memory: "64Mi", cpu: "100m" },
  },
  litellm: {
    requests: { memory: "256Mi", cpu: "50m" },
    limits: { memory: "512Mi", cpu: "250m" },
  },
  otelCollector: {
    requests: { memory: "64Mi", cpu: "50m" },
    limits: { memory: "128Mi", cpu: "100m" },
  },
  agentCard: {
    requests: { memory: "16Mi", cpu: "5m" },
    limits: { memory: "32Mi", cpu: "25m" },
  },
};

/**
 * Medium profile: Production-ready with balanced resources
 * Current default allocation, suitable for most production workloads
 */
export const MEDIUM_PROFILE: ResourceProfile = {
  size: "medium",
  description: "Production (balanced resources, default)",
  gateway: {
    requests: { memory: "1Gi", cpu: "250m" },
    limits: { memory: "4Gi", cpu: "1000m" },
  },
  initContainer: {
    requests: { memory: "64Mi", cpu: "50m" },
    limits: { memory: "128Mi", cpu: "200m" },
  },
  litellm: {
    requests: { memory: "512Mi", cpu: "100m" },
    limits: { memory: "1Gi", cpu: "500m" },
  },
  otelCollector: {
    requests: { memory: "128Mi", cpu: "100m" },
    limits: { memory: "256Mi", cpu: "200m" },
  },
  agentCard: {
    requests: { memory: "32Mi", cpu: "10m" },
    limits: { memory: "64Mi", cpu: "50m" },
  },
};

/**
 * Large profile: High-performance production
 * Increased resources for demanding workloads with many concurrent agents
 */
export const LARGE_PROFILE: ResourceProfile = {
  size: "large",
  description: "High-performance production (increased resources)",
  gateway: {
    requests: { memory: "2Gi", cpu: "500m" },
    limits: { memory: "8Gi", cpu: "2000m" },
  },
  initContainer: {
    requests: { memory: "128Mi", cpu: "100m" },
    limits: { memory: "256Mi", cpu: "400m" },
  },
  litellm: {
    requests: { memory: "1Gi", cpu: "200m" },
    limits: { memory: "2Gi", cpu: "1000m" },
  },
  otelCollector: {
    requests: { memory: "256Mi", cpu: "200m" },
    limits: { memory: "512Mi", cpu: "400m" },
  },
  agentCard: {
    requests: { memory: "64Mi", cpu: "20m" },
    limits: { memory: "128Mi", cpu: "100m" },
  },
};

/**
 * XLarge profile: Enterprise scale
 * Maximum resources for large-scale deployments with many agents
 */
export const XLARGE_PROFILE: ResourceProfile = {
  size: "xlarge",
  description: "Enterprise scale (maximum resources)",
  gateway: {
    requests: { memory: "4Gi", cpu: "1000m" },
    limits: { memory: "16Gi", cpu: "4000m" },
  },
  initContainer: {
    requests: { memory: "256Mi", cpu: "200m" },
    limits: { memory: "512Mi", cpu: "800m" },
  },
  litellm: {
    requests: { memory: "2Gi", cpu: "400m" },
    limits: { memory: "4Gi", cpu: "2000m" },
  },
  otelCollector: {
    requests: { memory: "512Mi", cpu: "400m" },
    limits: { memory: "1Gi", cpu: "800m" },
  },
  agentCard: {
    requests: { memory: "128Mi", cpu: "40m" },
    limits: { memory: "256Mi", cpu: "200m" },
  },
};

/**
 * Get a resource profile by size name
 */
export function getResourceProfile(size: ResourceProfileSize): ResourceProfile {
  switch (size) {
    case "small":
      return SMALL_PROFILE;
    case "medium":
      return MEDIUM_PROFILE;
    case "large":
      return LARGE_PROFILE;
    case "xlarge":
      return XLARGE_PROFILE;
    case "custom":
      // Return medium as base for custom profiles
      return MEDIUM_PROFILE;
    default:
      return MEDIUM_PROFILE;
  }
}

/**
 * Merge custom resource overrides with a base profile
 */
export function applyCustomOverrides(
  baseProfile: ResourceProfile,
  overrides: CustomResourceOverrides,
): ResourceProfile {
  const mergeResources = (
    base: ContainerResources,
    override?: Partial<ContainerResources>,
  ): ContainerResources => {
    if (!override) return base;
    return {
      requests: {
        memory: override.requests?.memory ?? base.requests.memory,
        cpu: override.requests?.cpu ?? base.requests.cpu,
      },
      limits: {
        memory: override.limits?.memory ?? base.limits.memory,
        cpu: override.limits?.cpu ?? base.limits.cpu,
      },
    };
  };

  return {
    ...baseProfile,
    size: "custom",
    description: "Custom resource profile",
    gateway: mergeResources(baseProfile.gateway, overrides.gateway),
    initContainer: mergeResources(baseProfile.initContainer, overrides.initContainer),
    litellm: overrides.litellm || baseProfile.litellm
      ? mergeResources(baseProfile.litellm || MEDIUM_PROFILE.litellm!, overrides.litellm)
      : undefined,
    otelCollector: overrides.otelCollector || baseProfile.otelCollector
      ? mergeResources(baseProfile.otelCollector || MEDIUM_PROFILE.otelCollector!, overrides.otelCollector)
      : undefined,
    agentCard: overrides.agentCard || baseProfile.agentCard
      ? mergeResources(baseProfile.agentCard || MEDIUM_PROFILE.agentCard!, overrides.agentCard)
      : undefined,
  };
}

/**
 * Calculate total resource requests for a profile (useful for quota checking)
 */
export function calculateTotalResources(
  profile: ResourceProfile,
  options: {
    useLitellm?: boolean;
    useOtel?: boolean;
    useA2a?: boolean;
  } = {},
): { totalMemoryRequests: string; totalCpuRequests: string; totalMemoryLimits: string; totalCpuLimits: string } {
  const parseMemory = (mem: string): number => {
    const match = mem.match(/^(\d+(?:\.\d+)?)(Mi|Gi|M|G)$/);
    if (!match) return 0;
    const value = Number.parseFloat(match[1]);
    const unit = match[2];
    // Convert to MiB
    switch (unit) {
      case "Gi":
      case "G":
        return value * 1024;
      case "Mi":
      case "M":
        return value;
      default:
        return 0;
    }
  };

  const parseCpu = (cpu: string): number => {
    if (cpu.endsWith("m")) {
      return Number.parseInt(cpu.slice(0, -1));
    }
    return Number.parseFloat(cpu) * 1000;
  };

  let memoryRequests = parseMemory(profile.gateway.requests.memory);
  let cpuRequests = parseCpu(profile.gateway.requests.cpu);
  let memoryLimits = parseMemory(profile.gateway.limits.memory);
  let cpuLimits = parseCpu(profile.gateway.limits.cpu);

  memoryRequests += parseMemory(profile.initContainer.requests.memory);
  cpuRequests += parseCpu(profile.initContainer.requests.cpu);
  memoryLimits += parseMemory(profile.initContainer.limits.memory);
  cpuLimits += parseCpu(profile.initContainer.limits.cpu);

  if (options.useLitellm && profile.litellm) {
    memoryRequests += parseMemory(profile.litellm.requests.memory);
    cpuRequests += parseCpu(profile.litellm.requests.cpu);
    memoryLimits += parseMemory(profile.litellm.limits.memory);
    cpuLimits += parseCpu(profile.litellm.limits.cpu);
  }

  if (options.useOtel && profile.otelCollector) {
    memoryRequests += parseMemory(profile.otelCollector.requests.memory);
    cpuRequests += parseCpu(profile.otelCollector.requests.cpu);
    memoryLimits += parseMemory(profile.otelCollector.limits.memory);
    cpuLimits += parseCpu(profile.otelCollector.limits.cpu);
  }

  if (options.useA2a && profile.agentCard) {
    memoryRequests += parseMemory(profile.agentCard.requests.memory);
    cpuRequests += parseCpu(profile.agentCard.requests.cpu);
    memoryLimits += parseMemory(profile.agentCard.limits.memory);
    cpuLimits += parseCpu(profile.agentCard.limits.cpu);
  }

  const formatMemory = (mib: number): string => {
    if (mib >= 1024) {
      return `${(mib / 1024).toFixed(2)}Gi`;
    }
    return `${mib}Mi`;
  };

  const formatCpu = (millis: number): string => {
    if (millis >= 1000) {
      return `${(millis / 1000).toFixed(2)}`;
    }
    return `${millis}m`;
  };

  return {
    totalMemoryRequests: formatMemory(memoryRequests),
    totalCpuRequests: formatCpu(cpuRequests),
    totalMemoryLimits: formatMemory(memoryLimits),
    totalCpuLimits: formatCpu(cpuLimits),
  };
}
