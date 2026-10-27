import { CATALOG, studioDocumentTypes } from "@chukta/content";
import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";

/**
 * The editor for Chukta's app text. Its fields come from the catalog in
 * @chukta/content, so they always match what the app reads. Each area is one
 * fixed document (copy_<area>): editors change words, never create or delete.
 */
const types = studioDocumentTypes(CATALOG);
const singletons = new Set(types.map((type) => type.name));

export default defineConfig({
  name: "chukta",
  title: "Chukta text",
  projectId: process.env.SANITY_STUDIO_PROJECT_ID ?? "",
  dataset: process.env.SANITY_STUDIO_DATASET ?? "production",
  plugins: [
    structureTool({
      structure: (S) =>
        S.list()
          .title("App text")
          .items(
            types.map((type) =>
              S.listItem()
                .title(type.title)
                .id(type.name)
                .child(S.document().schemaType(type.name).documentId(type.name).title(type.title)),
            ),
          ),
    }),
  ],
  schema: {
    types,
    // No "create new" for the fixed documents.
    templates: (templates) => templates.filter(({ schemaType }) => !singletons.has(schemaType)),
  },
  document: {
    actions: (actions, { schemaType }) =>
      singletons.has(schemaType)
        ? actions.filter(({ action }) => action && ["publish", "discardChanges", "restore"].includes(action))
        : actions,
  },
});
