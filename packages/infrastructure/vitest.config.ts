import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    server: {
      deps: {
        // Powertools ships an ESM build that uses require(); inline it so
        // Vitest transforms it instead of importing the raw ESM entrypoint.
        inline: [/@aws-lambda-powertools/],
      },
    },
  },
});
