# End-to-End Testing

This document describes the E2E testing framework for OpenClaw Installer deployers.

## Overview

E2E tests verify the complete deployment lifecycle for both Local (Docker/Podman) and Kubernetes deployers:

1. **deploy** - Create deployment resources
2. **start** - Start the deployed instance
3. **status** - Check instance status
4. **stop** - Stop the running instance
5. **teardown** - Remove all deployment resources

## Test Structure

```
src/server/__tests__/e2e/
├── local-deployer.e2e.test.ts      # E2E tests for LocalDeployer
└── kubernetes-deployer.e2e.test.ts # E2E tests for KubernetesDeployer
```

## Prerequisites

### For Local Deployer E2E Tests

- **Docker or Podman** must be installed and running
- **Port 18789** must be available
- Sufficient permissions to run containers

Install Docker:
- macOS: [Docker Desktop](https://www.docker.com/products/docker-desktop)
- Linux: `sudo apt-get install docker.io` or `sudo dnf install docker`
- Windows: [Docker Desktop](https://www.docker.com/products/docker-desktop)

Install Podman (alternative to Docker):
- macOS: `brew install podman`
- Linux: `sudo dnf install podman` or `sudo apt-get install podman`
- Windows: [Podman Desktop](https://podman-desktop.io/)

### For Kubernetes Deployer E2E Tests

- **kind** (Kubernetes in Docker) must be installed
- **kubectl** must be installed
- **Docker** must be running (kind requires Docker)

Install kind:
```bash
# Linux / macOS
curl -Lo ./kind https://kind.sigs.k8s.io/dl/v0.20.0/kind-linux-amd64
chmod +x ./kind
sudo mv ./kind /usr/local/bin/kind

# macOS (Homebrew)
brew install kind

# Windows (Chocolatey)
choco install kind
```

Install kubectl:
```bash
# Linux
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
chmod +x kubectl
sudo mv kubectl /usr/local/bin/

# macOS
brew install kubectl

# Windows
choco install kubernetes-cli
```

## Running E2E Tests

E2E tests are **skipped by default** and must be explicitly enabled to run.

### Run All E2E Tests

```bash
RUN_E2E_TESTS=true npm test -- --project=e2e
```

### Run Only Local Deployer E2E Tests

```bash
RUN_E2E_TESTS=true npm test -- --project=e2e local-deployer
```

### Run Only Kubernetes Deployer E2E Tests

```bash
RUN_E2E_TESTS=true npm test -- --project=e2e kubernetes-deployer
```

### Run E2E Tests with Coverage

```bash
RUN_E2E_TESTS=true npm run coverage -- --project=e2e
```

## Setting Up Kubernetes E2E Tests

### 1. Create a Kind Cluster

```bash
kind create cluster --name openclaw-e2e --wait 60s
```

This creates a local Kubernetes cluster running in Docker.

### 2. Verify Cluster

```bash
kubectl cluster-info --context kind-openclaw-e2e
kubectl get nodes
```

### 3. Run Tests

```bash
RUN_E2E_TESTS=true npm test -- --project=e2e
```

### 4. Cleanup

When done testing:

```bash
kind delete cluster --name openclaw-e2e
```

## CI/CD Integration

### GitHub Actions

E2E tests run in GitHub Actions when:
1. Manually triggered via workflow_dispatch
2. Commit message contains `[e2e]`

Example:
```bash
git commit -m "feat: add new deployer feature [e2e]"
git push
```

The CI workflow automatically:
- Sets up Docker
- Installs and configures kind
- Creates a test cluster
- Runs E2E tests
- Cleans up resources

### Manual Workflow Trigger

1. Go to Actions tab in GitHub
2. Select "CI" workflow
3. Click "Run workflow"
4. Select branch and run

## Test Configuration

E2E tests are configured in `vitest.config.ts`:

```typescript
{
  test: {
    name: "e2e",
    environment: "node",
    include: ["src/server/**/*.e2e.test.ts"],
    testTimeout: 180000,  // 3 minutes per test
    hookTimeout: 180000,  // 3 minutes for setup/teardown
  },
}
```

## Test Timeouts

E2E tests have extended timeouts due to:
- Container image pulling (first run)
- Kubernetes resource creation
- Pod startup and readiness checks

Default timeouts:
- **Test timeout**: 180 seconds (3 minutes)
- **Hook timeout**: 180 seconds (3 minutes)
- **Individual operations**: 30-120 seconds

## Troubleshooting

### Local Deployer Tests Fail

**Port already in use:**
```
Error: Port 18789 is already allocated
```
Solution: Stop any running OpenClaw instances or change the port in the test.

**Docker daemon not running:**
```
Error: Cannot connect to the Docker daemon
```
Solution: Start Docker Desktop or Docker daemon.

**Permission denied:**
```
Error: permission denied while trying to connect to Docker socket
```
Solution: Add your user to the docker group:
```bash
sudo usermod -aG docker $USER
newgrp docker
```

### Kubernetes Deployer Tests Fail

**kind cluster not found:**
```
Error: cluster "openclaw-e2e" not found
```
Solution: Create the cluster:
```bash
kind create cluster --name openclaw-e2e
```

**kubectl context not set:**
```
Error: context "kind-openclaw-e2e" does not exist
```
Solution: Set the context:
```bash
kubectl config use-context kind-openclaw-e2e
```

**Timeout waiting for pods:**
```
Error: Timeout waiting for deployment
```
Solution: Increase timeout or check cluster resources:
```bash
kubectl get pods -A
kubectl describe pod <pod-name> -n <namespace>
```

### Image Pull Failures

**Rate limiting:**
```
Error: toomanyrequests: You have reached your pull rate limit
```
Solution: 
- Authenticate with Docker Hub
- Use a different registry
- Wait for rate limit to reset

## Coverage Reporting

E2E tests contribute to overall code coverage but focus on integration rather than unit-level coverage.

### Generate Coverage Report

```bash
RUN_E2E_TESTS=true npm run coverage -- --project=e2e
```

### View Coverage Report

```bash
npm run coverage:report
```

The coverage report includes:
- Deployer classes (local.ts, kubernetes.ts)
- Helper functions (k8s-helpers.ts, container.ts)
- Deployment lifecycle methods
- Error handling paths

## Best Practices

1. **Run E2E tests locally** before pushing changes to deployer code
2. **Clean up resources** after test failures to avoid port/resource conflicts
3. **Use meaningful test data** that reflects real deployment scenarios
4. **Monitor test duration** - E2E tests should complete within timeout limits
5. **Check logs** - E2E tests output deployment logs for debugging

## Test Maintenance

### Adding New E2E Tests

1. Create test file in `src/server/__tests__/e2e/`
2. Name it with `.e2e.test.ts` suffix
3. Use `describe.skipIf(!process.env.RUN_E2E_TESTS)` wrapper
4. Set appropriate test timeouts
5. Clean up resources in `afterAll` hooks
6. Document prerequisites in test comments

### Updating Existing Tests

When modifying deployer code:
1. Update corresponding E2E tests
2. Run E2E tests locally to verify
3. Update this documentation if prerequisites change
4. Include `[e2e]` in commit message to run CI E2E tests

## Future Enhancements

Potential improvements to E2E testing:

- [ ] Test multi-container deployments (sidecars)
- [ ] Test deployment with different model providers
- [ ] Test failover and recovery scenarios
- [ ] Test upgrade/downgrade paths
- [ ] Performance benchmarking
- [ ] Multi-cluster testing for Kubernetes
- [ ] SSH deployer E2E tests
- [ ] Fleet deployer E2E tests

## References

- [Testcontainers](https://testcontainers.com/) - Container-based testing library
- [kind](https://kind.sigs.k8s.io/) - Kubernetes in Docker
- [Vitest](https://vitest.dev/) - Test framework
- [Docker Documentation](https://docs.docker.com/)
- [Kubernetes Documentation](https://kubernetes.io/docs/)
