export const categories = [
  "Piante da frutto",
  "Orto e tuberi",
  "Tropicali da frutto",
  "Agrumi",
  "Succulente",
  "Ornamentali",
  "Aromatiche",
  "Altre"
];

export const plantGroups = ["Piante da frutto", "Orto e tuberi", "Altre piante"];
export const fruitTypes = [
  "Agrumi", "Tropicali e subtropicali", "Mediterranee", "Temperate",
  "Piccoli frutti", "Altre fruttifere"
];
export const growthHabits = ["Albero", "Arbusto", "Rampicante", "Erbacea", "Succulenta", "Altra"];
export const pollinationTypes = ["Autofertile", "Richiede impollinazione", "Variabile"];
export const potSuitabilityTypes = ["Adatta", "Con accorgimenti", "Non consigliata"];
export const monthNames = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];

export function validHarvestMonths(months) {
  return Array.isArray(months) && months.length <= 12 &&
    months.every((month) => Number.isInteger(month) && month >= 1 && month <= 12);
}

export function normalizedHarvestMonths(months) {
  return Array.isArray(months) && validHarvestMonths(months)
    ? [...new Set(months)].sort((a, b) => a - b) : [];
}

export function plantGroupOf(plant) {
  if (plantGroups.includes(plant.plantGroup)) return plant.plantGroup;
  if (["Piante da frutto", "Agrumi", "Tropicali da frutto"].includes(plant.category)) return "Piante da frutto";
  if (plant.category === "Orto e tuberi") return "Orto e tuberi";
  return "Altre piante";
}

export function fruitTypeOf(plant) {
  if (plantGroupOf(plant) !== "Piante da frutto") return "";
  if (fruitTypes.includes(plant.fruitType)) return plant.fruitType;
  if (plant.category === "Agrumi") return "Agrumi";
  if (plant.category === "Tropicali da frutto") return "Tropicali e subtropicali";
  return "Altre fruttifere";
}

// Un dato di rusticità mancante non equivale a 0 °C.
export function coldMinimumOf(plant) {
  return typeof plant.minColdC === "number" && Number.isFinite(plant.minColdC)
    ? plant.minColdC : null;
}

export function normalizeUsername(input) {
  return String(input ?? "").trim().toLowerCase();
}

export function validUsername(input) {
  return /^[a-z0-9._-]{3,32}$/.test(normalizeUsername(input));
}

export function safeImageUrl(input) {
  try {
    const url = new URL(String(input ?? "").trim());
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

export function displayText(value, fallback = "—") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

export function catalogProjection(plant) {
  return {
    name: plant.name,
    scientificName: plant.scientificName || "",
    category: plant.category || "Altre",
    variety: plant.variety || "",
    description: plant.description || "",
    light: plant.light || "",
    water: plant.water || "",
    origin: plant.origin || "",
    imageUrl: safeImageUrl(plant.imageUrl),
    availability: plant.availability || "",
    price: plant.price || "",
    plantGroup: plantGroupOf(plant),
    fruitType: fruitTypeOf(plant),
    growthHabit: growthHabits.includes(plant.growthHabit) ? plant.growthHabit : "",
    searchAliases: String(plant.searchAliases || "").trim(),
    coldSource: safeImageUrl(plant.coldSource),
    coldNotes: String(plant.coldNotes || "").trim(),
    pollination: pollinationTypes.includes(plant.pollination) ? plant.pollination : "",
    potSuitability: potSuitabilityTypes.includes(plant.potSuitability) ? plant.potSuitability : "",
    harvestMonths: normalizedHarvestMonths(plant.harvestMonths),
    ...(coldMinimumOf(plant) !== null ? { minColdC: coldMinimumOf(plant) } : {})
  };
}

export function validatePlant(plant) {
  if (!String(plant.name ?? "").trim()) return "Inserisci il nome della pianta.";
  if (String(plant.name).trim().length > 100) return "Il nome è troppo lungo (massimo 100 caratteri).";
  if (String(plant.description ?? "").length > 3000) return "La descrizione supera 3000 caratteri.";
  if (plant.imageUrl && !safeImageUrl(plant.imageUrl)) return "L'immagine deve avere un URL HTTPS valido.";
  if (plant.coldSource && !safeImageUrl(plant.coldSource)) return "La fonte climatica deve essere un URL HTTPS valido.";
  if (plant.plantGroup && !plantGroups.includes(plant.plantGroup)) return "Gruppo di pianta non riconosciuto.";
  if (plant.fruitType && !fruitTypes.includes(plant.fruitType)) return "Tipologia di frutto non riconosciuta.";
  if (plant.growthHabit && !growthHabits.includes(plant.growthHabit)) return "Forma di crescita non riconosciuta.";
  if (String(plant.searchAliases || "").length > 250) return "I nomi alternativi superano 250 caratteri.";
  if (String(plant.coldNotes || "").length > 250) return "Le note sul freddo superano 250 caratteri.";
  if (plant.pollination && !pollinationTypes.includes(plant.pollination)) return "Tipo di impollinazione non riconosciuto.";
  if (plant.potSuitability && !potSuitabilityTypes.includes(plant.potSuitability)) return "Valutazione della coltivazione in vaso non riconosciuta.";
  if (plant.harvestMonths !== undefined && !validHarvestMonths(plant.harvestMonths)) {
    return "Seleziona solo mesi validi per il periodo di raccolta.";
  }
  if (plant.minColdC !== null && plant.minColdC !== undefined && plant.minColdC !== "") {
    if (typeof plant.minColdC !== "number" || !Number.isFinite(plant.minColdC) ||
        plant.minColdC < -40 || plant.minColdC > 25) {
      return "La temperatura minima deve essere un numero tra -40 e +25 °C.";
    }
  }
  return "";
}
