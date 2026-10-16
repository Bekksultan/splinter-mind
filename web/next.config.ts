import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @splinter-mind/core is a symlinked file: dependency (../packages/core)
  // that Turbopack cannot resolve across the project root boundary.
  // `npm run postinstall` vendors a fresh copy of its built dist into
  // ./vendor (inside the project root); the bundler aliases to that copy.
  // TypeScript still resolves types from node_modules/@splinter-mind/core.
  turbopack: {
    resolveAlias: {
      "@splinter-mind/core": "./vendor/splinter-core/dist/index.js",
    },
  },
};

export default nextConfig;
