import { readFile, stat } from "node:fs/promises";
import { createCompendium } from "compendium";

const sources = {
  classes: new URL("../../webCharacterSheet/classes.JSON", import.meta.url),
  weapons: new URL("../../webCharacterSheet/weapons.JSON", import.meta.url),
  conditions: new URL("../../webCharacterSheet/conditions.JSON", import.meta.url),
};

const slug = name => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const tabs = [
  {
    id: "classes", title: "Classes", type: "classes", collectionId: "classes",
    classPageLabels: { groupLabels: { general: "General", fighters: "Fighters", artisans: "Artisans", scholars: "Scholars" } },
    classPageStructure: {
      groups: [
        { key: "general", classes: ["General"] },
        { key: "fighters", classes: ["Basher", "Brute", "Cleaver", "Marksman", "Martial Artist", "Sharpshooter", "Spearman", "Swordsman"] },
        { key: "artisans", classes: ["Alchemist", "Blacksmith", "Carpenter", "Chef", "Farmer", "Fisherman", "Grenadier", "Trapper"] },
        { key: "scholars", classes: ["Clergyman", "Doctor", "Ecologist", "Musician", "Navigator", "Noble"] },
      ],
    },
  },
  { id: "weapons", title: "Weapons", type: "table", collectionId: "weapons" },
  {
    id: "conditions", title: "Conditions", type: "grid", collectionId: "conditions",
    fields: [{ key: "hasStack", label: "Stacks" }, { key: "hasSource", label: "Tracks source" }],
  },
];

export async function loadSeed() {
  const collections = await Promise.all(Object.entries(sources).map(async ([id, file]) => {
    const input = JSON.parse((await readFile(file, "utf8")).replace(/^\uFEFF/, ""));
    const entries = input.map(entry => ({
      ...entry,
      id: slug([entry.class, entry.name].filter(Boolean).join(" ")),
    }));
    return { id, entries };
  }));
  const data = { id: "pirate-ttrpg", tabs: structuredClone(tabs), collections };
  createCompendium(data);
  return data;
}

export async function getSeedVersion() {
  const stats = await Promise.all(Object.values(sources).map(file => stat(file)));
  return stats.map(file => `${file.mtimeMs}:${file.size}`).join("/");
}
