import {
  characterSlotPattern, characterSummary, downloadCharacter, nextCharacterSlot, readCharacterFile,
  withLocalCharacterSaves,
} from "/games/PirateSystem/character-files.js";

const savesPath = "/pirate-character-sheet/saves";
const sharePath = "/pirate-character-sheet/share-codes";
const localPrefix = "characterSheet_";
const localImportBrowserKey = "pirate-ttrpg:local-character-browser";
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

function localSlots() {
  return Object.keys(localStorage)
    .filter(key => key.startsWith(localPrefix))
    .map(key => key.slice(localPrefix.length))
    .filter(slot => characterSlotPattern.test(slot))
    .sort((left, right) => Number(left.slice(4)) - Number(right.slice(4)));
}

function parseLocalSave(saved) {
  const character = JSON.parse(saved);
  if (!character || typeof character !== "object" || Array.isArray(character)) {
    throw new Error("This character save is unavailable.");
  }
  return character;
}

const readLocal = slot => parseLocalSave(localStorage.getItem(localPrefix + slot));

function listLocal() {
  return localSlots().flatMap(slot => {
    try {
      const character = readLocal(slot);
      return [characterSummary(slot, character, character.timestamp)];
    } catch {
      return [];
    }
  });
}

function addLocal(character, keepLocal = false) {
  return withLocalCharacterSaves(() => {
    const slot = nextCharacterSlot(localSlots());
    localStorage.setItem(localPrefix + slot, JSON.stringify({ ...character, timestamp: Date.now(), keepLocal: keepLocal || undefined }));
    return { slot };
  });
}

