// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    // Keep the existing local Next.js public Supabase settings usable while this
    // project is transitioned to the hosted Vite/TanStack source.
    envPrefix: ["VITE_", "NEXT_PUBLIC_"],
    // 4RGE is linked from the shared platform workspace. Force it and this
    // application to resolve one React runtime, including during SSR.
    resolve: {
      dedupe: ["react", "react-dom", "sonner"],
      // Resolve the linked platform as though it lives inside this app, so its
      // peer dependencies use TASMAC's React runtime during SSR.
      preserveSymlinks: true,
    },
    // Pre-bundle 4RGE with React up front so a late dependency re-optimization
    // cannot load two React copies (null useContext in the browser).
    optimizeDeps: {
      include: ["@4rged-ai/platform"],
    },
    ssr: {
      noExternal: ["@4rged-ai/platform", /^@radix-ui\//, "sonner"],
    },
  },
});
