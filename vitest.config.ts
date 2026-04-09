import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    "process.env.NODE_ENV": JSON.stringify("development"),
  },
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "**/__tests__/**",
        "**/*.test.{ts,tsx}",
        "**/test-setup.ts",
        "**/*.d.ts",
        "dist/**",
        "node_modules/**",
      ],
      reportOnFailure: true,
      thresholds: {
        lines: 30,
        functions: 30,
        branches: 30,
        statements: 30,
        autoUpdate: false,
      },
    },
    projects: [
      {
        test: {
          name: "server",
          environment: "node",
          include: ["src/server/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "client",
          environment: "jsdom",
          include: ["src/client/**/*.test.tsx"],
          setupFiles: ["src/client/test-setup.ts"],
        },
      },
    ],
  },
});
