# OpenClaw Installer

Deploy [OpenClaw](https://github.com/openclaw) from your browser — to local containers or Kubernetes.

### From source

```bash
git clone https://github.com/sallyom/openclaw-installer.git
cd openclaw-installer
npm install && npm run build && npm run dev
```

Open `http://localhost:3000`, pick your deploy target, fill in the form, and click Deploy.

## Secret Handling

The installer now always uses upstream OpenClaw SecretRefs where it can.

- Local deploys inject secrets as container environment variables and reference them from `openclaw.json`
- Local Podman deploys can optionally derive those env vars from a guided Podman secret mapping list instead of hand-writing `--secret ...` flags
- Kubernetes and OpenShift deploys store secrets in the installer-managed `openclaw-secrets` Secret, inject them with `secretKeyRef`, and reference them from `openclaw.json`
- You can still provide explicit SecretRef overrides and optional `secrets.providers` JSON for `env`, `file`, or `exec`-based setups such as Vault

This keeps raw third-party secrets out of generated `openclaw.json` while staying aligned with upstream OpenClaw secret handling.

For local Podman installs, the recommended path is: create Podman secrets, map them in the installer, and let OpenClaw resolve them through SecretRefs. See [docs/podman-secrets.md](docs/podman-secrets.md).

### With the launcher script

```bash
./run.sh
```

Useful variants:

```bash
./run.sh --build
./run.sh --port 8080
./run.sh --runtime docker
./run.sh --plugin @acme/openclaw-installer-aws
./run.sh --plugins @acme/openclaw-installer-aws,@acme/openclaw-installer-gke
```

`run.sh` now prefers `OPENCLAW_INSTALLER_IMAGE`, while still accepting the older `CLAW_INSTALLER_IMAGE`.

## Deploy Targets

| Target | Guide | What it does |
|--------|-------|-------------|
| **Kubernetes** | [deploy-kubernetes.md](docs/deploy-kubernetes.md) | Creates namespace, PVC, ConfigMaps, Secrets, Service, and Deployment via the Kubernetes API. The Instances tab can start a managed port-forward and open the UI with the gateway token. |
| **OpenShift** | [deploy-openshift.md](provider-plugins/openshift/docs/deploy-openshift.md) | Extends Kubernetes with OAuth proxy sidecar, Route, and ServiceAccount. |
| **Local (podman / docker)** | [deploy-local.md](docs/deploy-local.md) | Pulls the image, provisions your agent, starts a container on localhost. Works on macOS and Linux. |

## Plugin Ecosystem

The openclaw-installer supports a plugin system for adding deployment targets. **These are installer deployer plugins, not OpenClaw runtime plugins.** They extend the installer with platform-specific deployment capabilities.

### Overview

The plugin system enables:

- **New deployment platforms** without modifying core installer code
- **Auto-detection** of available platforms (e.g., OpenShift Routes API)
- **Platform-specific features** like OAuth proxies, Routes, or cloud-specific networking
- **Vendor independence** — core installer remains platform-neutral

**Documentation:**

- **[Plugin Architecture](docs/plugin-architecture.md)** — System design, registry, and lifecycle
- **[Plugin Development Guide](docs/plugin-development.md)** — How to create your own deployer plugin
- **[ADR 0001: Deployer Plugin System](adr/0001-deployer-plugin-system.md)** — Design decision record

### Available Plugins

| Plugin | Type | Description |
|--------|------|-------------|
| **Local** | Built-in | Deploys to local Podman or Docker containers |
| **Kubernetes** | Built-in | Deploys to any Kubernetes cluster via kubeconfig |
| **OpenShift** | Provider Plugin | Extends Kubernetes with OAuth proxy, Routes, and ServiceAccounts. Auto-detected when logged into an OpenShift cluster. |

### Plugin Types

#### 1. Built-In Deployers

Core deployment modes included with the installer:

- `local` — Container deployment (Podman/Docker)
- `kubernetes` — Generic Kubernetes deployment

#### 2. In-Repo Provider Plugins

First-party plugins in `provider-plugins/` that ship with the installer:

```
provider-plugins/
  openshift/
    src/index.ts         # Plugin entry point
    src/openshift-deployer.ts
    templates/           # Platform-specific manifests
    docs/
    adr/
```

**Benefits:**
- Loaded automatically at startup
- Share CI/CD with core installer
- Atomic updates with core changes
- No separate npm package needed

**Example:** The OpenShift plugin (`provider-plugins/openshift/`) extends the Kubernetes deployer with OpenShift-specific features.

#### 3. External NPM Plugins

Third-party plugins distributed as npm packages. Package naming convention:

- `openclaw-installer-<name>` (e.g., `openclaw-installer-aws`)
- `@scope/openclaw-installer-<name>` (e.g., `@acme/openclaw-installer-gke`)

**Install via `run.sh`:**

```bash
./run.sh --plugin @acme/openclaw-installer-aws
./run.sh --plugins @acme/openclaw-installer-aws,@acme/openclaw-installer-gke
```

**Or install manually:**

```bash
npm install openclaw-installer-aws
```

Add to `~/.openclaw/installer/plugins.json`:

```json
{
  "plugins": [
    "openclaw-installer-aws",
    "@acme/openclaw-installer-gke"
  ]
}
```

### Creating a Plugin

Plugins implement the `InstallerPlugin` interface and register deployers:

```typescript
import type { InstallerPlugin } from "@openclaw/installer/deployers/registry";
import type { Deployer } from "@openclaw/installer/deployers/types";

class MyDeployer implements Deployer {
  async deploy(config, log) { /* ... */ }
  async start(result, log) { /* ... */ }
  async status(result) { /* ... */ }
  async stop(result, log) { /* ... */ }
  async teardown(result, log) { /* ... */ }
}

const plugin: InstallerPlugin = {
  register(registry) {
    registry.register({
      mode: "my-platform",
      title: "My Platform",
      description: "Deploy to My Platform",
      deployer: new MyDeployer(),
      detect: async () => { /* check if platform is available */ },
      priority: 10
    });
  }
};

export default plugin;
```

See the **[Plugin Development Guide](docs/plugin-development.md)** for detailed instructions.

### Platform Detection

Plugins can implement auto-detection to appear in the UI when their platform is available:

- **OpenShift** — Detects `route.openshift.io` API group in the cluster
- **Kubernetes** — Always available if kubeconfig is present
- **Local** — Detects Podman or Docker on the system

The UI automatically selects the highest-priority detected deployer.

### Plugin Strategy

**For this repo:**

- **Built-in** — Core deployment modes (local, kubernetes)
- **Provider plugins** — First-party platform integrations in `provider-plugins/`
- **NPM packages** — Third-party or optional platform plugins

This keeps the installer generic while allowing platform-specific features to be added modularly.

## Model Providers

| Provider | Default Model | What you need |
|----------|---------------|---------------|
| Anthropic | `claude-sonnet-4-6` | `ANTHROPIC_API_KEY` |
| OpenAI | `openai/gpt-5` | `OPENAI_API_KEY` |
| Vertex AI (Gemini) | `google-vertex/gemini-2.5-pro` | GCP service account JSON |
| Self-hosted (vLLM, etc.) | `openai/default` | `MODEL_ENDPOINT` URL |

For Vertex AI, upload your GCP service account JSON file (or provide an absolute path). The installer extracts the `project_id` automatically.

## SSH Sandbox

The installer supports OpenClaw's `ssh` sandbox backend for local and Kubernetes deployments.

For the installer-specific setup, credential handling, and troubleshooting, see [SANDBOX.md](docs/SANDBOX.md).

For upstream sandbox concepts and backend behavior, see the [OpenClaw sandboxing docs](https://github.com/openclaw/openclaw/blob/main/docs/gateway/sandboxing.md).

## Demo Bundles

`Agent Source Directory` can now point at a bundled multi-agent demo tree.

Try:

- `demos/openclaw-builder-research-ops`
- `demos/software-qa-mcp`

This demo includes:

- `workspace-main/` for the orchestrator agent
- `workspace-builder/`
- `workspace-research/`
- `workspace-ops/`
- `openclaw-agents.json` to register extra named agents and simple per-agent sandbox tool policies

`workspace-main/` is applied to the computed main agent workspace for the current deploy.
Other `workspace-*` directories are copied through as named agent workspaces and can be
registered as additional agents through `openclaw-agents.json`.

The `software-qa-mcp` demo includes:

- `mcp.json` for the Context7 MCP server
- `exec-approvals.json` for baseline tool approval policy
- `workspace-main/` with a software Q&A agent persona

Environment templates are included too:

- `.env.example` for a generic installer setup
- `demos/openclaw-builder-research-ops/.env.example` for the bundled sandbox demo

## MCP Servers

The installer supports provisioning MCP servers through the Agent Source Directory. Place a `mcp.json` file in your agent source directory:

```json
{
  "mcpServers": {
    "my-server": {
      "url": "https://mcp.example.com/mcp"
    }
  }
}
```

The installer merges these into the generated `openclaw.json` at deploy time.

For tool approval policies, add an `exec-approvals.json`:

```json
{
  "version": 1,
  "defaults": {
    "security": "allowlist",
    "ask": "on-miss",
    "askFallback": "deny"
  }
}
```

This file is copied directly to `~/.openclaw/exec-approvals.json` in the deployed instance.

See `demos/software-qa-mcp` for a complete example.

## Agent Workspaces

After the first deploy, agent files live under `~/.openclaw/workspace-*` on the host. Edit those files locally, then:

- for Local deployments, stop and start the instance
- for Kubernetes/OpenShift deployments, use Re-deploy

The installer treats the host files as the source of truth and pushes them into the running instance.

For Local deployments, the default is an isolated container data volume for `/home/node/.openclaw`.
That keeps runtime state, config, pairing data, cron state, and plugin state out of the host
`~/.openclaw` tree while still syncing host workspaces into the instance on start/redeploy.

## API

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/health` | GET | Runtime detection, version, server defaults |
| `/api/deploy` | POST | Start a deployment (streams logs via WebSocket) |
| `/api/configs` | GET | List saved instance configs |
| `/api/instances` | GET | List all discovered instances |
| `/api/instances/:name/start` | POST | Start a stopped instance |
| `/api/instances/:name/stop` | POST | Stop and remove container (volume preserved) |
| `/api/instances/:name/redeploy` | POST | Update agent ConfigMap and restart pod (K8s only) |
| `/api/instances/:name/token` | GET | Get the gateway auth token |
| `/api/instances/:name/open` | POST | Start or reuse a managed K8s port-forward and return a localhost URL |
| `/api/instances/:name/command` | GET | Get the run command |
| `/api/instances/:name/data` | DELETE | Delete the data volume |
| `/ws` | WebSocket | Subscribe to deploy logs |

## Roadmap

- [x] Local deployer (podman + docker, macOS + Linux)
- [x] Kubernetes deployer
- [x] Vertex AI support (Google Gemini via GCP SA JSON)
- [x] Instance discovery and lifecycle management
- [x] Agent provisioning with full workspace files
- [x] Custom agent/skill provisioning from host directory
- [x] Deploy config persistence for re-deploy
- [x] One-way host-to-instance workspace sync on Local Start / K8s Re-deploy
- [ ] Subagent provisioning
- [ ] Cron job provisioning from JOB.md files
- [ ] Pull running changes back to local files
- [ ] GitOps-backed workspace sync
- [ ] Skill import from git repos
- [ ] SSH deployer (remote host)

## Development

**Pre-commit checklist:**
```bash
npm run build    # Compiles server + installer provider plugins (catches type errors)
npm test         # Runs all vitest tests
npm run lint     # ESLint checks
```

**Test Coverage:**

The project uses Vitest with v8 coverage provider to track test coverage progress toward the Q2 60% target.

```bash
npm run coverage              # Run tests with coverage report
npm run coverage:watch        # Watch mode with coverage
npm run coverage:report       # Generate and open HTML report
```

**Current baseline:** ~46% coverage (lines: 46.57%, statements: 45.81%, functions: 44.32%, branches: 48.31%)

Coverage reports are generated in the `coverage/` directory:
- **Text summary:** Displayed in the terminal after running tests
- **HTML report:** Browse detailed coverage at `coverage/index.html`
- **JSON summary:** Programmatic access via `coverage/coverage-summary.json`

The configuration sets a 30% threshold baseline. Coverage data helps identify untested areas and track progress toward comprehensive test coverage.

**Documentation:**
- [AGENTS.md](AGENTS.md) - Development guide and conventions
- [docs/ci-cd.md](docs/ci-cd.md) - CI/CD pipeline and branch protection setup

**CI/CD:** All pull requests are validated by GitHub Actions (build, test, lint). See [docs/ci-cd.md](docs/ci-cd.md) for details.
