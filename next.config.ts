import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(appDir, "..");

const nextConfig: NextConfig = {
  transpilePackages: ["@4rged-ai/platform"],
  turbopack: {
    root: workspaceRoot,
  },
  outputFileTracingRoot: workspaceRoot,
  output: "standalone",
};

export default nextConfig;
