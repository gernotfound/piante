export function filterCatalog(items, { query = "", category = "Tutte" } = {}) {
  const search = String(query).trim().toLocaleLowerCase("it");
  return items.filter((item) =>
    (category === "Tutte" || item.category === category) &&
    [item.name, item.scientificName, item.variety, item.category]
      .some((value) => String(value ?? "").toLocaleLowerCase("it").includes(search))
  ).sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? ""), "it"));
}

export function filterInventory(items, { query = "", visibility = "Tutte" } = {}) {
  const search = String(query).trim().toLocaleLowerCase("it");
  return items.filter((item) => {
    const matchesQuery = [item.name, item.scientificName, item.variety, item.category]
      .some((value) => String(value ?? "").toLocaleLowerCase("it").includes(search));
    const matchesVisibility = visibility === "Tutte" ||
      (visibility === "Pubblicate" && item.published === true) ||
      (visibility === "Private" && item.published !== true);
    return matchesQuery && matchesVisibility;
  }).sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? ""), "it"));
}
