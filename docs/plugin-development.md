# Plugin Development Guide

This guide walks through creating a deployer plugin for openclaw-installer.

## Quick Start

### Minimal Plugin Example

```typescript
// my-plugin/src/index.ts
import type { 
  InstallerPlugin,
  DeployerRegistration 
} from "@openclaw/installer/deployers/registry";
import type { 
  Deployer,
  DeployConfig,
  DeployResult,
  LogCallback 
} from "@openclaw/installer/deployers/types";

class MyDeployer implements Deployer {
  async deploy(config: DeployConfig, log: LogCallback): Promise<DeployResult> {
    log("Deploying to my platform...");
    // Implementation here
    return {
      id: `my-${Date.now()}`,
      mode: config.mode,
      status: "running",
      config,
      startedAt: new Date().toISOString(),
      url: "http://example.com"
    };
  }

  async start(result: DeployResult, log: LogCallback): Promise<DeployResult> {
    log("Starting deployment...");
    return { ...result, status: "running" };
  }

  async status(result: DeployResult): Promise<DeployResult> {
    return { ...result, status: "running" };
  }

  async stop(result: DeployResult, log: LogCallback): Promise<void> {
    log("Stopping deployment...");
  }

  async teardown(result: DeployResult, log: LogCallback): Promise<void> {
    log("Tearing down deployment...");
  }
}

const plugin: InstallerPlugin = {
  register(registry) {
    registry.register({
      mode: "my-platform",
      title: "My Platform",
      description: "Deploy to My Platform",
      deployer: new MyDeployer()
    });
  }
};

export default plugin;
```

## Plugin Types

### In-Repo Provider Plugin

Best for first-party integrations that ship with the installer.

**Structure:**

```
provider-plugins/
  my-platform/
    src/
      index.ts              # Plugin entry point
      my-deployer.ts        # Deployer implementation
      detection.ts          # Platform detection logic
      helpers.ts            # Platform-specific utilities
    templates/              # Config files, manifests, etc.
    docs/
      DEVELOPMENT.md
      deploy-my-platform.md
    adr/
      0001-my-platform-plugin.md
```

**Entry point (`src/index.ts`):**

```typescript
import type { InstallerPlugin } from "../../../src/server/deployers/registry.js";
import { MyPlatformDeployer } from "./my-deployer.js";
import { detectMyPlatform } from "./detection.js";

const plugin: InstallerPlugin = {
  register(registry) {
    registry.register({
      mode: "my-platform",
      title: "My Platform",
      description: "Deploy with platform-specific features",
      deployer: new MyPlatformDeployer(),
      detect: detectMyPlatform,
      priority: 10
    });
  }
};

export default plugin;
```

**Build configuration:**

Provider plugins are compiled with `tsconfig.provider-plugins.json`. No additional configuration needed.

### NPM Plugin

Best for third-party integrations or platform-specific extensions.

**Package naming:** `openclaw-installer-<name>` or `@scope/openclaw-installer-<name>`

**package.json:**

```json
{
  "name": "openclaw-installer-my-platform",
  "version": "1.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "peerDependencies": {
    "@openclaw/installer": "^0.1.0"
  },
  "dependencies": {
    "platform-specific-sdk": "^2.0.0"
  }
}
```

**Installation:**

```bash
npm install openclaw-installer-my-platform
```

The installer auto-discovers it in `node_modules/`.

## Deployer Interface

### Core Methods

#### `deploy(config, log)`

Create a new deployment.

**Parameters:**
- `config: DeployConfig` — Deployment configuration from the UI
- `log: LogCallback` — Function to stream logs to the UI

**Returns:** `Promise<DeployResult>` — Initial deployment state

**Responsibilities:**
- Create all platform resources (containers, services, etc.)
- Validate configuration
- Return deployment metadata
- Stream progress via `log()`

**Example:**

