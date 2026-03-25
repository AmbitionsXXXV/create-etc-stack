import { defineConfig } from "vite-plus"

export default defineConfig({
  build: {
    rolldownOptions: {
      input: { preload: "src/preload/index.ts" }
    }
  }
})
