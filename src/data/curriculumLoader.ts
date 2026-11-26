import type { Article } from "./curriculumTypes";
import { ARTICLE_INDEX, ARTICLE_INDEX_MAP } from "./curriculumIndex";
import { filterArticlesByScope } from "./articleTaxonomy";

export type VolumeKey =
  | "vol_bx1"
  | "vol_bx2"
  | "vol_xb1"
  | "vol_xb2"
  | "vol_xb3"
  | "vol_xx";

const ALL_VOLUME_KEYS: readonly VolumeKey[] = [
  "vol_bx1",
  "vol_bx2",
  "vol_xb1",
  "vol_xb2",
  "vol_xb3",
  "vol_xx",
];

const articleCache = new Map<string, Article>();
const loadedVolumes = new Set<VolumeKey>();
const inFlightVolumes = new Map<VolumeKey, Promise<void>>();

export function getVolumeKeyForModule(moduleId: string): VolumeKey {
  if (moduleId === "MODULE_BX_1" || moduleId === "MODULE_BX_1_RECITE") return "vol_bx1";
  if (moduleId === "MODULE_BX_2" || moduleId === "MODULE_BX_2_RECITE") return "vol_bx2";
  if (moduleId === "MODULE_XB_1" || moduleId === "MODULE_XB_1_RECITE") return "vol_xb1";
  if (moduleId === "MODULE_XB_2" || moduleId === "MODULE_XB_2_RECITE") return "vol_xb2";
  if (moduleId === "MODULE_XB_3" || moduleId === "MODULE_XB_3_RECITE") return "vol_xb3";
  return "vol_xx";
}

async function importVolumeShard(key: VolumeKey): Promise<Article[]> {
  switch (key) {
    case "vol_bx1":
      return (await import("./curriculumBooks/vol_bx1")).ARTICLES;
    case "vol_bx2":
      return (await import("./curriculumBooks/vol_bx2")).ARTICLES;
    case "vol_xb1":
      return (await import("./curriculumBooks/vol_xb1")).ARTICLES;
    case "vol_xb2":
      return (await import("./curriculumBooks/vol_xb2")).ARTICLES;
    case "vol_xb3":
      return (await import("./curriculumBooks/vol_xb3")).ARTICLES;
    case "vol_xx":
      return (await import("./curriculumBooks/vol_xx")).ARTICLES;
  }
}

/**
 * Load a single volume shard and populate the in-memory article cache (deduplicated).
 */
export function loadVolume(key: VolumeKey): Promise<void> {
  if (loadedVolumes.has(key)) {
    return Promise.resolve();
  }
  const existing = inFlightVolumes.get(key);
  if (existing) {
    return existing;
  }
  const promise = importVolumeShard(key)
    .then((articles) => {
      for (const art of articles) {
        articleCache.set(art.id, art);
      }
      loadedVolumes.add(key);
    })
    .finally(() => {
      inFlightVolumes.delete(key);
    });
  inFlightVolumes.set(key, promise);
  return promise;
}

/**
 * Synchronous cache lookup for an article that has already been loaded.
 */
export function getCachedArticleById(articleId: string): Article | undefined {
  return articleCache.get(articleId);
}

/**
 * Lazily load a single article by ID (only fetches its volume shard).
 */
export async function loadArticleById(articleId: string): Promise<Article | undefined> {
  const cached = articleCache.get(articleId);
  if (cached) return cached;

  const meta = ARTICLE_INDEX_MAP[articleId];
  if (!meta) return undefined;

  await loadVolume(getVolumeKeyForModule(meta.moduleId));
  return articleCache.get(articleId);
}

/**
 * Lazily load a list of articles by ID (fetches only the distinct volume shards needed).
 */
export async function loadArticlesByIds(articleIds: readonly string[]): Promise<Article[]> {
  const neededVolumes = new Set<VolumeKey>();
  for (const id of articleIds) {
    if (articleCache.has(id)) continue;
    const meta = ARTICLE_INDEX_MAP[id];
    if (meta) {
      neededVolumes.add(getVolumeKeyForModule(meta.moduleId));
    }
  }
  if (neededVolumes.size > 0) {
    await Promise.all(Array.from(neededVolumes).map(loadVolume));
  }
  const result: Article[] = [];
  for (const id of articleIds) {
    const art = articleCache.get(id);
    if (art) result.push(art);
  }
  return result;
}

/**
 * Lazily load all full Article records matching a curriculum scope.
 */
export async function loadArticlesForScope(scopeId: string): Promise<Article[]> {
  const metas = filterArticlesByScope(ARTICLE_INDEX, scopeId);
  return loadArticlesByIds(metas.map((m) => m.id));
}

/**
 * Lazily load all 100 full Article records across all 6 volume shards.
 */
export async function loadAllArticles(): Promise<Article[]> {
  await Promise.all(ALL_VOLUME_KEYS.map(loadVolume));
  const result: Article[] = [];
  for (const meta of ARTICLE_INDEX) {
    const art = articleCache.get(meta.id);
    if (art) result.push(art);
  }
  return result;
}
