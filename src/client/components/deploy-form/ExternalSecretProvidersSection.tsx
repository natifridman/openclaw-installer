import React from "react";

interface ExternalSecretProvidersSectionProps {
  secretsProvidersJson: string;
  update: (field: string, value: string) => void;
}

export function ExternalSecretProvidersSection({
  secretsProvidersJson,
  update,
}: ExternalSecretProvidersSectionProps) {
  return (
    <details style={{ marginTop: "1rem" }}>
      <summary style={{ cursor: "pointer", fontWeight: 600 }}>Advanced: External Secret Providers</summary>
      <div className="card" style={{ marginTop: "0.75rem" }}>
        <div className="hint" style={{ marginBottom: "0.75rem" }}>
          Only use this if your secrets come from an external provider such as Vault, a mounted file, or a custom
          command. This field defines the optional <code>secrets.providers</code> object. Runtime prerequisites still
          need to exist inside the OpenClaw environment.
        </div>
        <div className="form-group">
          <label>Secret Providers JSON (optional)</label>
          <textarea
            rows={6}
            placeholder={`{\n  "default": { "source": "env" },\n  "vault_openai": {\n    "source": "exec",\n    "command": "/usr/local/bin/vault",\n    "args": ["kv", "get", "-field=OPENAI_API_KEY", "secret/openclaw"],\n    "passEnv": ["VAULT_ADDR", "VAULT_TOKEN"]\n  }\n}`}
            value={secretsProvidersJson}
            onChange={(e) => update("secretsProvidersJson", e.target.value)}
          />
        </div>
      </div>
    </details>
  );
}
