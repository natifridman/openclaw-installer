# Kubernetes Resource Profiles

OpenClaw Installer supports configurable resource profiles for Kubernetes deployments, allowing you to optimize resource allocation based on your workload size and cluster capacity.

## Overview

Resource profiles define CPU and memory allocations (requests and limits) for all containers in the OpenClaw deployment:
- **Gateway container**: Main OpenClaw service
- **Init container**: Setup and configuration
- **LiteLLM sidecar**: (optional) Vertex AI proxy
- **OTEL collector**: (optional) Telemetry collection
- **A2A agent-card**: (optional) Agent-to-Agent protocol bridge

## Available Profiles

### Small (`small`)
**Use case**: Development, testing, or resource-constrained environments

| Container | Memory Request | Memory Limit | CPU Request | CPU Limit |
|-----------|---------------|--------------|-------------|-----------|
| Gateway | 512Mi | 2Gi | 125m | 500m |
| Init | 32Mi | 64Mi | 25m | 100m |
| LiteLLM | 256Mi | 512Mi | 50m | 250m |
| OTEL | 64Mi | 128Mi | 50m | 100m |
| A2A | 16Mi | 32Mi | 5m | 25m |

**Total (all sidecars enabled)**: ~896Mi requests, ~2.7Gi limits, ~255m CPU requests, ~975m CPU limits

### Medium (`medium`) - **Default**
**Use case**: Production workloads with moderate load

| Container | Memory Request | Memory Limit | CPU Request | CPU Limit |
|-----------|---------------|--------------|-------------|-----------|
| Gateway | 1Gi | 4Gi | 250m | 1000m |
| Init | 64Mi | 128Mi | 50m | 200m |
| LiteLLM | 512Mi | 1Gi | 100m | 500m |
| OTEL | 128Mi | 256Mi | 100m | 200m |
| A2A | 32Mi | 64Mi | 10m | 50m |

**Total (all sidecars enabled)**: ~1.7Gi requests, ~5.4Gi limits, ~510m CPU requests, ~1.95 CPU limits

### Large (`large`)
**Use case**: High-performance production with many concurrent agents

| Container | Memory Request | Memory Limit | CPU Request | CPU Limit |
|-----------|---------------|--------------|-------------|-----------|
| Gateway | 2Gi | 8Gi | 500m | 2000m |
| Init | 128Mi | 256Mi | 100m | 400m |
| LiteLLM | 1Gi | 2Gi | 200m | 1000m |
| OTEL | 256Mi | 512Mi | 200m | 400m |
| A2A | 64Mi | 128Mi | 20m | 100m |

**Total (all sidecars enabled)**: ~3.4Gi requests, ~10.8Gi limits, ~1.02 CPU requests, ~3.9 CPU limits

### XLarge (`xlarge`)
**Use case**: Enterprise scale with heavy workloads

| Container | Memory Request | Memory Limit | CPU Request | CPU Limit |
|-----------|---------------|--------------|-------------|-----------|
| Gateway | 4Gi | 16Gi | 1000m | 4000m |
| Init | 256Mi | 512Mi | 200m | 800m |
| LiteLLM | 2Gi | 4Gi | 400m | 2000m |
| OTEL | 512Mi | 1Gi | 400m | 800m |
| A2A | 128Mi | 256Mi | 40m | 200m |

**Total (all sidecars enabled)**: ~6.9Gi requests, ~21.7Gi limits, ~2.04 CPU requests, ~7.8 CPU limits

### Custom (`custom`)
**Use case**: Fine-tuned resource allocation for specific requirements

Use the `medium` profile as a base and override specific container resources as needed.

## Usage

### CLI Configuration

When deploying via CLI, set the resource profile using the `--resource-profile` flag:

```bash
# Use small profile for development
openclaw-installer deploy kubernetes --resource-profile small

# Use large profile for production
openclaw-installer deploy kubernetes --resource-profile large

# Use default (medium)
openclaw-installer deploy kubernetes
```

### Programmatic Configuration

When deploying programmatically, set the `resourceProfile` field in `DeployConfig`:

```typescript
import { deploy } from '@openclaw/installer';

const config = {
  mode: 'kubernetes',
  namespace: 'openclaw-prod',
  resourceProfile: 'large',
  // ... other config
};

await deploy(config);
```

### Custom Resource Overrides

For fine-grained control, use custom resource overrides:

```typescript
const config = {
  mode: 'kubernetes',
  namespace: 'openclaw-prod',
  resourceProfile: 'custom',
  customResourceOverrides: {
    gateway: {
      requests: { memory: '3Gi', cpu: '750m' },
      limits: { memory: '12Gi', cpu: '3000m' },
    },
    litellm: {
      requests: { memory: '1Gi', cpu: '300m' },
    },
  },
  // ... other config
};
```

## Resource Quota Awareness

During deployment, OpenClaw Installer automatically checks for Kubernetes ResourceQuotas in the target namespace and logs:
- Selected resource profile size and description
- Total memory/CPU requests and limits
- Quota hard limits and current usage
- Warnings if the deployment might exceed quotas

**Example output:**
```
Resource profile: medium (Production - balanced resources, default)
Total requests: 1.72Gi memory, 510m CPU
Total limits: 5.44Gi memory, 1.95 CPU
Quota default-quota: requests.memory hard=8Gi, used=2Gi
  Deploying with memory requests=1.72Gi - verify quota capacity
Quota default-quota: limits.memory hard=16Gi, used=4Gi
  Deploying with memory limits=5.44Gi - verify quota capacity
```