```typescript
async deploy(config: DeployConfig, log: LogCallback): Promise<DeployResult> {
  log("Validating configuration...");
  if (!config.agentName) {
    throw new Error("agentName is required");
  }

  log("Creating deployment...");
  const deploymentId = await this.platform.createDeployment({
    name: config.agentName,
    image: config.image || "ghcr.io/openclaw/openclaw:latest",
    env: this.buildEnv(config)
  });

  log("Deployment created successfully");
  
  return {
    id: deploymentId,
    mode: config.mode,
    status: "running",
    config,
    startedAt: new Date().toISOString(),
    url: await this.platform.getUrl(deploymentId)
  };
}
```

#### `start(result, log)`

Start a stopped deployment.

**When called:** User clicks "Start" in the UI for a stopped deployment.

```typescript
async start(result: DeployResult, log: LogCallback): Promise<DeployResult> {
  log(`Starting deployment ${result.id}...`);
  await this.platform.start(result.id);
  return { ...result, status: "running" };
}
```

#### `status(result)`

Get current deployment state. Called frequently for UI updates.

**Performance:** Should be fast (< 1s). Cache aggressively if needed.

```typescript
async status(result: DeployResult): Promise<DeployResult> {
  const state = await this.platform.getStatus(result.id);
  return {
    ...result,
    status: this.mapStatus(state),
    url: state.url,
    error: state.error
  };
}
```

#### `stop(result, log)`

Stop a running deployment without removing resources.

```typescript
async stop(result: DeployResult, log: LogCallback): Promise<void> {
  log(`Stopping deployment ${result.id}...`);
  await this.platform.stop(result.id);
  log("Stopped");
}
```

#### `teardown(result, log)`

Remove all deployment resources permanently.

**Caution:** This is destructive. Confirm user intent in the UI before calling.

```typescript
async teardown(result: DeployResult, log: LogCallback): Promise<void> {
  log(`Removing deployment ${result.id}...`);
  await this.platform.delete(result.id);
  log("Deployment removed");
}
```

### DeployConfig Fields

Key configuration fields available in `config`:

| Field | Type | Description |
|-------|------|-------------|
| `mode` | `string` | Your plugin's mode identifier |
| `agentName` | `string` | **Required** — Unique agent identifier |
| `agentDisplayName` | `string` | Human-readable agent name |
| `image` | `string` | Container image (default: `ghcr.io/openclaw/openclaw:latest`) |
| `port` | `number` | Port for the agent UI |
| `namespace` | `string` | K8s namespace (if applicable) |
| `anthropicApiKey` | `string` | Anthropic API key (if using external LLM) |
| `inferenceProvider` | `InferenceProvider` | LLM provider selection |
| `sandboxEnabled` | `boolean` | Enable sandbox security |

See `src/server/deployers/types.ts` for the complete list.

**Adding mode-specific fields:**

Add optional fields to `DeployConfig` interface:

```typescript
// In your plugin's types
export interface MyPlatformConfig extends DeployConfig {
  myPlatformRegion?: string;
  myPlatformInstanceType?: string;
}
```

### DeployResult Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | **Required** — Unique deployment ID |
| `mode` | `string` | **Required** — Plugin mode |
| `status` | `Status` | **Required** — `"running"`, `"stopped"`, `"failed"`, etc. |
| `config` | `DeployConfig` | **Required** — Original configuration |
| `startedAt` | `string` | **Required** — ISO 8601 timestamp |
| `url` | `string` | Public URL for accessing the agent |
| `error` | `string` | Error message if status is `"failed"` |

**Add custom fields** for platform-specific metadata:

```typescript
return {
  id: deploymentId,
  mode: "my-platform",
  status: "running",
  config,
  startedAt: new Date().toISOString(),
  url: deploymentUrl,
  // Custom fields
  customField: "platform-specific data"
} as DeployResult;
```

## Platform Detection

The `detect()` function determines if the platform is available. Used for auto-selection.

**Example: Kubernetes API detection**

```typescript
// detection.ts
export async function detectMyPlatform(): Promise<boolean> {
  try {
    const response = await fetch("https://my-platform-api/health");
    return response.ok;
  } catch {
    return false;
  }
}
```

