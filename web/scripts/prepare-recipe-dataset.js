#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Normalizes recipe dataset files used by this project.
 *
 * Actions:
 * 1) Clean ingredient item names (supplier/packaging tails removed).
 * 2) Rebuild ingredient text as: "<qty> <unit> <item>".
 * 3) Convert recipe numbers from 93xxxxxx -> 12xxxxxx for id/pluNumber/_id.
 *    - Automatically resolves collisions with deterministic unique 12xxxxxx values.
 * 4) Ensure each recipe has an imageUrl fallback placeholder.
 * 5) Update source.pdfPath numeric file id to the mapped recipe number.
 *
 * Usage:
 *   node scripts/prepare-recipe-dataset.js
 */

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(process.cwd(), "data");
const JSON_PATH = path.join(DATA_DIR, "golden_samples.json");
const NDJSON_PATH = path.join(DATA_DIR, "sanity_golden_samples_v3.ndjson");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const PLACEHOLDER_IMAGE_URL = "/recipe-placeholder.svg";

const SUPPLIER_PHRASES = [
  "Classic Fine Foods UK Ltd",
  "Fine Foods UK Ltd",
  "Frozen Foodservice Ltd",
  "Food Service Limited",
  "Foodservice Limited",
  "Harvey & Brockless Limited",
  "Belazu Ingredient Company",
  "The Ingredient Company",
  "Peters Food Service Limited",
  "Peters Food Service",
  "Asher & Son Ltd",
  "Brakes",
  "Bidfood",
  "Sysco",
  "Caterers Pride",
  "Ltd",
  "Limited",
];

const TRAILING_TOKENS = [
  "BB",
  "PK",
  "PETBTL",
  "B/B",
  "FROZEN",
  "CATERING",
  "PREMIUM",
  "LTD",
  "LIMITED",
  "FOODSERVICE",
  "COMPANY",
  "UK",
];

