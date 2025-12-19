import { defineConfig } from "cypress";

const devAuthServer: string = "http://localhost:6767";

export default defineConfig({
  e2e: {
    baseUrl: devAuthServer,
  },
  env: {
    PRIVATE_SUPERUSER_INVITE_CODE: "superuser",
    PRIVATE_SUPERUSER_EMAIL: "admin@schemavaults.com",
    PRIVATE_SUPERUSER_PASSWORD: "Password123!",
  },
});
