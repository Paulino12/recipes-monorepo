import { getSanityWriteClients, sanityServer } from "@/lib/sanity/serverClient";

export const ADMIN_AUDIENCES = ["public", "enterprise"] as const;
export type AdminAudience = (typeof ADMIN_AUDIENCES)[number];
export const ADMIN_PAGE_SIZES = [10, 50, 100] as const;
export type AdminPageSize = (typeof ADMIN_PAGE_SIZES)[number];

export type AdminRecipesResult = {
  items: AdminRecipeRow[];
  total: number;
  page: number;
  pageSize: AdminPageSize;
  totalPages: number;
  categories: AdminCategoryOption[];
};

export type AdminRecipeRow = {
  id: string;
  pluNumber: number;
  title: string;
  categoryPath?: string[];
  portions: number | null;
  visibility?: {
    public?: boolean;
    enterprise?: boolean;
  };
};

export type AdminCategoryOption = {
  name: string;
  count: number;
};

type RelationRecipeRow = {
  id: string;
  title: string;
  ingredients?: Array<{ item?: string; text?: string }>;
};

type TitleIndexRow = {
  id: string;
  norm: string;
};

const ADMIN_RECIPES_COUNT_QUERY = `
  count(
    *[
      _type == "recipe" &&
      !(_id in path("drafts.**")) &&
      (!defined($category) || $category in categoryPath) &&
      (!defined($q) || title match $q)
    ]
  )
`;

const ADMIN_RECIPES_ITEMS_QUERY = `
  *[
    _type == "recipe" &&
    !(_id in path("drafts.**")) &&
    (!defined($category) || $category in categoryPath) &&
    (!defined($q) || title match $q)
  ] | order(title asc, _id asc)[$start...$end] {
    "id": _id,
    pluNumber,
    title,
    categoryPath,
    portions,
    visibility
  }
`;

const ADMIN_RECIPE_CATEGORIES_QUERY = `
  *[
    _type == "recipe" &&
    !(_id in path("drafts.**")) &&
    defined(categoryPath[0]) &&
    string(categoryPath[0]) != ""
  ]{
    "category": categoryPath[0]
  }
`;

const ADMIN_RELATION_GRAPH_QUERY = `
  *[
    _type == "recipe" &&
    !(_id in path("drafts.**"))
  ]{
    "id": _id,
    title,
    ingredients[]{ item, text }
  }
`;

const ADMIN_VISIBILITY_ROWS_QUERY = `
  *[
    _type == "recipe" &&
    !(_id in path("drafts.**")) &&
    _id in $ids
  ]{
    "id": _id,
    visibility
  }
`;

function normalizePage(value: number | undefined) {
  const page = Number.isFinite(value) ? Math.floor(value ?? 1) : 1;
  return page > 0 ? page : 1;
}

function normalizePageSize(value: number | undefined): AdminPageSize {
  if (value === 50 || value === 100) return value;
  return 10;
}

function normalizeCategory(value?: string) {
  const category = value?.trim();
  return category ? category : null;
}

function normalizeComparableText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function scoreTitleMatch(labelNorm: string, titleNorm: string) {
  if (!labelNorm || !titleNorm) return 0;
  if (titleNorm === labelNorm) return 120;
  if (titleNorm.startsWith(labelNorm)) return 110;
  if (labelNorm.startsWith(titleNorm)) return 95;
  if (titleNorm.includes(labelNorm)) return 85;

  const labelTokens = labelNorm.split(" ").filter(Boolean);
  const titleTokens = titleNorm.split(" ").filter(Boolean);
  if (!labelTokens.length || !titleTokens.length) return 0;

  let matched = 0;
  for (const labelToken of labelTokens) {
    const found = titleTokens.some(
      (titleToken) =>
        titleToken.startsWith(labelToken) || labelToken.startsWith(titleToken),
    );
    if (found) matched += 1;
  }

  const ratio = matched / labelTokens.length;
  if (ratio >= 0.9) return 78;
  if (ratio >= 0.75) return 72;
  if (ratio >= 0.6) return 68;
  return 0;
}

function extractPtnReference(value: unknown) {
  if (typeof value !== "string") return null;
  const match = value.match(/\bPTN\b\s+(.+)$/i);
  if (!match) return null;
  const token = match[1]?.trim() || "";
  return token || null;
}

function collectPtnLabels(ingredients?: Array<{ item?: string; text?: string }>) {
  if (!ingredients?.length) return [];
  const labels = new Set<string>();
  for (const ingredient of ingredients) {
    const fromItem = extractPtnReference(ingredient.item);
    const fromText = extractPtnReference(ingredient.text);
    if (fromItem) labels.add(fromItem);
    if (fromText) labels.add(fromText);
  }
  return [...labels];
}

function resolveLabelTargetId(label: string, titles: TitleIndexRow[]) {
  const labelNorm = normalizeComparableText(label);
  if (!labelNorm) return null;

  let bestId: string | null = null;
  let bestScore = 0;
  for (const row of titles) {
    const score = scoreTitleMatch(labelNorm, row.norm);
    if (score > bestScore) {
      bestScore = score;
      bestId = row.id;
    }
  }

  return bestScore >= 72 ? bestId : null;
}

