import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { characterSlotPattern as slotPattern, characterSummary, nextCharacterSlot } from "../pirate/character-files.js";
import { normalizeExpansionSaves } from "../pirate/expansion-saves.js";
import { resolvePirateRole } from "./accounts.js";
import { addNpcAbility, saveNpc } from "./pirate-npc.js";

const toolsDirectory = new URL("../pirate/", import.meta.url);
const rulesFile = new URL("rules.json", toolsDirectory);
const npcFile = new URL("NPCCompendium.JSON", toolsDirectory);
const result = (payload, status = 200) => ({ payload, status });
const fail = (status, message) => result({ message }, status);
const isRecord = value => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const characterEtag = entry => `"${entry.revision ?? entry.createdAt + ":" + entry.updatedAt}"`;
const readData = async file => JSON.parse(await readFile(file, "utf8"));
const expansionEtag = entry => `"${entry ? entry.revision ?? entry.updatedAt : "empty"}"`;

function mergeLocalExpansions(current, incoming) {
  for (const [type, entries] of Object.entries(incoming)) {
    const saved = current[type];
    const names = new Set(saved.map(entry => entry?.values?.name));
    const ids = new Set(saved.map(entry => entry?.id));
    for (const entry of entries) {
      if (saved.some(item => isDeepStrictEqual(item?.values, entry.values))) continue;
      const original = entry.values.name;
      let name = original;
      for (let index = 1; names.has(name); index += 1) {
        name = `${original} (Local${index === 1 ? "" : ` ${index}`})`;
      }
      const id = entry.id && !ids.has(entry.id) ? entry.id : randomUUID();
      saved.push({ ...entry, id, values: { ...entry.values, name } });
      ids.add(id);
      names.add(name);
    }
  }
  return current;
}

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

  function saveCharacter(next, user, slot, character, localImportId) {
    const now = new Date().toISOString();
    const existing = next.characters.find(item => item.user === user && item.slot === slot);
    const entry = {
      user, slot, character, createdAt: existing?.createdAt ?? now, updatedAt: now,
      revision: randomUUID(), localImportId: localImportId ?? existing?.localImportId,
    };
    next.characters = next.characters.filter(item => item !== existing);
    next.characters.push(entry);
    return entry;
  }

  function linkedShare(data, entry) {
    return entry?.shareCode ? data.shares.find(share => share.code === entry.shareCode) : undefined;
  }

  function detachShare(next, share) {
    for (const entry of next.characters) {
      if (entry.shareCode !== share.code) continue;
      entry.character = share.character;
      entry.updatedAt = share.updatedAt;
      entry.revision = share.revision;
      delete entry.shareCode;
    }
    next.shares = next.shares.filter(item => item !== share);
  }

  function characterRoutes(path, method, user, body, { ifMatch, endSharing }) {
    const base = "/pirate-character-sheet";
    const saves = base + "/saves";
    const mine = state.characters.filter(item => item.user === user);
    if (path === saves && method === "GET") {
      const list = mine.map(entry => {
        const share = linkedShare(state, entry);
        const { character, updatedAt } = share ?? entry;
        return {
          ...characterSummary(entry.slot, character, updatedAt),
          createdAt: entry.createdAt,
          shared: Boolean(share),
          shareOwner: share?.ownerUser === user,
        };
      });
      list.sort((left, right) => Number(left.slot.slice(4)) - Number(right.slot.slice(4)));
      return result({ saves: list });
    }
    if (path === saves && method === "POST") {
      if (!isRecord(body?.character)) return fail(400, "Character save data must be an object.");
      const { localImportId } = body;
      if (localImportId !== undefined && (typeof localImportId !== "string" || !/^[a-f0-9]{64}$/.test(localImportId))) {
        return fail(400, "Invalid local save identifier.");
      }
      return update(next => {
        const saves = next.characters.filter(item => item.user === user);
        const imported = localImportId ? saves.find(item => item.localImportId === localImportId) : undefined;
        if (imported) {
          const save = linkedShare(next, imported) ?? imported;
          return result({ slot: imported.slot, updatedAt: save.updatedAt, etag: characterEtag(save) });
        }
        const slot = nextCharacterSlot(saves.map(item => item.slot));
        const save = saveCharacter(next, user, slot, body.character, localImportId);
        return result({ slot, updatedAt: save.updatedAt, etag: characterEtag(save) }, 201);
      });
    }
    if (path.startsWith(saves + "/")) {
      const slot = path.slice(saves.length + 1);
      if (!slotPattern.test(slot)) return fail(400, "A valid save slot is required.");
      if (method === "GET") {
        const entry = mine.find(item => item.slot === slot);
        if (!entry) return fail(404, "No cloud save found for that slot.");
        const share = linkedShare(state, entry);
        const { character, updatedAt } = share ?? entry;
        const etag = characterEtag(share ?? entry);
        return { ...result({ slot, character, createdAt: entry.createdAt, updatedAt, etag, shared: Boolean(share) }), etag };
      }
      if (method === "POST") {
        if (!isRecord(body?.character)) return fail(400, "Character save data must be an object.");
        return update(next => {
          const entry = next.characters.find(item => item.user === user && item.slot === slot);
          const share = linkedShare(next, entry);
          if (ifMatch !== undefined && (!entry || ifMatch !== characterEtag(share ?? entry))) {
            return fail(412, "The cloud sheet changed. Review the latest save before saving again.");
          }
          let saved = share;
          if (saved) {
            saved.character = body.character;
            saved.updatedAt = new Date().toISOString();
            saved.revision = randomUUID();
          } else {
            saved = saveCharacter(next, user, slot, body.character);
          }
          return result({
            message: `Cloud save updated for ${slot}.`, slot,
            updatedAt: saved.updatedAt, etag: characterEtag(saved), shared: Boolean(share),
          });
        });
      }
      if (method === "DELETE") return update(next => {
        const entry = next.characters.find(item => item.user === user && item.slot === slot);
        const share = linkedShare(next, entry);
        if (ifMatch !== undefined) {
          if (!entry || ifMatch !== characterEtag(share ?? entry)) return fail(412, "The cloud save changed during the move.");
        }
        if (share?.ownerUser === user) {
          if (!endSharing) return fail(409, "This character is shared. Refresh Cloud Saves and confirm ending the share.");
          detachShare(next, share);
        }
        next.characters = next.characters.filter(item => item.user !== user || item.slot !== slot);
        return result({ message: `Cloud save cleared for ${slot}.`, slot });
      });
    }
    if (method === "POST" && path === base + "/share-codes/generate") {
      if (!slotPattern.test(body?.slot)) return fail(400, "A valid source slot is required.");
      return update(next => {
        const source = next.characters.find(item => item.user === user && item.slot === body.slot);
        if (!source) return fail(404, "Save that slot first before generating a share code.");
        const share = linkedShare(next, source);
        if (share) return result({ code: share.code, slot: source.slot });
        const code = randomBytes(8).toString("hex").toUpperCase();
        source.shareCode = code;
        next.shares.push({
          code, ownerUser: user, character: source.character,
          updatedAt: source.updatedAt, revision: source.revision ?? source.createdAt + ":" + source.updatedAt,
        });
        return result({ message: `Share code generated for ${body.slot}.`, code, slot: body.slot });
      });
    }
    if (method === "POST" && path === base + "/share-codes/redeem") {
      const code = String(body?.code ?? "").trim().toUpperCase();
      if (!code) return fail(400, "A share code is required.");
      if (body.slot !== undefined && !slotPattern.test(body.slot)) return fail(400, "A valid target slot is required.");
      return update(next => {
        const share = next.shares.find(item => item.code === code);
        if (!share) return fail(404, "That share code was not found.");
        const slots = next.characters.filter(item => item.user === user);
        const existing = share.ownerUser === undefined ? undefined : slots.find(item => item.shareCode === code);
        const name = typeof share.character.name === "string" ? share.character.name : "";
        if (existing) return result({ message: "Shared character is already in Cloud Saves.", slot: existing.slot, name });
        const slot = body.slot ?? nextCharacterSlot(slots.map(item => item.slot));
        if (slots.some(item => item.slot === slot && item.shareCode)) {
          return fail(409, "Choose a save that is not linked to another shared sheet.");
        }
        const entry = saveCharacter(next, user, slot, share.character);
        if (share.ownerUser !== undefined) entry.shareCode = code;
        const message = body.slot === undefined ? "Shared character imported." : `Share code imported into ${slot}.`;
        return result({ message, slot, name });
      });
    }
    if (method === "POST" && path === base + "/share-codes/unshare") {
      if (!slotPattern.test(body?.slot)) return fail(400, "A valid source slot is required.");
      return update(next => {
        const entry = next.characters.find(item => item.user === user && item.slot === body.slot);
        const share = linkedShare(next, entry);
        if (!share) return fail(404, "That character is not shared.");
        if (share.ownerUser !== user) return fail(403, "Only the original owner can unshare this character.");
        detachShare(next, share);
        return result({ message: "Sharing ended. Each participant kept a cloud copy." });
      });
    }
    return fail(404, "Pirate route not found.");
  }

  return async function pirateApi(path, method, active, body, options = {}) {
    const role = active.pirateRole;
    const access = {
      role,
      canUseCloudSharing: active.canUseCloudSharing,
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
    if (path.startsWith("/pirate-character-sheet/") || ["/pirate-homebrew/saves", "/pirate-homebrew/saves/migrate"].includes(path)) {
      if (!access.canUseCloudSharing) return fail(403, "This account cannot use cloud sharing.");
      if (path.startsWith("/pirate-character-sheet/")) return characterRoutes(path, method, active.key, body, options);
      const user = active.key;
      if (path.endsWith("/migrate")) {
        if (method !== "POST") return fail(405, "Use POST to migrate expansions.");
        if (!isRecord(body?.homebrew)) return fail(400, "Expansion save data must be an object.");
        const incoming = normalizeExpansionSaves(body.homebrew);
        const entries = Object.values(incoming).flat();
        if (entries.some(entry => !isRecord(entry?.values) || typeof entry.values.name !== "string" || !entry.values.name.trim())) {
          return fail(400, "A local expansion has invalid data or is missing a name.");
        }
        const receipt = createHash("sha256").update(JSON.stringify(incoming)).digest("hex");
        return update(next => {
          const existing = next.homebrew.find(item => item.user === user);
          const receipts = existing?.localImportReceipts ?? [];
          if (receipts.includes(receipt)) return result({ processed: entries.length });
          const updatedAt = new Date().toISOString();
          const homebrew = mergeLocalExpansions(normalizeExpansionSaves(existing?.homebrew), incoming);
          next.homebrew = next.homebrew.filter(item => item !== existing);
          next.homebrew.push({
            user, homebrew, createdAt: existing?.createdAt ?? updatedAt, updatedAt,
            revision: randomUUID(), localImportReceipts: [...receipts, receipt],
          });
          return result({ processed: entries.length });
        });
      }
      if (method === "GET") {
        const existing = state.homebrew.find(item => item.user === user);
        const { homebrew = normalizeExpansionSaves(), createdAt = null, updatedAt = null } = existing ?? {};
        return result({ homebrew, createdAt, updatedAt, etag: expansionEtag(existing) });
      }
      if (method === "POST") {
        if (!isRecord(body?.homebrew)) return fail(400, "Homebrew save data must be an object.");
        return update(next => {
          const homebrew = normalizeExpansionSaves(body.homebrew);
          const updatedAt = new Date().toISOString();
          const existing = next.homebrew.find(item => item.user === user);
          if (options.ifMatch !== undefined && options.ifMatch !== expansionEtag(existing)) {
            return fail(412, "Cloud expansions changed. Reload Expansions before saving again.");
          }
          const entry = { ...existing, user, homebrew, createdAt: existing?.createdAt ?? updatedAt, updatedAt, revision: randomUUID() };
          next.homebrew = next.homebrew.filter(item => item !== existing);
          next.homebrew.push(entry);
          return result({ message: "Cloud homebrew saved.", homebrew, updatedAt, etag: expansionEtag(entry) });
        });
      }
    }
    return fail(404, "Pirate route not found.");
  };
}
