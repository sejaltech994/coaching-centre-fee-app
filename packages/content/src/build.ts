import { CATALOG, resolveCopy } from "./copy";
import { fetchCopyFromSanity, sanityConfigFrom } from "./sanity";

/**
 * Called from the web app's next.config: the copy to bake into this build, as
 * JSON, or undefined to use the built-in text. A configured CMS that can't be
 * read fails the build, so a deploy never ships with text silently reverted.
 */
export async function loadCopyForBuild(
  env: Record<string, string | undefined>,
  { fetch: fetchImpl = fetch, log = console.log }: { fetch?: typeof fetch; log?: (line: string) => void } = {},
): Promise<string | undefined> {
  const onCi = env.GITHUB_ACTIONS === "true";
  try {
    return await load(env, fetchImpl, log, onCi);
  } catch (err) {
    // Workflow logs are admin-only; an annotation shows on the run page to anyone.
    if (onCi) log(`::error title=CMS copy::${(err as Error).message}`);
    throw err;
  }
}

async function load(
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch,
  log: (line: string) => void,
  onCi: boolean,
): Promise<string | undefined> {
  const config = sanityConfigFrom(env);
  if (!config) {
    log("Copy: SANITY_PROJECT_ID is not set, using the built-in text.");
    return undefined;
  }

  let raw;
  try {
    raw = await fetchCopyFromSanity(config, CATALOG, fetchImpl);
  } catch (err) {
    throw new Error(`Couldn't read copy from Sanity: ${(err as Error).message}`, { cause: err });
  }
  log(`Copy: read ${config.perspective} text from Sanity project ${config.projectId} (${config.dataset}).`);

  const { copy, problems } = resolveCopy(raw);
  const warn = onCi ? "::warning title=CMS copy::" : "Copy warning: ";
  for (const problem of problems) log(`${warn}${problem} (using the built-in text)`);
  return JSON.stringify(copy);
}
