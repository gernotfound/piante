import { coldMinimumOf, fruitTypeOf, plantGroupOf } from "./domain.js";

export function normalizePlantQuery(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("it").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

// Equivalenze conservative: una cultivar non viene dedotta da una specie.
const synonymGroups = [
  ["fico d india", "opuntia ficus indica", "prickly pear"],
  ["maracuja", "frutto della passione", "passion fruit", "passiflora edulis"],
  ["granadilla dolce", "sweet granadilla", "passiflora ligularis"],
  ["batata", "patata dolce", "ipomoea batatas"],
  ["topinambur", "girasole tuberoso", "helianthus tuberosus"],
  ["avocado", "persea americana"]
];

function queryVariants(input) {
  const query = normalizePlantQuery(input);
  if (!query) return [];
  const matches = new Set([query]);
  for (const group of synonymGroups) {
    if (group.includes(query)) group.forEach((term) => matches.add(term));
  }
  return [...matches];
}

function isSingleEditAway(a, b) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0; let j = 0; let differences = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++differences > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return differences + (a.length - i) + (b.length - j) <= 1;
}

function plantSearchFields(plant) {
  const aliases = String(plant.searchAliases || "").split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
  return [plant.name, plant.scientificName, plant.variety, plant.category,
    plant.plantGroup, plant.fruitType, plant.growthHabit, ...aliases]
    .map(normalizePlantQuery).filter(Boolean);
}

export function plantSearchScore(plant, query) {
  const variants = queryVariants(query);
  if (!variants.length) return 1;
  const fields = plantSearchFields(plant);
  let best = 0;
  for (const variant of variants) {
    const terms = variant.split(" ");
    if (fields.includes(variant)) { best = Math.max(best, variant === variants[0] ? 120 : 95); continue; }
    if (fields.some((field) => field.startsWith(variant))) {
      best = Math.max(best, variant === variants[0] ? 90 : 70); continue;
    }
    if (fields.some((field) => field.includes(variant))) {
      best = Math.max(best, variant === variants[0] ? 70 : 50); continue;
    }
    const words = fields.join(" ").split(" ");
    let total = 0;
    const all = terms.every((term) => {
      if (words.includes(term)) { total += 14; return true; }
      if (words.some((word) => word.startsWith(term))) { total += 10; return true; }
      if (words.some((word) => word.includes(term))) { total += 7; return true; }
      if (term.length >= 5 && words.some((word) => isSingleEditAway(term, word))) {
        total += 3; return true;
      }
      return false;
    });
    if (all) best = Math.max(best, total);
  }
  return best;
}

function sortMatches(items, query, fruitFirst) {
  const q = String(query || "").trim();
  return items.sort((a, b) => {
    if (q) {
      const diff = plantSearchScore(b, q) - plantSearchScore(a, q);
      if (diff) return diff;
    } else if (fruitFirst) {
      const fruitA = plantGroupOf(a) === "Piante da frutto" ? 1 : 0;
      const fruitB = plantGroupOf(b) === "Piante da frutto" ? 1 : 0;
      if (fruitA !== fruitB) return fruitB - fruitA;
    }
    return String(a.name ?? "").localeCompare(String(b.name ?? ""), "it");
  });
}

function matchesTrait(plant, key, selected) {
  return selected === "Tutte" || plant[key] === selected;
}
function matchesHarvest(plant, month) {
  if (month === "" || month === null || month === undefined) return true;
  const target = Number(month);
  return Number.isInteger(target) && target >= 1 && target <= 12 &&
    Array.isArray(plant.harvestMonths) && plant.harvestMonths.includes(target);
}

function matchesClimate(plant, minimum) {
  if (minimum === "" || minimum === null || minimum === undefined) return true;
  const threshold = Number(minimum);
  const recorded = coldMinimumOf(plant);
  return Number.isFinite(threshold) && recorded !== null && recorded <= threshold;
}

export function filterCatalog(items, {
  query = "", category = "Tutte", group = "Tutte", fruitType = "Tutte", minTempC = "",
  pollination = "Tutte", potSuitability = "Tutte", harvestMonth = ""
} = {}) {
  return sortMatches(items.filter((item) =>
    (category === "Tutte" || item.category === category) &&
    (group === "Tutte" || plantGroupOf(item) === group) &&
    (fruitType === "Tutte" || fruitTypeOf(item) === fruitType) &&
    matchesClimate(item, minTempC) &&
    matchesTrait(item, "pollination", pollination) &&
    matchesTrait(item, "potSuitability", potSuitability) &&
    matchesHarvest(item, harvestMonth) &&
    plantSearchScore(item, query) > 0
  ), query, true);
}

export function filterInventory(items, { query = "", visibility = "Tutte", group = "Tutte" } = {}) {
  return sortMatches(items.filter((item) =>
    (visibility === "Tutte" || (visibility === "Pubblicate" && item.published === true) ||
      (visibility === "Private" && item.published !== true)) &&
    (group === "Tutte" || plantGroupOf(item) === group) &&
    plantSearchScore(item, query) > 0
  ), query, false);
}
