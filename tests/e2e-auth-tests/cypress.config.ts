import { defineConfig } from "cypress";

const devAuthServer: string = "http://localhost:6767";

export default defineConfig({
  e2e: {
    baseUrl: devAuthServer,
    setupNodeEvents(on, config) {
      // implement node event listeners here
    },
  },
});
