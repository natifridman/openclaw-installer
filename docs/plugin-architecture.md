# Plugin System Architecture

The openclaw-installer uses a plugin system to support deployment to multiple platforms without coupling the core installer to specific infrastructure providers.

## Overview

The plugin system allows external npm packages to register new deployment targets at runtime. This enables:

- **Platform independence** — Core installer remains vendor-neutral
- **Extensibility** — New platforms can be added without modifying core code
- **Faster iteration** — Platform-specific features can evolve independently
- **Lower contributor friction** — Plugin authors only need to implement a focused interface

## Core Components

### DeployerRegistry

**Location**: `src/server/deployers/registry.ts`

The `DeployerRegistry` is a singleton that manages all available deployment modes. It provides:

- **`register(registration)`** — Add a new deployer
- **`get(mode)`** — Retrieve a deployer by mode name
- **`list()`** — Get all registered deployers
- **`detect()`** — Probe for available platforms and return only detected deployers

```typescript
export class DeployerRegistry {
  private registrations = new Map<string, DeployerRegistration>();
  
  register(reg: DeployerRegistration): void;
  get(mode: string): Deployer | null;
  list(): DeployerRegistration[];
  async detect(): Promise<DeployerRegistration[]>;
}
```

### DeployerRegistration

A registration includes:

| Field | Type | Description |
|-------|------|-------------|
| `mode` | `string` | Unique identifier (e.g., "local", "kubernetes", "openshift") |
| `title` | `string` | Human-readable name shown in the UI |
| `description` | `string` | Brief description for the UI |
| `deployer` | `Deployer` | Implementation of the Deployer interface |
| `detect` | `() => Promise<boolean>` | Optional function to auto-detect platform availability |
| `priority` | `number` | Auto-selection priority (higher wins when multiple detected) |
| `source` | `PluginSource` | Where the plugin was loaded from |

### Deployer Interface

**Location**: `src/server/deployers/types.ts`

All deployers must implement:

```typescript
export interface Deployer {
  deploy(config: DeployConfig, log: LogCallback): Promise<DeployResult>;
  start(result: DeployResult, log: LogCallback): Promise<DeployResult>;
  status(result: DeployResult): Promise<DeployResult>;
  stop(result: DeployResult, log: LogCallback): Promise<void>;
  teardown(result: DeployResult, log: LogCallback): Promise<void>;
}
```

**Lifecycle methods:**

- **`deploy()`** — Create a new deployment from config
- **`start()`** — Start a stopped deployment
- **`status()`** — Get current deployment state
- **`stop()`** — Stop a running deployment
- **`teardown()`** — Remove all deployment resources

### InstallerPlugin Interface

```typescript
export interface InstallerPlugin {
  register(registry: DeployerRegistry): void;
}
```

Plugins export a `register` function that receives the registry and calls `registry.register()` to add one or more deployers.

## Plugin Discovery

**Location**: `src/server/plugins/loader.ts`

The installer discovers plugins from three sources (in priority order):

### 1. Provider Plugins (In-Repo)

**Path**: `provider-plugins/*/`

First-party plugins live in the repo itself. Each subdirectory is a self-contained plugin:

```
provider-plugins/
  openshift/
    src/
      index.ts        # Plugin entry point
      openshift-deployer.ts
      detection.ts
    templates/        # Platform-specific assets
    docs/
    adr/
```

**Benefits:**
- Share CI, versioning, and code review with core
- No coordination overhead of separate repos
- Can be updated atomically with core changes

### 2. NPM Plugins

**Pattern**: `openclaw-installer-*` or `@scope/openclaw-installer-*`

Third-party plugins installed via npm. The loader scans `node_modules/` for matching package names.

### 3. Config Plugins

**Path**: `~/.openclaw/installer/plugins.json`

Manual plugin list for development or custom deployments:

```json
{
  "plugins": [
    "/absolute/path/to/my-plugin",
    "file:///path/to/local-plugin"
  ],
  "disabled": ["local", "kubernetes"]
}
```

## Plugin Loading Flow

1. **Core starts** — Built-in deployers (local, kubernetes) register
2. **Discover provider plugins** — Scan `provider-plugins/*/src/index.{ts,js}`
3. **Discover npm plugins** — Scan `node_modules/` for `openclaw-installer-*`
4. **Load config plugins** — Read `~/.openclaw/installer/plugins.json`
5. **Import and register** — For each plugin:
   - Import the module
   - Call `plugin.register(registry)`
   - Track load errors without crashing