### Handling Quota Conflicts

If your deployment exceeds namespace quotas:

1. **Choose a smaller profile**: Switch from `large` to `medium` or `small`
2. **Request quota increase**: Work with cluster admins to increase namespace quotas
3. **Disable optional sidecars**: If using A2A or OTEL, disable them if not needed
4. **Use custom overrides**: Fine-tune resources to fit within quota constraints

## Best Practices

### Choosing a Profile

1. **Start with `medium`**: The default profile works for most production workloads
2. **Use `small` for dev/test**: Conserve resources in non-production environments
3. **Scale up to `large`**: When you observe resource contention or high latency
4. **Use `xlarge` sparingly**: Only for enterprise-scale deployments with proven demand

### Monitoring Resource Usage

After deployment, monitor actual resource usage:

```bash
# View pod resource usage
kubectl top pod -n openclaw-prod

# View resource requests/limits
kubectl describe pod -n openclaw-prod -l app=openclaw
```

### Adjusting Profiles

You can change the resource profile by redeploying with a different profile:

```bash
# Redeploy with larger profile
openclaw-installer deploy kubernetes --namespace openclaw-prod --resource-profile large
```

Kubernetes will perform a rolling update with the new resource allocations.

## Technical Details

### Request vs Limit

- **Request**: Guaranteed resources. Kubernetes schedules pods only if the node has enough available.
- **Limit**: Maximum burst capacity. Pods can use up to this amount if available on the node.

Exceeding memory limits results in OOM (Out of Memory) kills. Exceeding CPU limits results in throttling.

### Sidecar Activation

Resource totals vary based on which optional sidecars are enabled:

- **LiteLLM**: Enabled when using Vertex AI with GCP service account
- **OTEL**: Enabled when `otelEnabled: true` in config
- **A2A**: Enabled when `withA2a: true` in config

### OpenTelemetry Operator

When using the OpenTelemetry Operator (automatic sidecar injection), the operator CR also uses the selected resource profile for consistency.

## Troubleshooting

### Pod Stuck in Pending

**Symptom**: Deployment remains in Pending state
**Cause**: Insufficient node resources to satisfy requests
**Solution**: Use a smaller profile or add cluster capacity

```bash
kubectl describe pod -n openclaw-prod -l app=openclaw | grep -A 5 "Events"
```

### OOMKilled Pods

**Symptom**: Pods restart frequently with OOMKilled status
**Cause**: Memory usage exceeds limits
**Solution**: Use a larger profile or investigate memory leaks

```bash
kubectl get events -n openclaw-prod --sort-by='.lastTimestamp'
```

### CPU Throttling

**Symptom**: Slow response times despite low cluster load
**Cause**: Pod CPU usage hitting limits and being throttled
**Solution**: Increase CPU limits using custom overrides or larger profile

```bash
# Check throttling metrics (requires metrics-server)
kubectl top pod -n openclaw-prod
```

## Migration Guide

### Existing Deployments

If you deployed OpenClaw before resource profiles were introduced, your deployment uses the original hardcoded values (equivalent to `medium` profile).

To adopt resource profiles:

1. **No action needed**: Current deployments continue working with medium-equivalent resources
2. **To change resources**: Redeploy with your desired profile
3. **Gradual migration**: Test new profiles in dev/staging before production

### Preserving Custom Resources

If you manually edited deployment resources via `kubectl edit`:

1. Export your current resources:
```bash
kubectl get deployment openclaw -n openclaw-prod -o yaml > custom-resources.yaml
```

2. Create custom overrides matching your values
3. Redeploy with `resourceProfile: 'custom'` and `customResourceOverrides`

## API Reference

### TypeScript Types

```typescript
type ResourceProfileSize = "small" | "medium" | "large" | "xlarge" | "custom";

interface ContainerResources {
  requests: {
    memory: string;
    cpu: string;
  };
  limits: {
    memory: string;
    cpu: string;
  };
}

interface CustomResourceOverrides {
  gateway?: Partial<ContainerResources>;
  initContainer?: Partial<ContainerResources>;
  litellm?: Partial<ContainerResources>;
  otelCollector?: Partial<ContainerResources>;
  agentCard?: Partial<ContainerResources>;
}

interface DeployConfig {
  // ... other fields
  resourceProfile?: ResourceProfileSize;
  customResourceOverrides?: CustomResourceOverrides;
}
```

### Helper Functions

```typescript
import {
  getResourceProfile,
  applyCustomOverrides,
  calculateTotalResources,
} from '@openclaw/installer/deployers/k8s-resource-profiles';

// Get a predefined profile
const profile = getResourceProfile('large');

// Apply custom overrides
const customProfile = applyCustomOverrides(profile, {
  gateway: {
    requests: { memory: '3Gi', cpu: '500m' },
  },
});

// Calculate totals
const totals = calculateTotalResources(customProfile, {
  useLitellm: true,
  useOtel: false,
  useA2a: true,
});
console.log(totals.totalMemoryRequests); // e.g., "3.58Gi"
```

## See Also

- [Kubernetes Resource Management](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)
- [ResourceQuotas](https://kubernetes.io/docs/concepts/policy/resource-quotas/)
- [LimitRanges](https://kubernetes.io/docs/concepts/policy/limit-range/)
- [Vertical Pod Autoscaler](https://github.com/kubernetes/autoscaler/tree/master/vertical-pod-autoscaler)