async function resolveRelatedRecipeIds(seedIds: string[]) {
  const uniqueSeeds = [...new Set(seedIds.map((id) => id.trim()).filter(Boolean))];
  if (!uniqueSeeds.length) return [];

  const rows = await sanityServer.fetch<RelationRecipeRow[]>(ADMIN_RELATION_GRAPH_QUERY);
  if (!rows.length) return [];

  const titles: TitleIndexRow[] = rows.map((row) => ({
    id: row.id,
    norm: normalizeComparableText(row.title || ""),
  }));

  const adjacency = new Map<string, Set<string>>();
  for (const row of rows) adjacency.set(row.id, new Set());

  const labelTargetCache = new Map<string, string | null>();

  for (const row of rows) {
    const labels = collectPtnLabels(row.ingredients);
    if (!labels.length) continue;

    for (const label of labels) {
      if (!labelTargetCache.has(label)) {
        labelTargetCache.set(label, resolveLabelTargetId(label, titles));
      }
      const targetId = labelTargetCache.get(label);
      if (!targetId || targetId === row.id) continue;

      // Undirected edge so choosing either main or sub-recipe propagates to all related nodes.
      adjacency.get(row.id)?.add(targetId);
      adjacency.get(targetId)?.add(row.id);
    }
  }

  const visited = new Set<string>();
  const queue: string[] = [];
  for (const seed of uniqueSeeds) {
    if (!adjacency.has(seed) || visited.has(seed)) continue;
    visited.add(seed);
    queue.push(seed);
  }

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    const neighbours = adjacency.get(current);
    if (!neighbours) continue;
    for (const next of neighbours) {
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push(next);
    }
  }

  return [...visited];
}

async function patchRecipeVisibility(
  recipeId: string,
  nextVisibility: { public: boolean; enterprise: boolean },
) {
  const writeClients = getSanityWriteClients();
  let sawHostMismatch = false;
  let sawPermissionFailure = false;
  const attemptedSources: string[] = [];

  for (const { source, client } of writeClients) {
    attemptedSources.push(source);
    try {
      await client
        .patch(recipeId)
        .set({
          "visibility.public": nextVisibility.public,
          "visibility.enterprise": nextVisibility.enterprise,
        })
        .commit();
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      if (message.includes("session does not match project host")) {
        sawHostMismatch = true;
        continue;
      }
      if (message.includes("insufficient permissions")) {
        sawPermissionFailure = true;
        continue;
      }
      throw error;
    }
  }

  if (sawPermissionFailure) {
    throw new Error(
      `Sanity token lacks update permission for recipe documents. Tried: ${attemptedSources.join(", ")}. Use a token with update grants (prefer SANITY_API_WRITE_TOKEN) and restart the dev server.`,
    );
  }

  if (sawHostMismatch) {
    const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ?? "<missing-project-id>";
    throw new Error(
      `Sanity write token does not belong to project "${projectId}". Create a write token in that exact project and set SANITY_API_WRITE_TOKEN.`,
    );
  }

  throw new Error("Failed to update recipe visibility due to missing or invalid Sanity token.");
}

function assertWriteTokenConfigured() {
  if (
    !process.env.SANITY_API_WRITE_TOKEN &&
    !process.env.SANITY_API_TOKEN &&
    !process.env.SANITY_API_READ_TOKEN
  ) {
    throw new Error(
      "Missing Sanity API token for updates. Set SANITY_API_WRITE_TOKEN, SANITY_API_TOKEN, or SANITY_API_READ_TOKEN.",
    );
  }
}

export async function listAdminCategories() {
  const rows = await sanityServer.fetch<Array<{ category?: string }>>(ADMIN_RECIPE_CATEGORIES_QUERY);
  const counts = new Map<string, number>();
  for (const row of rows) {
    const category = row.category?.trim();
    if (!category) continue;
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function listAdminRecipes(
  query?: string,
  options?: { page?: number; pageSize?: number; category?: string },
): Promise<AdminRecipesResult> {
  const q = query?.trim();
  const category = normalizeCategory(options?.category);
  const page = normalizePage(options?.page);
  const pageSize = normalizePageSize(options?.pageSize);
  const params = { q: q ? `*${q}*` : null, category };
  const totalRaw = await sanityServer.fetch<number>(ADMIN_RECIPES_COUNT_QUERY, params);
  const total = Number.isFinite(totalRaw) ? Math.max(0, Number(totalRaw)) : 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const resolvedPage = Math.min(page, totalPages);
  const start = (resolvedPage - 1) * pageSize;
  const end = start + pageSize;
  const categories = await listAdminCategories();
  const items = await sanityServer.fetch<AdminRecipeRow[]>(ADMIN_RECIPES_ITEMS_QUERY, {
    ...params,
    start,
    end,
  });

  return {
    items,
    total,
    page: resolvedPage,
    pageSize,
    totalPages,
    categories,
  };
}

export async function setRecipesVisibility(
  seedIds: string[],
  audience: AdminAudience,
  value: boolean,
) {
  assertWriteTokenConfigured();

  const uniqueSeedIds = [...new Set(seedIds.map((id) => id.trim()).filter(Boolean))];
  if (!uniqueSeedIds.length) {
    return { updatedIds: [] as string[], relatedIds: [] as string[] };
  }

  const relatedIds = await resolveRelatedRecipeIds(uniqueSeedIds);
  if (!relatedIds.length) {
    return { updatedIds: [] as string[], relatedIds: [] as string[] };
  }

  const currentRows = await sanityServer.fetch<
    Array<{ id: string; visibility?: { public?: boolean; enterprise?: boolean } }>
  >(ADMIN_VISIBILITY_ROWS_QUERY, { ids: relatedIds });
  if (!currentRows.length) {
    return { updatedIds: [] as string[], relatedIds };
  }

  const updatedIds: string[] = [];
  for (const row of currentRows) {
    const nextVisibility = {
      public: Boolean(row.visibility?.public),
      enterprise: Boolean(row.visibility?.enterprise),
      [audience]: value,
    };

    await patchRecipeVisibility(row.id, nextVisibility);
    updatedIds.push(row.id);
  }

  return { updatedIds, relatedIds };
}
