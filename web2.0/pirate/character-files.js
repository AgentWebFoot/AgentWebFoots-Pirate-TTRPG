export const characterSlotPattern = /^slot[1-9]\d*$/;
const supportedVersions = new Set([1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7]);
const isRecord = value => Boolean(value) && typeof value === "object" && !Array.isArray(value);

export function nextCharacterSlot(slots) {
  const occupied = new Set(slots);
  let number = 1;
  while (occupied.has(`slot${number}`)) number += 1;
  return `slot${number}`;
}

export function withLocalCharacterSaves(action) {
  return navigator.locks ? navigator.locks.request("pirate-character-saves", action) : action();
}

export function characterSummary(slot, character, updatedAt) {
  return {
    slot,
    name: typeof character.name === "string" ? character.name : "",
    crew: typeof character.crew === "string" ? character.crew : "",
    currentLevel: character.currentLevel,
    updatedAt,
  };
}

export async function readCharacterFile(file) {
  if (file.size > 990_000) throw new Error("Choose a character file smaller than 990 KB.");
  let character;
  try {
    character = JSON.parse((await file.text()).replace(/^\uFEFF/, ""));
  } catch {
    throw new Error("Choose a valid character JSON file.");
  }
  if (!isRecord(character) || !supportedVersions.has(character.version)) {
    throw new Error("Choose a supported Pirate character export (version 1.1–1.7).");
  }
  for (const key of ["__proto__", "constructor", "prototype"]) delete character[key];
  delete character.keepLocal;
  const arrayFields = ["levels", "level1", "levelStats", "levelSkills", "activeConditions", "equippedWeapons", "inventoryWeapons", "items", "inventoryItems", "expansions"];
  if (arrayFields.some(key => character[key] != null && !Array.isArray(character[key]))
    || ["levelStats", "levelSkills", "activeConditions", "equippedWeapons", "inventoryWeapons", "items", "inventoryItems"]
      .some(key => character[key]?.some(item => !isRecord(item)))) {
    throw new Error("This file contains invalid character data.");
  }
  return character;
}

export function downloadCharacter(character) {
  const { items, timestamp, keepLocal, ...data } = character;
  if (items !== undefined) data.inventoryItems = items;
  data.version ??= 1.7;
  const name = String(data.name ?? "").trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, "");
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name || "character"}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
