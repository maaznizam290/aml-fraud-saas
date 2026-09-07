/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // This app is API-routes-only for this branch (no pages/UI) — the
  // investigation-dashboard branch owns the frontend. Image optimization,
  // middleware, and i18n rewrites are all unused, which is deliberate: see
  // docs/ORCHESTRATION.md "Known limitations" for the npm audit tradeoff
  // this narrows.
  webpack: (config) => {
    // lib/**/*.ts (from feature/supabase-schema and this branch) imports
    // sibling modules with an explicit ".js" extension — correct, required
    // style under tsconfig's NodeNext-style ESM resolution (`tsc`/Node's
    // native ESM loader map a ".js" specifier to the sibling ".ts" source).
    // Webpack's own resolver does not do that mapping by default and was
    // failing every such import with "Module not found" — this restores it.
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