async function localImportId(slot, source) {
  let browserId = localStorage.getItem(localImportBrowserKey);
  if (!browserId) {
    browserId = crypto.randomUUID();
    localStorage.setItem(localImportBrowserKey, browserId);
  }
  const data = new TextEncoder().encode(JSON.stringify([browserId, slot, source]));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export function migrateLocalCharacters(request) {
  return withLocalCharacterSaves(async () => {
    const moved = new Map();
    let remaining = 0;
    for (const slot of localSlots()) {
      try {
        const key = localPrefix + slot;
        const source = localStorage.getItem(key);
        if (source === null) continue;
        const { keepLocal, ...character } = parseLocalSave(source);
        if (keepLocal === true) continue;
        const imported = await request(savesPath, {
          body: { character, localImportId: await localImportId(slot, source) },
          signal: AbortSignal.timeout(10_000),
        });
        if (!characterSlotPattern.test(imported?.slot)) throw new Error("The upload was not confirmed.");
        if (localStorage.getItem(key) !== source) {
          remaining += 1;
          continue;
        }
        localStorage.removeItem(key);
        moved.set(slot, { slot: imported.slot, etag: imported.etag });
      } catch {
        remaining += 1;
      }
    }
    return { moved, remaining };
  });
}

export function characterEditorUrl(slot, local = false) {
  const params = new URLSearchParams({ slot });
  if (local) params.set("storage", "local");
  return `/projects/PirateCharacterSheet?${params}`;
}

export function mountCharacterLibrary(container, { cloud, request }) {
  container.append(document.querySelector("#character-library").content.cloneNode(true));
  const library = container.querySelector(".character-library");
  const cloudSaves = library.querySelector("[data-cloud]");
  const localSaves = library.querySelector("[data-local]");
  const status = library.querySelector(".character-status");
  const error = library.querySelector(".character-error");
  const refresh = library.querySelector("[data-refresh]");
  const importButton = library.querySelector("[data-import]");
  const fileInput = library.querySelector("input");
  const create = library.querySelector("[data-new]");
  const dialog = library.querySelector("[data-confirm-character-action]");
  const insertShare = library.querySelector("[data-insert-share]");
  const sharing = library.querySelector("[data-sharing-dialog]");
  const sharingStatus = sharing.querySelector(".character-status");
  const sharingError = sharing.querySelector(".character-error");
  const generatedCode = sharing.querySelector('input[type="text"]');
  const shareLink = sharing.querySelector('input[type="url"]');
  const copy = sharing.querySelector("[data-copy-code]");
  const copyLink = sharing.querySelector("[data-copy-link]");
  const redeemDialog = library.querySelector("[data-redeem-dialog]");
  const redeemStatus = redeemDialog.querySelector(".character-status");
  const redeemError = redeemDialog.querySelector(".character-error");
  const redeemForm = redeemDialog.querySelector("[data-import-share]");
  const incomingCode = redeemForm.querySelector("input");
  const redeem = redeemForm.querySelector("button");
  const addCloud = character => request(savesPath, { body: { character } });
  const add = cloud ? addCloud : addLocal;
  let busy = false;
  let confirmedAction;
  refresh.hidden = !cloud;
  cloudSaves.hidden = !cloud;
  insertShare.hidden = !cloud;

  async function run(action, message = status, problem = error) {
    if (busy) return;
    busy = true;
    library.setAttribute("aria-busy", "true");
    message.textContent = problem.textContent = "";
    try {
      message.textContent = await action() ?? "";
    } catch (failure) {
      problem.textContent = failure.message;
    } finally {
      busy = false;
      library.removeAttribute("aria-busy");
    }
  }

  function confirmAction(title, message, label, action) {
    if (busy) return;
    confirmedAction = action;
    dialog.returnValue = "";
    dialog.querySelector("h2").textContent = title;
    dialog.querySelector("p").textContent = message;
    dialog.querySelector('[value="confirm"]').textContent = label;
    dialog.showModal();
  }

  async function moveCharacter(slot, name, fromCloud, endSharing) {
    let incomplete;
    if (fromCloud) {
      const path = `${savesPath}/${slot}`;
      const { character, etag } = await request(path);
      if (!etag) throw new Error("Could not verify the cloud save before moving it.");
      await addLocal(character, true);
      try {
        const headers = { "If-Match": etag };
        if (endSharing) headers["X-End-Pirate-Sharing"] = "true";
        await request(path, { method: "DELETE", headers });
      } catch (failure) {
        incomplete = `Saved ${name} locally. Could not remove the cloud save. ${failure.message}`;
      }
    } else {
      const key = localPrefix + slot;
      const source = localStorage.getItem(key);
      const { keepLocal, ...character } = parseLocalSave(source);
      await addCloud(character);
      try {
        const removed = await withLocalCharacterSaves(() => {
          if (localStorage.getItem(key) !== source) return false;
          localStorage.removeItem(key);
          return true;
        });
        if (!removed) incomplete = `Saved ${name} to the cloud. The local save changed during the move.`;
      } catch {
        incomplete = `Saved ${name} to the cloud. Could not remove the local save.`;
      }
    }
    const message = `Moved ${name} to ${fromCloud ? "Local Saves" : "Cloud Saves"}.`;
    await render(false);
    try {
      await render(true);
    } catch {
      if (!incomplete) incomplete = `${message} Could not refresh Cloud Saves.`;
    }
    if (incomplete) throw new Error(incomplete);
    create.focus();
    return message;
  }

  async function render(fromCloud) {
    const characters = fromCloud ? (await request(savesPath)).saves : listLocal();
    if (!library.isConnected) return;
    const section = fromCloud ? cloudSaves : localSaves;
    const grid = section.querySelector(".character-grid");
    section.querySelector(".character-empty").hidden = characters.length !== 0;
    grid.replaceChildren();
    for (const character of characters) {
      const { slot } = character;
      const name = character.name.trim() || "Untitled Character";
      const card = document.createElement("li");
      const heading = document.createElement("h3");
      heading.textContent = name;
      if (character.shared) {
        const chain = document.createElement("span");
        chain.className = "character-shared-icon";
        chain.textContent = "🔗";
        chain.title = "Shared character";
        chain.setAttribute("role", "img");
        chain.setAttribute("aria-label", "Shared character");
        heading.append(chain);
      }
      const detail = document.createElement("p");
      const updated = character.updatedAt ? new Date(character.updatedAt) : null;
      detail.textContent = [
        Number.isInteger(character.currentLevel) ? `Level ${character.currentLevel}` : "",
        character.crew.trim(),
        updated && Number.isFinite(updated.getTime()) ? `Saved ${dateFormat.format(updated)}` : "",
      ].filter(Boolean).join(" · ");
      const actions = document.createElement("div");
      actions.className = "character-actions";
      const edit = document.createElement("a");
      edit.textContent = "Edit";
      edit.href = characterEditorUrl(slot, !fromCloud);
      edit.setAttribute("aria-label", `Edit ${name}`);
      const exportButton = document.createElement("button");
      exportButton.textContent = "Export";
      exportButton.setAttribute("aria-label", `Export ${name}`);
      exportButton.addEventListener("click", () => run(async () => {
        const data = fromCloud ? (await request(`${savesPath}/${slot}`)).character : readLocal(slot);
        if (library.isConnected) downloadCharacter(data);
      }));
      const remove = document.createElement("button");
      remove.className = "character-delete";
      remove.textContent = "Delete";
      remove.setAttribute("aria-label", `Delete ${name}`);
      remove.addEventListener("click", () => confirmAction("Delete character?",
        character.shareOwner ? `Delete “${name}” and end sharing? Everyone else will keep their own cloud copy.`
          : `Delete “${name}”? This cannot be undone.`,
        "Delete", async () => {
          if (fromCloud) {
            const headers = character.shareOwner ? { "X-End-Pirate-Sharing": "true" } : undefined;
            await request(`${savesPath}/${slot}`, { method: "DELETE", headers });
          } else await withLocalCharacterSaves(() => localStorage.removeItem(localPrefix + slot));
          await render(fromCloud);
          create.focus();
          return `Deleted ${name}.`;
        }));
      actions.append(edit, exportButton);
      if (fromCloud) {
        const share = document.createElement("button");
        share.textContent = "Share";
        share.setAttribute("aria-label", `Share ${name}`);
        share.addEventListener("click", () => {
          if (busy) return;
          sharing.querySelector("h2").textContent = `Share ${name}`;
          generatedCode.value = shareLink.value = "";
          copy.disabled = copyLink.disabled = true;
          sharing.showModal();
          run(async () => {
            sharingStatus.textContent = "Generating share code…";
            const { code } = await request(`${sharePath}/generate`, { body: { slot } });
            generatedCode.value = code;
            const url = new URL("/projects/PirateCharacterSheet", window.location.origin);
            url.searchParams.set("share", code);
            shareLink.value = url.href;
            copy.disabled = copyLink.disabled = false;
            await render(true);
            return "Share code ready.";
          }, sharingStatus, sharingError);
        });
        actions.append(share);
        if (character.shareOwner) {
          const unshare = document.createElement("button");
          unshare.textContent = "Unshare";
          unshare.setAttribute("aria-label", `Unshare ${name}`);
          unshare.addEventListener("click", () => confirmAction("Unshare character?",
            `End sharing for “${name}”? Everyone will keep their own cloud copy of the latest saved version.`,
            "Unshare", async () => {
              await request(`${sharePath}/unshare`, { body: { slot } });
              await render(true);
              create.focus();
              return "Sharing ended. Each participant kept a cloud copy.";
            }));
          actions.append(unshare);
        }
      }
      if (cloud) {
        const move = document.createElement("button");
        const target = fromCloud ? "Local" : "Cloud";
        move.textContent = `Move to ${target}`;
        move.setAttribute("aria-label", `Move to ${target}: ${name}`);
        const moveSave = async () => {
          move.disabled = true;
          try {
            return await moveCharacter(slot, name, fromCloud, character.shareOwner);
          } finally {
            move.disabled = false;
          }
        };
        move.addEventListener("click", () => {
          if (character.shareOwner) {
            confirmAction("Move shared character?",
              `Move “${name}” to this browser and end sharing? Everyone else will keep their own cloud copy.`,
              "Move to Local", moveSave);
          } else run(moveSave);
        });
        actions.append(move);
      }
      actions.append(remove);
      card.append(heading, detail, actions);
      grid.append(card);
    }
  }

  async function copyShareValue(field, label) {
    try {
      await navigator.clipboard.writeText(field.value);
      sharingStatus.textContent = `${label} copied.`;
    } catch {
      field.focus();
      field.select();
      sharingStatus.textContent = `${label} selected. Copy it from the field.`;
    }
  }
  copy.addEventListener("click", () => copyShareValue(generatedCode, "Share code"));
  copyLink.addEventListener("click", () => copyShareValue(shareLink, "Share link"));
  function openRedeem() {
    if (busy) return;
    redeemStatus.textContent = redeemError.textContent = "";
    redeemDialog.showModal();
  }
  insertShare.addEventListener("click", openRedeem);
  const incomingLink = new URL(window.location.href);
  const linkedCode = incomingLink.searchParams.get("share");
  redeemForm.addEventListener("submit", event => {
    event.preventDefault();
    const code = incomingCode.value.trim();
    run(async () => {
      if (!code) throw new Error("Enter a share code.");
      redeem.disabled = true;
      try {
        const imported = await request(`${sharePath}/redeem`, { body: { code } });
        incomingCode.value = "";
        await render(true);
        const name = imported.name.trim();
        if (linkedCode) {
          incomingLink.searchParams.delete("share");
          window.history.replaceState(null, "", incomingLink);
        }
        redeemDialog.close();
        status.textContent = name ? `Imported ${name} into Cloud Saves.` : "Shared character imported into Cloud Saves.";
      } finally {
        redeem.disabled = false;
      }
    }, redeemStatus, redeemError);
  });

  refresh.addEventListener("click", () => run(async () => {
    await render(true);
    return "Cloud saves refreshed.";
  }));
  create.addEventListener("click", () => run(async () => {
    const { slot } = await add({ name: "", currentLevel: 1, version: 1.7 });
    if (library.isConnected) window.location.assign(characterEditorUrl(slot, !cloud));
  }));
  importButton.addEventListener("click", () => {
    if (!busy) fileInput.click();
  });
  fileInput.addEventListener("change", () => {
    const [file] = fileInput.files;
    fileInput.value = "";
    if (!file) return;
    run(async () => {
      await add(await readCharacterFile(file));
      await render(cloud);
      return "Character imported.";
    });
  });
  dialog.addEventListener("close", () => {
    const action = confirmedAction;
    confirmedAction = undefined;
    if (dialog.returnValue === "confirm" && library.isConnected) run(action);
  });
  run(async () => {
    await render(false);
    if (cloud) await render(true);
  }).then(() => {
    if (library.isConnected && linkedCode) {
      if (cloud) {
        incomingCode.value = linkedCode;
        openRedeem();
      } else {
        status.textContent = "Use an account with cloud access to open this shared character.";
      }
    }
  });
}
