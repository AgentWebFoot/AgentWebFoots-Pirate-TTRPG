export const expansionStorageKey = "pirate-homebrew-builder-v1";

export function normalizeExpansionSaves(value) {
  return Object.fromEntries(["weapon", "armor", "class", "ability"].map(key =>
    [key, Array.isArray(value?.[key]) ? value[key] : []]));
}

export function withLocalExpansionSaves(action) {
  return navigator.locks ? navigator.locks.request("pirate-expansion-saves", action) : action();
}

export function migrateLocalExpansions(request) {
  return withLocalExpansionSaves(async () => {
    const source = localStorage.getItem(expansionStorageKey);
    if (source === null) return 0;
    const value = JSON.parse(source);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("The local expansions could not be read.");
    }
    const homebrew = normalizeExpansionSaves(value);
    const count = Object.values(homebrew).reduce((sum, entries) => sum + entries.length, 0);
    if (!count) return 0;
    const response = await request("/pirate-homebrew/saves/migrate", {
      body: { homebrew },
      signal: AbortSignal.timeout(10_000),
    });
    if (response?.processed !== count || localStorage.getItem(expansionStorageKey) !== source) {
      throw new Error("The local expansions could not be cleared after saving.");
    }
    localStorage.removeItem(expansionStorageKey);
    return count;
  });
}