**Example: OpenShift Route API detection**

```typescript
import { getKubeConfig } from "@openclaw/installer/services/k8s";

export async function isOpenShift(): Promise<boolean> {
  try {
    const kc = getKubeConfig();
    const client = kc.makeApiClient(ApiextensionsV1Api);
    const { body } = await client.listCustomResourceDefinition();
    return body.items.some(crd => 
      crd.spec.group === "route.openshift.io"
    );
  } catch {
    return false;
  }
}
```

**Priority:**

When multiple deployers detect availability, the highest `priority` is auto-selected:

```typescript
registry.register({
  mode: "my-platform",
  priority: 15,  // Higher than built-in kubernetes (10)
  detect: detectMyPlatform,
  // ...
});
```

## Extending Built-In Deployers

### Extending KubernetesDeployer

Most cloud-managed Kubernetes platforms can extend the base `KubernetesDeployer`:

```typescript
import { KubernetesDeployer } from "@openclaw/installer/deployers/kubernetes";
import type { DeployConfig, DeployResult, LogCallback } from "@openclaw/installer/deployers/types";

export class MyK8sDeployer extends KubernetesDeployer {
  async deploy(config: DeployConfig, log: LogCallback): Promise<DeployResult> {
    // Add platform-specific pre-processing
    log("Applying platform-specific configuration...");
    await this.setupPlatformSpecificResources(config);

    // Call parent implementation
    const result = await super.deploy(config, log);

    // Add platform-specific post-processing
    log("Configuring platform networking...");
    await this.configurePlatformNetworking(result);

    return result;
  }

  private async setupPlatformSpecificResources(config: DeployConfig): Promise<void> {
    // Platform-specific logic
  }

  private async configurePlatformNetworking(result: DeployResult): Promise<void> {
    // Platform-specific logic
  }
}
```

### Example: OpenShift Plugin

The OpenShift plugin extends `KubernetesDeployer` to add:

- **Routes** instead of Ingress
- **OAuth Proxy** for authentication
- **ServiceAccount** for OAuth

```typescript
export class OpenShiftDeployer extends KubernetesDeployer {
  async deploy(config: DeployConfig, log: LogCallback): Promise<DeployResult> {
    const result = await super.deploy(config, log);
    
    // Add OpenShift Route
    log("Creating OpenShift Route...");
    await applyRoute(config, result.id);
    
    // Update URL with Route
    const url = await getRouteUrl(config.namespace, result.id);
    return { ...result, url };
  }
}
```

## Using Kubernetes Helpers

The installer exports K8s utilities for plugin use:

```typescript
import { 
  applyManifests,
  deleteManifests,
  getServiceUrl,
  getPods
} from "@openclaw/installer/deployers/k8s-helpers";

import { getKubeConfig } from "@openclaw/installer/services/k8s";

// Apply YAML manifests
await applyManifests(namespace, [deploymentYaml, serviceYaml], log);

// Get service URL
const url = await getServiceUrl(namespace, serviceName);

// Check pod status
const pods = await getPods(namespace, { labelSelector: "app=my-agent" });
```

## Error Handling

**Always throw descriptive errors:**

```typescript
async deploy(config: DeployConfig, log: LogCallback): Promise<DeployResult> {
  if (!config.agentName) {
    throw new Error("Agent name is required");
  }

  try {
    const result = await this.platform.create(config);
    return result;
  } catch (err) {
    throw new Error(`Deployment failed: ${err.message}`);
  }
}
```

**Error types:**

- **Validation errors** — Missing or invalid config
- **Platform errors** — API failures, quota limits
- **Network errors** — Unreachable endpoints

The UI displays errors to the user.

## Logging

Stream progress updates via the `log` callback:

```typescript
async deploy(config: DeployConfig, log: LogCallback): Promise<DeployResult> {
  log("Starting deployment...");
  log("Creating namespace...");
  await createNamespace();
  
  log("Applying manifests...");
  await applyManifests();
  
  log("Waiting for pods...");
  await waitForPods();
  
  log("Deployment complete!");
  return result;
}
```

