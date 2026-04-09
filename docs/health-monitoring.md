# Health Check Monitoring

The OpenClaw Installer includes a comprehensive health monitoring system that tracks the health status of deployed instances in real-time.

## Overview

The health monitoring system provides:

1. **Real-time health checks** - Automated polling of instance health every minute
2. **Health history tracking** - Stores health check results with configurable retention
3. **Status indicators** - Clear health status (healthy, degraded, unhealthy)
4. **Real-time alerts** - WebSocket notifications when instance health changes
5. **Multi-environment support** - Works for both local (Docker/Podman) and Kubernetes deployments

## Health Status Levels

| Status | Description |
|--------|-------------|
| **healthy** | Instance is running normally with all checks passing |
| **degraded** | Instance is partially functional (e.g., some pods not ready, HTTP response failing) |
| **unhealthy** | Instance is not functional (e.g., container stopped, no ready replicas) |

## API Endpoints

### Get Health Status

Get the current health status of an instance.

```http
GET /api/instances/:id/health
```

**Response (Local Instance):**
```json
{
  "instanceId": "openclaw-alice-demo",
  "mode": "local",
  "healthStatus": "healthy",
  "containerStatus": "running",
  "checks": {
    "container": "passing",
    "httpResponse": "passing"
  },
  "checkedAt": "2024-01-15T10:30:00.000Z"
}
```

**Response (Kubernetes Instance):**
```json
{
  "instanceId": "alice-demo-openclaw",
  "mode": "kubernetes",
  "healthStatus": "healthy",
  "replicas": {
    "desired": 1,
    "ready": 1,
    "available": 1
  },
  "checks": {
    "livenessProbe": "passing",
    "readinessProbe": "passing"
  },
  "checkedAt": "2024-01-15T10:30:00.000Z",
  "details": {
    "pods": [...]
  }
}
```

### Get Health History

Retrieve historical health check results for an instance.

```http
GET /api/instances/:id/health/history?limit=50
```

**Parameters:**
- `limit` (optional): Maximum number of results to return (default: 50, max: 100)

**Response:**
```json
{
  "instanceId": "openclaw-alice-demo",
  "history": [
    {
      "instanceId": "openclaw-alice-demo",
      "mode": "local",
      "healthStatus": "healthy",
      "containerStatus": "running",
      "checks": {
        "container": "passing",
        "httpResponse": "passing"
      },
      "checkedAt": "2024-01-15T10:29:00.000Z"
    },
    ...
  ]
}
```

## Health Checks

### Local Instances (Docker/Podman)

For local instances, the health monitoring system checks:

1. **Container Status** - Whether the container is running
2. **HTTP Response** - Whether the gateway endpoint responds successfully (HTTP GET to `http://localhost:<port>/`)

### Kubernetes Instances

For Kubernetes instances, the health monitoring system checks:

1. **Liveness Probe** - HTTP check on port 18789
   - Initial delay: 60 seconds
   - Period: 30 seconds
   - Timeout: 10 seconds
   - Failure threshold: 3

2. **Readiness Probe** - HTTP check on port 18789
   - Initial delay: 30 seconds
   - Period: 10 seconds
   - Timeout: 5 seconds
   - Failure threshold: 2

3. **Replica Status** - Monitors desired vs ready replicas
4. **Pod Health** - Tracks individual pod phases and container statuses

## Automated Monitoring

The health monitoring service runs automatically when the installer server starts:

- **Polling Interval**: 60 seconds (1 minute)
- **History Retention**: 100 checks per instance (oldest entries are automatically removed)
- **Cleanup**: Old history (>30 days) is cleaned up daily

## Real-time Alerts

The system sends WebSocket alerts when an instance's health status changes:

**Alert Types:**
- Instance becomes **unhealthy** (e.g., container stopped, no ready replicas)
- Instance becomes **degraded** (e.g., some pods not ready)
- Instance recovers to **healthy** status

**WebSocket Message Format:**
```json
{
  "type": "health-alert",
  "alert": {
    "instanceId": "openclaw-alice-demo",
    "healthStatus": "unhealthy",
    "previousStatus": "healthy",
    "message": "⚠️ Instance openclaw-alice-demo is now UNHEALTHY (container stopped)",
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

## Configuration

### Polling Interval

The default polling interval is 60 seconds. To change it, modify the `startHealthMonitoring` call in `src/server/index.ts`:

```typescript
// Check health every 2 minutes instead
const healthMonitorInterval = startHealthMonitoring(120000);
```

### History Retention

Health check results are stored in `~/.openclaw/installer/health-history/`. Each instance has its own JSON file.

- **Maximum entries per instance**: 100
- **Cleanup interval**: 24 hours
- **Retention period**: 30 days

To change the retention period, modify the cleanup call in `src/server/services/health-monitor.ts`:

```typescript
// Keep 60 days of history instead
const cleanupInterval = setInterval(() => {
  void cleanupOldHealthHistory(60);
}, 24 * 60 * 60 * 1000);
```

## Troubleshooting

### Health checks showing "degraded" for local instances

If a local instance shows as degraded despite the container running:
1. Verify the gateway is accessible: `curl http://localhost:<port>/`
2. Check container logs: `docker logs openclaw-<instance-name>`
3. Ensure no firewall is blocking the port

### Health checks not updating

If health status is not updating:
1. Check server logs for health monitoring errors
2. Verify the health monitoring service started: look for "Starting health monitoring service" in logs
3. Check file permissions for `~/.openclaw/installer/health-history/`

### K8s health checks failing

If Kubernetes instance health checks fail:
1. Verify pod status: `kubectl get pods -n <namespace>`
2. Check pod logs: `kubectl logs deployment/openclaw -n <namespace> -c gateway`
3. Verify the Service is accessible
4. Check probe configuration in the Deployment manifest

## Implementation Details

### File Locations

- **Health monitor service**: `src/server/services/health-monitor.ts`
- **Health history storage**: `src/server/services/health-history.ts`
- **API endpoints**: `src/server/routes/status.ts`
- **WebSocket alerts**: `src/server/ws.ts`

### Storage Location

Health history is stored at:
```
~/.openclaw/installer/health-history/<instance-id>.json
```

Each file contains an array of health check results, automatically managed and pruned.

## Future Enhancements

Potential improvements to the health monitoring system:

- [ ] Configurable alert thresholds
- [ ] Email/Slack notifications for health changes
- [ ] Health metrics dashboard
- [ ] Custom health check endpoints
- [ ] Performance metrics tracking (response times, resource usage)
- [ ] Health trend analysis and predictions
