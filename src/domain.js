export const categories = [
  "Tropicali da frutto",
  "Agrumi",
  "Succulente",
  "Ornamentali",
  "Aromatiche",
  "Altre"
];

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
    price: plant.price || ""
  };
}

export function validatePlant(plant) {
  if (!String(plant.name ?? "").trim()) return "Inserisci il nome della pianta.";
  if (String(plant.name).trim().length > 100) return "Il nome è troppo lungo (massimo 100 caratteri).";
  if (String(plant.description ?? "").length > 3000) return "La descrizione supera 3000 caratteri.";
  if (plant.imageUrl && !safeImageUrl(plant.imageUrl)) return "L'immagine deve avere un URL HTTPS valido.";
  return "";
}
