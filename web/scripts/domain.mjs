export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;
export function usernameValue(value) {
  return String(value ?? "").normalize("NFKC").trim().toLowerCase();
}
export function validUsername(value) {
  return USERNAME_PATTERN.test(value) && !value.includes("--") &&
    !["app","login","privacy","impostazioni","assets","images","scripts","favicon","api","admin","www"].includes(value);
}
export function cleanText(value, max = 240) {
  return String(value ?? "").trim().slice(0, max);
}
export function cleanTags(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(value => cleanText(value, 32)).filter(Boolean))].slice(0, 12);
}
export function imageUrl(value) {
  const text = cleanText(value, 500);
  if (!text) return "";
  if (/^\/images\/[a-zA-Z0-9/_-]+\.(?:avif|webp|jpe?g|png)$/i.test(text) && !text.includes("..")) return text;
  try {
    const url = new URL(text);
    if (url.protocol === "https:" && !url.username && !url.password && !url.hash && text.length <= 500) return url.href;
  } catch { /* Invalid image URLs are omitted from public output. */ }
  return "";
}
export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[char]);
}
export function makePrivatePlant(input, previous = null) {
  const name = cleanText(input.name, 90);
  if (!name) throw new Error("Il nome della pianta è obbligatorio.");
  const candidate = cleanText(input.imageUrl, 500);
  if (candidate && !imageUrl(candidate)) throw new Error("Usa un URL HTTPS oppure un percorso /images/nome.webp.");
  return {
    name,
    scientificName: cleanText(input.scientificName, 120),
    description: cleanText(input.description, 2000),
    imageUrl: imageUrl(candidate),
    tags: cleanTags(input.tags),
    published: input.published === true,
    shareScientificName: input.shareScientificName === true,
    shareDescription: input.shareDescription === true,
    shareTags: input.shareTags === true,
    shareImage: input.shareImage === true,
    createdAt: previous?.createdAt || Date.now(),
    updatedAt: Date.now()
  };
}
export function toPublicPlant(plant) {
  if (!plant.published) return null;
  const doc = { name: cleanText(plant.name, 90), updatedAt: plant.updatedAt };
  if (plant.shareScientificName && plant.scientificName) doc.scientificName = cleanText(plant.scientificName, 120);
  if (plant.shareDescription && plant.description) doc.description = cleanText(plant.description, 2000);
  if (plant.shareTags && plant.tags?.length) doc.tags = cleanTags(plant.tags);
  if (plant.shareImage && imageUrl(plant.imageUrl)) doc.imageUrl = imageUrl(plant.imageUrl);
  return doc;
}
export function filterPlants(plants, query = "", tag = "") {
  const q = String(query).trim().toLocaleLowerCase("it");
  return plants.filter(plant => {
    if (tag && !(plant.tags || []).includes(tag)) return false;
    if (!q) return true;
    return [plant.name, plant.scientificName, ...(plant.tags || [])]
      .some(part => String(part ?? "").toLocaleLowerCase("it").includes(q));
  });
}
export function allTags(plants) {
  return [...new Set(plants.flatMap(plant => Array.isArray(plant.tags) ? plant.tags : []))].sort((a,b) => a.localeCompare(b,"it"));
}
export function cleanProfile(input) {
  const displayName = cleanText(input.displayName, 80);
  if (!displayName) throw new Error("Inserisci un nome da mostrare.");
  return { displayName, about: cleanText(input.about, 600), visible: input.visible === true };
}
