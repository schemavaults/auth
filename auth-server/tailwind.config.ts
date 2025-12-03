console.log("@schemavaults/auth-server - tailwind.config.ts");

import type { Config } from "tailwindcss";
// Import the config factory
import SchemaVaultsTailwindConfigFactory from "@schemavaults/theme";

let config: Config;
try {
  // Initialize the config factory
  const configFactory = new SchemaVaultsTailwindConfigFactory();

  // Generate and export the config
  config = configFactory.createConfig({
    content: [
      "./src/**/*.{tsx,jsx,js,ts}",
      "@schemavaults/ui",
      "@schemavaults/auth-ui",
    ],
  }) satisfies Config;
} catch (e) {
  console.error(
    "Failed to generate TailwindCSS config using @schemavaults/theme module!",
    e,
  );
  process.exit(1);
}

export default config;