**Guidelines:**
- Use present tense ("Creating..." not "Created...")
- Keep messages concise (< 80 chars)
- Log major steps, not every detail
- Don't log secrets or sensitive data

## Testing

### Unit Tests

Test deployer methods in isolation with mocks:

```typescript
// __tests__/my-deployer.test.ts
import { describe, it, expect, vi } from "vitest";
import { MyDeployer } from "../my-deployer";

describe("MyDeployer", () => {
  it("should deploy successfully", async () => {
    const deployer = new MyDeployer();
    const log = vi.fn();
    
    const result = await deployer.deploy({
      mode: "my-platform",
      agentName: "test-agent",
      agentDisplayName: "Test Agent"
    }, log);
    
    expect(result.status).toBe("running");
    expect(result.id).toBeDefined();
    expect(log).toHaveBeenCalled();
  });
});
```

### Integration Tests

Test against real or mocked platform APIs:

```typescript
describe("MyDeployer integration", () => {
  it("should create real deployment", async () => {
    const deployer = new MyDeployer();
    const result = await deployer.deploy(testConfig, console.log);
    
    // Verify deployment exists
    const status = await deployer.status(result);
    expect(status.status).toBe("running");
    
    // Cleanup
    await deployer.teardown(result, console.log);
  });
});
```

## Troubleshooting

### Plugin Not Loading

**Check logs:**

```bash
npm run start
# Look for: "Loaded provider plugin: my-platform"
```

**Common issues:**

- Missing `register` function export
- TypeScript compilation errors
- Import path issues (use `.js` extensions in imports)

### Detection Not Working

**Verify detect function:**

```typescript
const plugin: InstallerPlugin = {
  register(registry) {
    registry.register({
      detect: async () => {
        const detected = await detectMyPlatform();
        console.log(`My platform detected: ${detected}`);
        return detected;
      }
    });
  }
};
```

### Type Errors

**Ensure peer dependencies match:**

```json
{
  "peerDependencies": {
    "@openclaw/installer": "^0.1.0"
  }
}
```

**Import from correct paths:**

```typescript
import type { Deployer } from "@openclaw/installer/deployers/types";
// NOT: from "../types" or "@openclaw/installer"
```

## Best Practices

1. **Validate early** — Check config in `deploy()` before creating resources
2. **Idempotent operations** — `deploy()` should handle existing resources gracefully
3. **Clean up on errors** — If `deploy()` fails partway, clean up created resources
4. **Cache status checks** — `status()` is called frequently, cache expensive operations
5. **Document platform requirements** — README should list prerequisites
6. **Use TypeScript** — Catch errors at compile time
7. **Test detection logic** — Ensure `detect()` doesn't false-positive
8. **Version compatibility** — Test against multiple installer versions

## Publishing NPM Plugins

**Checklist:**

- [ ] Package name: `openclaw-installer-<name>`
- [ ] Peer dependency on `@openclaw/installer`
- [ ] README with installation and usage
- [ ] LICENSE file
- [ ] TypeScript declarations (`.d.ts`)
- [ ] Tests passing
- [ ] Example configuration

**Publish:**

```bash
npm publish
```

Users install with:

```bash
npm install openclaw-installer-my-platform
```

## Examples

See these plugins for reference:

- **OpenShift** — `provider-plugins/openshift/` — Extends KubernetesDeployer with Routes and OAuth
- **Local** — `src/server/deployers/local.ts` — Standalone deployer for containers
- **Kubernetes** — `src/server/deployers/kubernetes.ts` — Base K8s deployer

## References

- [Plugin Architecture](./plugin-architecture.md)
- [ADR 0001: Deployer Plugin System](../adr/0001-deployer-plugin-system.md)
- [Deployer Types](../src/server/deployers/types.ts)
- [OpenShift Plugin ADR](../provider-plugins/openshift/adr/0001-openshift-deployer-plugin-design.md)
