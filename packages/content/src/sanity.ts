import { checkEntry, type Catalog } from "./copy";

/**
 * Sanity holds one document per catalog area (type and id `copy_<area>`), with
 * one field per entry. Text is read once, at build time; the site stays static.
 */

const API_VERSION = "v2025-02-19";

export type SanityConfig = {
  projectId: string;
  dataset: string;
  /** "drafts" shows unpublished edits (dev, sit, uat); "published" is what production shows. */
  perspective: "published" | "drafts";
  /** A read token; required for drafts. */
  token?: string;
};

const documentType = (area: string) => `copy_${area}`;

/** null when no project is configured: the build then uses the built-in text. */
export function sanityConfigFrom(env: Record<string, string | undefined>): SanityConfig | null {
  const projectId = env.SANITY_PROJECT_ID?.trim();
  if (!projectId) return null;
  const perspective = env.SANITY_PERSPECTIVE === "drafts" ? "drafts" : "published";
  const token = env.SANITY_READ_TOKEN?.trim() || undefined;
  if (perspective === "drafts" && !token) {
    throw new Error("SANITY_PERSPECTIVE=drafts needs SANITY_READ_TOKEN: drafts are private.");
  }
  return { projectId, dataset: env.SANITY_DATASET?.trim() || "production", perspective, token };
}

/** The CMS text by area and entry, as stored; resolveCopy() checks it. */
export async function fetchCopyFromSanity(
  config: SanityConfig,
  catalog: Catalog,
  fetchImpl: typeof fetch = fetch,
): Promise<Record<string, Record<string, unknown>>> {
  // Drafts are private, so they come from the live API; published text from the CDN.
  const host = config.token ? "api.sanity.io" : "apicdn.sanity.io";
  const url = new URL(`https://${config.projectId}.${host}/${API_VERSION}/data/query/${config.dataset}`);
  url.searchParams.set("query", "*[_type in $types]");
  url.searchParams.set("$types", JSON.stringify(Object.keys(catalog).map(documentType)));
  url.searchParams.set("perspective", config.perspective);

  const res = await fetchImpl(url, {
    headers: config.token ? { authorization: `Bearer ${config.token}` } : {},
  });
  if (!res.ok) throw new Error(`Sanity answered ${res.status} for project ${config.projectId}`);
  const { result } = (await res.json()) as { result: Record<string, unknown>[] };

  const byArea: Record<string, Record<string, unknown>> = {};
  for (const doc of result) {
    const area = String(doc._type).replace(/^copy_/, "");
    byArea[area] = Object.fromEntries(Object.entries(doc).filter(([key]) => !key.startsWith("_")));
  }
  return byArea;
}

type Rule = { required(): Rule; custom(fn: (value: unknown) => true | string): Rule };

/** Sanity Studio document types for the catalog, so the editor always matches the code. */
export function studioDocumentTypes(catalog: Catalog) {
  return Object.entries(catalog).map(([area, { title, entries }]) => ({
    name: documentType(area),
    type: "document" as const,
    title,
    fields: Object.entries(entries).map(([key, entry]) => {
      const placeholders = entry.text.match(/\{\w+\}/g);
      return {
        name: key,
        title: entry.label,
        type: entry.multiline ? ("text" as const) : ("string" as const),
        initialValue: entry.text,
        description: `Built-in text: “${entry.text}”${placeholders ? `. Keep ${[...new Set(placeholders)].join(", ")}: the app fills ${placeholders.length > 1 ? "them" : "it"} in.` : ""}`,
        validation: (rule: Rule) =>
          rule.required().custom((value) => (typeof value === "string" ? checkEntry(entry, value) : true)),
      };
    }),
  }));
}
