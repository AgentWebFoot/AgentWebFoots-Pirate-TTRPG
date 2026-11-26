import { randomBytes, randomUUID } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { resolvePirateRole } from "./accounts.js";
import { addNpcAbility, saveNpc } from "./pirate-npc.js";

const toolsDirectory = new URL("../pirate/", import.meta.url);
const rulesFile = new URL("rules.json", toolsDirectory);
const npcFile = new URL("NPCCompendium.JSON", toolsDirectory);
const result = (payload, status = 200) => ({ payload, status });
const fail = (status, message) => result({ message }, status);
const slotPattern = /^slot[1-9]\d*$/;
const isRecord = value => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const readData = async file => JSON.parse(await readFile(file, "utf8"));
const homebrewData = (data = {}) => Object.fromEntries(
  ["weapon", "armor", "class", "ability"].map(key => [key, Array.isArray(data[key]) ? data[key] : []]),
);

export async function createPirateApi(stateDirectory, accounts) {
  const file = new URL("pirate.json", stateDirectory);
  let state = { characters: [], homebrew: [], shares: [] };
  try {
    state = await readData(file);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  let pending = Promise.resolve();
  function update(change) {
    const save = pending.then(async () => {
      const next = structuredClone(state);
      const response = await change(next);
      if (response.status >= 400) return response;
      const temp = new URL(`pirate-${randomUUID()}.tmp`, stateDirectory);
      try {
        await writeFile(temp, JSON.stringify(next, null, 2) + "\n", { flag: "wx" });
        await rename(temp, file);
        state = next;
      } finally {
        await rm(temp, { force: true });
      }
      return response;
    });
    pending = save.catch(() => {});
    return save;
  }

  function saveCharacter(next, user, slot, character) {
    const now = new Date().toISOString();
    const existing = next.characters.find(item => item.user === user && item.slot === slot);
    const entry = { user, slot, character, createdAt: existing?.createdAt ?? now, updatedAt: now };
    next.characters = next.characters.filter(item => item !== existing);
    next.characters.push(entry);
    return entry;
  }

  function characterRoutes(path, method, user, body) {
    const base = "/pirate-character-sheet";
    const saves = base + "/saves";
    const mine = state.characters.filter(item => item.user === user);
    if (path === saves && method === "GET") {
      const list = mine.map(({ slot, character, createdAt, updatedAt }) =>
        ({ slot, name: character.name ?? "", createdAt, updatedAt }));
      list.sort((left, right) => Number(left.slot.slice(4)) - Number(right.slot.slice(4)));
      return result({ saves: list });
    }
    if (path.startsWith(saves + "/")) {
      const slot = path.slice(saves.length + 1);
      if (!slotPattern.test(slot)) return fail(400, "A valid save slot is required.");
      if (method === "GET") {
        const entry = mine.find(item => item.slot === slot);
        if (!entry) return fail(404, "No cloud save found for that slot.");
        const { character, createdAt, updatedAt } = entry;
        return result({ slot, character, createdAt, updatedAt });
      }
      if (method === "POST") {
        if (!isRecord(body?.character)) return fail(400, "Character save data must be an object.");
        return update(next => {
          const { updatedAt } = saveCharacter(next, user, slot, body.character);
          return result({ message: `Cloud save updated for ${slot}.`, slot, updatedAt });
        });
      }
      if (method === "DELETE") return update(next => {
        next.characters = next.characters.filter(item => item.user !== user || item.slot !== slot);
        return result({ message: `Cloud save cleared for ${slot}.`, slot });
      });
    }
    if (method === "POST" && path === base + "/share-codes/generate") {
      if (!slotPattern.test(body?.slot)) return fail(400, "A valid source slot is required.");
      return update(next => {
        const source = next.characters.find(item => item.user === user && item.slot === body.slot);
        if (!source) return fail(404, "Save that slot first before generating a share code.");
        const code = randomBytes(8).toString("hex").toUpperCase();
        next.shares.push({ code, character: source.character });
        return result({ message: `Share code generated for ${body.slot}.`, code, slot: body.slot });
      });
    }
    if (method === "POST" && path === base + "/share-codes/redeem") {
      const code = String(body?.code ?? "").trim().toUpperCase();
      if (!slotPattern.test(body?.slot) || !code) return fail(400, "A share code and target slot are required.");
      return update(next => {
        const share = next.shares.find(item => item.code === code);
        if (!share) return fail(404, "That share code was not found.");
        saveCharacter(next, user, body.slot, share.character);
        return result({ message: `Share code imported into ${body.slot}.`, slot: body.slot, name: share.character.name ?? "" });
      });
    }
    return fail(404, "Pirate route not found.");
  }

  return async function pirateApi(path, method, active, body) {
    const role = active.pirateRole;
    const access = {
      role,
      canUseCloudSharing: role !== "viewer",
      canManageRoles: ["admin", "writer", "owner"].includes(role),
    };
    if (method === "GET" && path === "/pirate-system/access") return result({ access });
    if (method === "GET" && path === "/pirate-system/rules") return result(await readData(rulesFile));
    if (method === "GET" && path === "/pirate-system/npc-compendium/data") {
      return result(state.npcLibrary ?? await readData(npcFile));
    }
    if (method === "POST" && path.startsWith("/pirate-system/roles/")) {
      if (!access.canManageRoles) return fail(403, "This account cannot manage Pirate roles.");
      const patron = account => ({ id: account.key, username: account.username, pirateRole: resolvePirateRole(account) });
      if (path.endsWith("/list")) return result({ patrons: accounts.list().map(patron) });
      if (path.endsWith("/set-role")) {
        const items = await accounts.assignPirate(body?.targetUserId, body?.role, role);
        const updated = patron(items.find(item => item.key === body.targetUserId));
        return result({ patron: updated, message: `${updated.username} now has Pirate ${updated.pirateRole} access.` });
      }
    }
    if (method === "POST" && ["/pirate-system/npc-compendium/add-ability", "/pirate-system/npc-compendium/save-npc"].includes(path)) {
      if (!["writer", "owner"].includes(role)) return fail(403, "Only Pirate Writers and Owners can save to the NPC library.");
      return update(async next => {
        next.npcLibrary ??= await readData(npcFile);
        const updated = path.endsWith("/save-npc") ? saveNpc(next.npcLibrary, body) : addNpcAbility(next.npcLibrary, body);
        return updated ? result(updated) : fail(409, "An NPC ability with that name already exists.");
      });
    }
    if (path.startsWith("/pirate-character-sheet/") || path === "/pirate-homebrew/saves") {
      if (!access.canUseCloudSharing) return fail(403, "This account cannot use cloud sharing.");
      if (path.startsWith("/pirate-character-sheet/")) return characterRoutes(path, method, active.key, body);
      const user = active.key;
      if (method === "GET") {
        const existing = state.homebrew.find(item => item.user === user);
        const { homebrew = homebrewData(), createdAt = null, updatedAt = null } = existing ?? {};
        return result({ homebrew, createdAt, updatedAt });
      }
      if (method === "POST") {
        if (!isRecord(body?.homebrew)) return fail(400, "Homebrew save data must be an object.");
        return update(next => {
          const homebrew = homebrewData(body.homebrew);
          const updatedAt = new Date().toISOString();
          const existing = next.homebrew.find(item => item.user === user);
          next.homebrew = next.homebrew.filter(item => item !== existing);
          next.homebrew.push({ user, homebrew, createdAt: existing?.createdAt ?? updatedAt, updatedAt });
          return result({ message: "Cloud homebrew saved.", homebrew, updatedAt });
        });
      }
    }
    return fail(404, "Pirate route not found.");
  };
}
