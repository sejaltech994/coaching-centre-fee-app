import { defineCliConfig } from "sanity/cli";

export default defineCliConfig({
  api: {
    projectId: process.env.SANITY_STUDIO_PROJECT_ID ?? "",
    dataset: process.env.SANITY_STUDIO_DATASET ?? "production",
  },
  // Hosted free by Sanity at https://<studioHost>.sanity.studio
  studioHost: process.env.SANITY_STUDIO_HOST ?? "chukta",
});
