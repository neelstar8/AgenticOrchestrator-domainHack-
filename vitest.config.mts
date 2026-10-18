import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const alias = {
  "@": fileURLToPath(new URL("./", import.meta.url)),
  // `server-only` throws outside the Next.js bundler. Tests exercise the
  // server modules directly, so it resolves to the package's own no-op entry
  // point rather than being removed from the source.
  "server-only": fileURLToPath(
    new URL("./node_modules/server-only/empty.js", import.meta.url),
  ),
};

export default defineConfig({
  resolve: { alias },
  test: {
    globals: true,
    coverage: {
      provider: "v8",
      reportsDirectory: "./coverage",
      include: ["lib/**", "agents/**", "components/**"],
      exclude: ["**/*.d.ts", "lib/demo/fixtures/**"],
    },
    // Node for logic and integration tests, jsdom only where a DOM is needed.
    projects: [
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: "node",
          environment: "node",
          globals: true,
          setupFiles: ["./tests/setup.ts"],
          include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
          pool: "forks",
        },
      },
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: "components",
          environment: "jsdom",
          globals: true,
          setupFiles: ["./tests/setup.ts"],
          include: ["tests/components/**/*.test.tsx", "tests/components/**/*.test.ts"],
          css: false,
        },
      },
    ],
  },
});
