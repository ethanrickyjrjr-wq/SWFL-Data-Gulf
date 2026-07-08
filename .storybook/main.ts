import type { StorybookConfig } from "@storybook/nextjs-vite";

const config: StorybookConfig = {
  stories: [
    "../{app,components,lib}/**/*.mdx",
    "../{app,components,lib}/**/*.stories.@(js|jsx|mjs|ts|tsx)",
  ],
  addons: [
    "@chromatic-com/storybook",
    "@storybook/addon-vitest",
    "@storybook/addon-a11y",
    "@storybook/addon-docs",
    "@storybook/addon-mcp",
  ],
  framework: "@storybook/nextjs-vite",
  staticDirs: ["..\\public"],
  // Vite's default watch-ignore covers .git/, node_modules/, test-results/,
  // and its own cache/build dirs — but not .next/, which it has no built-in
  // awareness of. Without this, Next's dev-server image cache writing/
  // deleting files under .next/dev/cache/images/ races Vite's chokidar
  // watcher and crashes the whole `storybook dev` process (seen 2026-07-08).
  async viteFinal(config) {
    config.server = {
      ...config.server,
      watch: {
        ...config.server?.watch,
        ignored: ["**/.next/**"],
      },
    };
    return config;
  },
};
export default config;
