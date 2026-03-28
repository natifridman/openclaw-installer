# ADR 0002: Remove trustedProxies from OpenShift Gateway Config

## Status

Accepted

## Context

The OpenShift deployer patches the gateway's `openclaw.json` ConfigMap after
the base Kubernetes deployer creates it. One of the patches added
`gateway.trustedProxies: ["127.0.0.1", "::1"]`, telling the gateway to treat
connections from localhost as coming from a reverse proxy and to look at
`X-Forwarded-For` headers for the real client IP.

This was added because the OAuth proxy sidecar sits in front of the gateway
and forwards traffic from `localhost:8443` to `localhost:18789`. The intent
was correct: "we have a proxy, so configure proxy trust."

However, this setting breaks subagent spawning (issue #69). Here is the
failure chain:

1. The agent subprocess calls `callGateway()` to spawn a subagent, opening a
   WebSocket to the gateway at `ws://127.0.0.1:18789` with role `"node"`.
2. The gateway sees the connection from `127.0.0.1` and checks `trustedProxies`.
3. `127.0.0.1` is listed, so `resolveClientIp()` treats it as a proxy — it
   looks for `X-Forwarded-For` headers. The agent subprocess doesn't set any
   (it's a direct connection), so `resolveClientIp()` returns `undefined`.
4. `shouldAllowSilentLocalPairing()` checks the resolved client IP. It's
   `undefined`, not a loopback address, so it returns `false`.
5. Device pairing stays pending forever. The agent subprocess can't talk to
   the gateway, and subagent delegation fails with
   `gateway closed (1008): pairing required`.

The `dangerouslyDisableDeviceAuth: true` flag does not help here — it only
bypasses device identity checks for Control UI (operator-role) connections,
not for node-role connections like the agent subprocess.

The local deployer does not set `trustedProxies` and does not have this
problem. Localhost auto-pairing works correctly there.

## Decision

Remove `gateway.trustedProxies` from the OpenShift ConfigMap patch entirely.

## Rationale

### The setting provides no meaningful security value in this deployment

The gateway binds to loopback (`--bind loopback`). Nothing outside the pod
can connect to port 18789. The only processes that reach the gateway are:

- The OAuth proxy sidecar (same pod, localhost)
- The agent subprocess (spawned by the gateway itself, localhost)

There is no external attack surface on the gateway port. The `trustedProxies`
feature is designed to prevent header spoofing when the gateway is exposed to
a network — but when the gateway is on loopback, all connections are already
internal and there is nothing to spoof.

### Security is handled by other layers

| Layer                          | What it does                                | Needs trustedProxies? |
| ------------------------------ | ------------------------------------------- | --------------------- |
| OpenShift Route + OAuth proxy  | Authenticates users via SSO                 | No                    |
| Gateway token auth             | Requires OPENCLAW_GATEWAY_TOKEN for WebSocket | No                    |
| Loopback binding               | Prevents external connections to gateway    | No                    |
| K8s network policies           | Isolates pod traffic                        | No                    |

### What we lose

The gateway will see `127.0.0.1` as the client IP for all connections
(both OAuth-proxied and direct). This means:

- **Logging**: Gateway logs show `127.0.0.1` instead of real user IPs. This
  is a minor diagnostics trade-off. The OAuth proxy's own logs still contain
  real client IPs.
- **IP-based policies**: If the gateway ever added IP-based access rules,
  they wouldn't distinguish clients. But the current deployment uses token
  auth, not IP-based auth.

### What we gain

Localhost auto-pairing works correctly for all connection roles (operator and
node). The agent subprocess's `callGateway()` connections are recognized as
local, `shouldAllowSilentLocalPairing()` returns `true`, and subagent
delegation works without manual intervention.

## Alternatives Considered

### Auto-approve pairing in the bootstrap script

Run `openclaw devices approve --latest` after the gateway starts. This works
(confirmed by manual testing on OpenShift) but is a workaround — it doesn't
fix the root cause, adds timing complexity (must wait for gateway readiness),
and would need to run on every pod restart.

### Set allowRealIpFallback: true

Keep `trustedProxies` but configure the gateway to fall back to the remote
address when `X-Forwarded-For` is missing. This preserves proxy header trust
while fixing agent subprocess auto-pairing. However, this is a gateway-level
config option that may not be available in all versions, and it adds
complexity for no security benefit given the loopback binding.

### Switch to auth.mode: trusted-proxy

Change the gateway to fully delegate auth to the OAuth proxy. This is a
larger change requiring the OAuth proxy to pass user identity headers
(`X-Forwarded-User`) and the gateway to be configured with
`auth.trustedProxy.userHeader`. It would be the right approach if we wanted
to eliminate the gateway token entirely, but it's a bigger architectural
change than needed to fix this bug.

## Consequences

### Positive

- Subagent spawning works on OpenShift without manual intervention
- Brings OpenShift config closer to parity with the working local deployer
- Removes a config interaction that is easy to misunderstand

### Negative

- Gateway logs lose real client IPs (mitigated by OAuth proxy logs)
- If a future use case needs the gateway to distinguish real client IPs
  behind the proxy, `trustedProxies` would need to be re-added along with a
  mechanism to preserve agent subprocess auto-pairing (e.g.,
  `allowRealIpFallback` or a separate internal listener)