6. **Detection** — When the UI loads, call `registry.detect()` to probe available platforms
7. **Auto-select** — UI selects the highest-priority detected deployer

## Exported API Surface

**Location**: `package.json` exports

Plugins import from the main package:

```typescript
// Core types and interfaces
import type { 
  Deployer, 
  DeployConfig, 
  DeployResult, 
  LogCallback 
} from "@openclaw/installer/deployers/types";

import type { 
  DeployerRegistry, 
  InstallerPlugin 
} from "@openclaw/installer/deployers/registry";

// Base classes to extend
import { KubernetesDeployer } from "@openclaw/installer/deployers/kubernetes";

// Helper utilities
import { 
  applyManifests,
  getServiceUrl
} from "@openclaw/installer/deployers/k8s-helpers";

import { getKubeConfig } from "@openclaw/installer/services/k8s";
```

## Built-In Deployers

### Local Deployer

**Mode**: `local`  
**Location**: `src/server/deployers/local.ts`

Deploys to local containers using Podman or Docker. Suitable for development and single-machine deployments.

**Features:**
- Container runtime auto-detection
- Volume persistence
- Port mapping
- Secret injection via Podman secrets

### Kubernetes Deployer

**Mode**: `kubernetes`  
**Location**: `src/server/deployers/kubernetes.ts`

Deploys to any Kubernetes cluster via kubeconfig. Base class for platform-specific Kubernetes variants.

**Features:**
- Deployment + Service + (optional) Ingress
- Agent-to-agent (A2A) pairing with Keycloak
- Auto-discovery of in-cluster OpenClaw instances
- Vertex AI LiteLLM proxy sidecar
- OTEL collector sidecar

## Provider Plugins

### OpenShift Plugin

**Mode**: `openshift`  
**Location**: `provider-plugins/openshift/`

Extends `KubernetesDeployer` with OpenShift-specific features:

- **Route** instead of Ingress
- **OAuth Proxy** for authentication
- **Detection** via `route.openshift.io` API group

See [openshift/docs/DEVELOPMENT.md](../provider-plugins/openshift/docs/DEVELOPMENT.md) for details.

## Frontend Integration

**Location**: `src/client/components/DeployForm.tsx`

The UI is fully dynamic — it fetches the list of available deployers from the API and renders mode cards automatically:

1. **Fetch deployers** — GET `/api/health` returns detected deployers
2. **Render cards** — Each deployer gets a card with title/description
3. **Auto-select** — Highest-priority detected deployer is pre-selected
4. **Mode-specific fields** — Form fields adapt based on selected mode

No hardcoded mode logic in the frontend.

## Error Handling

Plugin load errors are tracked but non-fatal:

- **Registration errors** — Logged to console and added to `registry.loadErrors()`
- **Detection errors** — Treated as "not available" (no crash)
- **Runtime errors** — Deployer methods should throw descriptive errors for the UI

The system remains functional even if some plugins fail to load.

## Security Considerations

- **No sandboxing** — Plugins run in the same process as the installer
- **Trust required** — Only load plugins from trusted sources
- **Validation** — Plugins should validate all inputs in `deploy()` and other methods
- **Secrets** — Use `DeploySecretRef` for API keys, never log secrets

## Type Safety

The plugin system maintains type safety:

- `DeployMode` is `string` (open for extension)
- `DeployConfig` uses optional fields for mode-specific settings
- TypeScript ensures `Deployer` interface compliance
- Exported types prevent version drift

## Versioning

- **Core API** — Follows semver for the installer package
- **Breaking changes** — Require major version bump
- **Provider plugins** — Updated in sync with core (same commit)
- **NPM plugins** — Use peer dependencies to declare compatible versions

## Performance

- **Plugin loading** — Happens once at startup (~10-50ms overhead)
- **Detection** — Runs async when UI loads, results cached
- **No runtime overhead** — Registry lookups are O(1) Map operations

## Testing

Plugin implementations should include:

- **Unit tests** — Test deployer methods in isolation
- **Integration tests** — Test against real or mocked platforms
- **Detection tests** — Verify platform detection logic

See `src/server/deployers/__tests__/` for examples.

## References

- [ADR 0001: Deployer Plugin System](../adr/0001-deployer-plugin-system.md)
- [Plugin Development Guide](./plugin-development.md)
- [OpenShift Plugin ADR](../provider-plugins/openshift/adr/0001-openshift-deployer-plugin-design.md)