function nowStamp() {
  const now = new Date();
  return [
    now.getFullYear().toString(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    "-",
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");
}

function normalize(value) {
  return String(value ?? "")
    .replace(/\u00A0/g, " ")
    .replace(/\u00C2/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeComparable(value) {
  return normalize(value).toLowerCase();
}

function removeSupplierPhrase(value) {
  let out = value;
  for (const phrase of SUPPLIER_PHRASES) {
    const idx = out.toLowerCase().indexOf(phrase.toLowerCase());
    if (idx > 0) out = out.slice(0, idx).trim();
  }
  return out;
}

function stripTail(value) {
  let out = value;
  let prev = "";
  while (out !== prev) {
    prev = out;

    out = out
      .replace(/\s+Ingredient\s+not\s+on\s+unit\b.*$/i, "")
      .replace(/\s+Product\s+not\s+on\s+unit\b.*$/i, "")
      .replace(/\s+[A-Z]{2,}[A-Z0-9-]*\d+[A-Z0-9-]*$/g, "")
      .replace(/\s+\d+(?:\.\d+)?\s?(?:KG|G|L|ML|CL|OZ|LB|EA|CM|MM)\b$/i, "")
      .replace(
        /\s+\d+(?:\.\d+)?\s?[xX]\s?\d+(?:\.\d+)?\s?(?:KG|G|L|ML|CL|OZ|LB)\b$/i,
        "",
      )
      .replace(/\s+\d+\s?[xX]\s?\d+\b$/i, "")
      .replace(/\s+Pack\s+of\s+\d+\b$/i, "")
      .replace(/\s+\d+(?:-\d+)?\s?Bulbs\b$/i, "")
      .replace(/\s+\d+\/?\d*\s?N\b$/i, "")
      .replace(
        /\s+\d+(?:\.\d+)?\s?(?:G|KG|ML|L)\s*\/\s*\d+(?:\.\d+)?\s?(?:G|KG|ML|L)\b$/i,
        "",
      )
      .replace(/\s+\d+(?:\.\d+)?\s?(?:G|KG|ML|L)\s*\/\s*(?:G|KG|ML|L)\b$/i, "")
      .trim();

    const parts = out.split(" ");
    while (parts.length > 1) {
      const last = parts[parts.length - 1].replace(/[^A-Za-z/]/g, "").toUpperCase();
      if (!last) {
        parts.pop();
        continue;
      }
      if (TRAILING_TOKENS.includes(last)) {
        parts.pop();
        continue;
      }
      break;
    }
    out = parts.join(" ").replace(/\s*[-,/]?\s*$/, "").trim();
  }
  return out;
}

function cleanIngredientItem(item) {
  const src = normalize(item);
  if (!src) return src;
  const cleaned = normalize(stripTail(removeSupplierPhrase(src)));
  return cleaned || src;
}

function formatQty(qty) {
  if (typeof qty !== "number") return String(qty ?? "");
  return Number.isInteger(qty) ? String(qty) : String(qty);
}

function rebuildIngredientText(line) {
  return [formatQty(line.qty), normalize(line.unit), normalize(line.item)]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function mapPrefix93to12(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === "number") {
    const mapped = mapPrefix93to12(String(Math.trunc(value)));
    return typeof mapped === "string" ? Number(mapped) : value;
  }

  const src = String(value);
  if (!src.startsWith("93")) return src;
  return `12${src.slice(2)}`;
}

function recipeFingerprint(kind, recipe) {
  const id = kind === "json" ? normalize(recipe.id) : normalize(recipe._id);
  const title = normalizeComparable(recipe.title);
  const category = Array.isArray(recipe.categoryPath)
    ? normalizeComparable(recipe.categoryPath.join(" > "))
    : "";
  const sourcePdf = normalizeComparable(recipe.source?.pdfPath);
  return `${id}::${title}::${category}::${sourcePdf}`;
}

function buildRecipeNumberResolver(jsonRecipes, ndjsonDocs) {
  const records = [];

  for (const recipe of jsonRecipes) {
    records.push({
      fingerprint: recipeFingerprint("json", recipe),
      originalId: normalize(recipe.id),
    });
  }
  for (const doc of ndjsonDocs) {
    records.push({
      fingerprint: recipeFingerprint("ndjson", doc),
      originalId: normalize(doc._id),
    });
  }

  const byFingerprint = new Map();
  for (const record of records) {
    if (!record.fingerprint || !record.originalId) continue;
    if (!byFingerprint.has(record.fingerprint)) byFingerprint.set(record.fingerprint, record.originalId);
  }

  const used = new Set();
  const mappedByFingerprint = new Map();
  const pending = [];

  for (const [fingerprint, originalId] of byFingerprint.entries()) {
    const desired = normalize(mapPrefix93to12(originalId));
    if (!used.has(desired)) {
      used.add(desired);
      mappedByFingerprint.set(fingerprint, desired);
      continue;
    }
    pending.push({ fingerprint, originalId, desired });
  }

  let nextCandidate = 12000000;
  for (const value of used) {
    if (/^\d+$/.test(value)) {
      nextCandidate = Math.max(nextCandidate, Number(value) + 1);
    }
  }

  let collisionRemaps = 0;
  for (const record of pending) {
    while (used.has(String(nextCandidate))) {
      nextCandidate += 1;
    }
    const reassigned = String(nextCandidate);
    mappedByFingerprint.set(record.fingerprint, reassigned);
    used.add(reassigned);
    nextCandidate += 1;
    collisionRemaps += 1;
  }

  return {
    collisionRemaps,
    resolve(kind, recipe) {
      const key = recipeFingerprint(kind, recipe);
      if (mappedByFingerprint.has(key)) return mappedByFingerprint.get(key);
      // Fallback when fingerprint isn't found (should be rare).
      const baseId = kind === "json" ? recipe.id : recipe._id;
      return normalize(mapPrefix93to12(baseId));
    },
  };
}

function transformIngredients(ingredients, stats) {
  if (!Array.isArray(ingredients)) return ingredients;

  return ingredients.map((line) => {
    if (!line || typeof line !== "object") return line;
    const next = { ...line };

    const beforeItem = normalize(next.item);
    const afterItem = cleanIngredientItem(beforeItem);
    if (beforeItem && afterItem && beforeItem !== afterItem) {
      stats.cleanedIngredientItems += 1;
    }
    next.item = afterItem || beforeItem;

    const beforeText = normalize(next.text);
    const afterText = rebuildIngredientText(next);
    if (beforeText && afterText && beforeText !== afterText) {
      stats.rebuiltIngredientTexts += 1;
    }
    if (afterText) next.text = afterText;

    return next;
  });
}

function mapSourcePdfPath(sourcePath, mappedId) {
  const current = normalize(sourcePath);
  if (!current) return current;
  return current.replace(/\/\d+\.pdf$/i, `/${mappedId}.pdf`);
}

function transformRecipe(recipe, stats, kind, resolveRecipeNumber) {
  const next = { ...recipe };
  const mappedId = normalize(resolveRecipeNumber(kind, recipe));
  const mappedNumber = Number(mappedId);

  if (!mappedId) {
    throw new Error(`Recipe missing mapped id (kind=${kind})`);
  }
  if (!Number.isFinite(mappedNumber) || mappedNumber <= 0) {
    throw new Error(`Recipe has invalid mapped number ${mappedId} (kind=${kind})`);
  }

  if (kind === "json") {
    if (normalize(next.id) !== mappedId) stats.mappedIds += 1;
    if (Number(next.pluNumber) !== mappedNumber) stats.mappedNumbers += 1;
    next.id = mappedId;
    next.pluNumber = mappedNumber;
  } else {
    if (normalize(next._id) !== mappedId) stats.mappedIds += 1;
    if (Number(next.pluNumber) !== mappedNumber) stats.mappedNumbers += 1;
    next._id = mappedId;
    next.pluNumber = mappedNumber;
  }

  next.ingredients = transformIngredients(next.ingredients, stats);

  if (!normalize(next.imageUrl)) {
    next.imageUrl = PLACEHOLDER_IMAGE_URL;
    stats.addedImagePlaceholders += 1;
  }

  if (next.source && typeof next.source === "object") {
    const beforePdf = normalize(next.source.pdfPath);
    const afterPdf = mapSourcePdfPath(beforePdf, mappedId);
    if (beforePdf && afterPdf && beforePdf !== afterPdf) {
      next.source = { ...next.source, pdfPath: afterPdf };
      stats.mappedSourcePdfIds += 1;
    }
  }

  return next;
}

function assertUnique(values, label) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) {
      throw new Error(`Duplicate ${label} detected after transform: ${value}`);
    }
    seen.add(value);
  }
}

function main() {
  if (!fs.existsSync(JSON_PATH) || !fs.existsSync(NDJSON_PATH)) {
    throw new Error(
      "Dataset files not found. Expected data/golden_samples.json and data/sanity_golden_samples_v3.ndjson",
    );
  }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = nowStamp();
  const jsonBackup = path.join(BACKUP_DIR, `golden_samples.${stamp}.bak.json`);
  const ndjsonBackup = path.join(BACKUP_DIR, `sanity_golden_samples_v3.${stamp}.bak.ndjson`);
  fs.copyFileSync(JSON_PATH, jsonBackup);
  fs.copyFileSync(NDJSON_PATH, ndjsonBackup);

  const stats = {
    jsonRecipes: 0,
    ndjsonRecipes: 0,
    collisionRemaps: 0,
    cleanedIngredientItems: 0,
    rebuiltIngredientTexts: 0,
    mappedIds: 0,
    mappedNumbers: 0,
    mappedSourcePdfIds: 0,
    addedImagePlaceholders: 0,
  };

  const jsonRecipes = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));
  const ndjsonDocs = fs
    .readFileSync(NDJSON_PATH, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));

  const resolver = buildRecipeNumberResolver(jsonRecipes, ndjsonDocs);
  stats.collisionRemaps = resolver.collisionRemaps;

  const nextJsonRecipes = jsonRecipes.map((recipe) => {
    stats.jsonRecipes += 1;
    return transformRecipe(recipe, stats, "json", resolver.resolve);
  });
  assertUnique(nextJsonRecipes.map((x) => normalize(x.id)), "JSON id");
  assertUnique(nextJsonRecipes.map((x) => String(x.pluNumber)), "JSON recipe number");
  fs.writeFileSync(JSON_PATH, `${JSON.stringify(nextJsonRecipes, null, 4)}\n`, "utf8");

  const nextDocs = ndjsonDocs.map((doc) => {
    stats.ndjsonRecipes += 1;
    return transformRecipe(doc, stats, "ndjson", resolver.resolve);
  });
  assertUnique(nextDocs.map((x) => normalize(x._id)), "NDJSON _id");
  assertUnique(nextDocs.map((x) => String(x.pluNumber)), "NDJSON recipe number");
  fs.writeFileSync(NDJSON_PATH, `${nextDocs.map((doc) => JSON.stringify(doc)).join("\n")}\n`, "utf8");

  console.log("Dataset prepared successfully.");
  console.log(`Backup JSON: ${jsonBackup}`);
  console.log(`Backup NDJSON: ${ndjsonBackup}`);
  console.log(JSON.stringify(stats, null, 2));
}

main();
