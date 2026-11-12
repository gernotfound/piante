import { groupForCategory, plantGroups } from "./domain.js";

export const lifeStages = [
  "Seme", "In germinazione", "Piantina", "In crescita",
  "In fioritura", "In fruttificazione", "Dormiente", "Morta", "Ceduta"
];
export const journalKinds = ["Osservazione", "Irrigazione", "Concimazione", "Rinvaso",
  "Trattamento", "Potatura", "Fioritura", "Raccolta", "Problema", "Altro"];

// Questi campi sono condivisibili e quindi pubblici; provenienza, note personali,
// posizione e foto dell'esemplare rimangono soltanto su privatePlants.
export const speciesFields = [
  "scientificName", "category", "fruitType", "growthHabit", "searchAliases",
  "origin", "light", "water", "description", "pollination", "potSuitability",
  "harvestMonths", "minColdC", "coldSource", "coldNotes"
];
export const cultivarFields = [
  "fruitNotes", "minColdC", "coldSource", "coldNotes", "pollination", "harvestMonths"
];

export function normalizeTaxonName(value) {
  return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .trim().replace(/\s+/g, " ").toLocaleLowerCase("it");
}

export function taxonId(kind, name, speciesId = "") {
  const normalized = normalizeTaxonName(name);
  if (!normalized || !["species", "cultivar"].includes(kind)) return "";
  const hex = Array.from(new TextEncoder().encode(normalized), byte =>
    byte.toString(16).padStart(2, "0")).join("");
  if (kind === "species") return "s_" + hex;
  if (!/^s_[a-f0-9]+$/.test(speciesId)) return "";
  return "c_" + speciesId.slice(2) + "_" + hex;
}

export function profileByName(profiles, kind, name, parentId = "") {
  const normalized = normalizeTaxonName(name);
  if (!normalized) return null;
  return profiles.find(profile => profile.kind === kind &&
    (kind !== "cultivar" || profile.parentId === parentId) &&
    (normalizeTaxonName(profile.name) === normalized ||
      (Array.isArray(profile.aliases) && profile.aliases.includes(normalized)))) || null;
}

export function profileForPlant(plant, profiles) {
  const species = plant.speciesId
    ? profiles.find(item => item.id === plant.speciesId && item.kind === "species")
    : profileByName(profiles, "species", plant.name);
  const cultivar = species && plant.cultivarId
    ? profiles.find(item => item.id === plant.cultivarId && item.kind === "cultivar" &&
      item.parentId === species.id)
    : null;
  return { species: species || null, cultivar: cultivar || null };
}

export function sharedProfileDraft(kind, name, parentId, data) {
  const fields = kind === "species" ? speciesFields : cultivarFields;
  const result = { kind, name: String(name || "").trim() };
  if (kind === "cultivar") result.parentId = parentId;
  for (const key of fields) {
    if (key === "harvestMonths") result[key] = Array.isArray(data[key]) ? data[key] : [];
    else if (key === "minColdC") result[key] =
      typeof data[key] === "number" && Number.isFinite(data[key]) ? data[key] : null;
    else result[key] = String(data[key] || "").trim();
  }
  return result;
}

export function resolvePlantProfiles(plant, profiles) {
  const { species, cultivar } = profileForPlant(plant, profiles);
  if (!species) return plant;
  const effective = { ...plant };
  for (const key of speciesFields) if (Object.hasOwn(species, key)) effective[key] = species[key];
  effective.name = species.name;
  effective.plantGroup = groupForCategory(effective.category);
  if (plant.plantGroup && plant.plantGroup !== groupForCategory(plant.category) &&
      !plant.speciesId && plantGroups.includes(plant.plantGroup)) {
    effective.plantGroup = plant.plantGroup;
  }
  if (cultivar) {
    for (const key of cultivarFields) {
      const value = cultivar[key];
      if (key === "minColdC" && typeof value === "number") effective[key] = value;
      else if (key === "harvestMonths" && Array.isArray(value) && value.length) effective[key] = value;
      else if (!["minColdC", "harvestMonths"].includes(key) && value) effective[key] = value;
    }
    effective.variety = cultivar.name;
  }
  // Nessun campo di origine/provenienza privata, stato o diario viene acquisito dai profili.
  return effective;
}

export function preparePlantDuplicate(source) {
  if (!source) return {};
  const { id, __snapshotVersion, createdAt, updatedAt, ...plant } = source;
  return {
    ...plant, published: false, sourceDetails: "", sownOn: "",
    plantLocation: "", specimenSex: "", internalNotes: "", imageUrl: "",
    availability: "", price: "", lifeStage: "", lotId: "", lotName: "",
    seedSourceCultivar: ""
  };
}

export function changedPlantFields(previous, next) {
  const fields = ["name", "scientificName", "category", "variety", "plantGroup",
    "fruitType", "growthHabit", "description", "sourceDetails", "plantLocation",
    "sownOn", "seedSourceCultivar", "lotId", "lifeStage", "specimenSex",
    "published", "light", "water", "price", "availability", "imageUrl",
    "internalNotes", "pollination", "potSuitability", "harvestMonths", "minColdC",
    "coldSource", "coldNotes", "speciesId", "cultivarId"];
  return fields.filter(key => JSON.stringify(previous?.[key] ?? null) !==
    JSON.stringify(next[key] ?? null));
}
