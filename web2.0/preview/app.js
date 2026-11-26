import { mountCompendium } from "/compendium/browser/index.js";
import { characterEditorUrl, migrateLocalCharacters, mountCharacterLibrary } from "/character-library.js";
import { characterSlotPattern } from "/games/PirateSystem/character-files.js";
import { migrateLocalExpansions } from "/games/PirateSystem/expansion-saves.js";

const form = document.querySelector("#account-form");
const controls = document.querySelector(".account-controls");
const picker = document.querySelector("#saved-accounts");
const load = document.querySelector("#load-account");
const remove = document.querySelector("#delete-account");
const membershipControl = document.querySelector("#membership-control");
const membership = document.querySelector("#membership");
const container = document.querySelector("#compendium-preview");
const back = document.querySelector(".pirate-back");
const accountLabel = document.querySelector("#active-account");
const status = document.querySelector("#account-status");
const alert = document.querySelector("#account-error");
const migrationStatus = document.querySelector("#character-migration-status");
const migrationError = document.querySelector("#character-migration-error");
const sessionKey = "pirate-ttrpg-preview:account";
const defaultAccount = { username: "Test Player", role: "user" };
const label = value => value.charAt(0).toUpperCase() + value.slice(1);
const tools = new Map([
  ["/projects/PirateCharacterSheet", ["Character Sheet", "PirateCharacterSheet.html"]],
  ["/projects/PirateNpcBuilder", ["NPC Builder", "PirateNpcBuilder.html"]],
  ["/projects/PirateCustom", ["Expansions", "PirateHomebrewBuilder.html"]],
  ["/projects/PirateCustomItem", ["Expansions", "PirateHomebrewBuilder.html"]],
].map(([route, tool]) => [route.toLowerCase(), tool]));
const path = window.location.pathname.toLowerCase();
const onCompendium = path === "/" || path === "/projects/piratecompendium";
container.classList.toggle("compendium-page", onCompendium);
const onCharacters = path === "/projects/piratecharactersheet";
const characterPath = "/projects/PirateCharacterSheet";
const characterParams = new URLSearchParams(window.location.search);
let requestedSlot = characterParams.get("slot");
let useLocalSave = characterParams.get("storage") === "local";
const openEditor = onCharacters && characterSlotPattern.test(requestedSlot);
back.hidden = path === "/projects/pirate";
if (openEditor) {
  back.href = characterPath;
  back.setAttribute("aria-label", "Back to Characters");
}

if (openEditor) {
  window.addEventListener("message", event => {
    if (event.origin !== window.location.origin || event.source !== container.querySelector("iframe")?.contentWindow) return;
    if (event.data?.type === "pirate-character-sheet-theme") {
      back.classList.toggle("dark-mode", Boolean(event.data.darkMode));
    }
  });
}
let active = defaultAccount;
let saved = [];
let compendium;

function restoreAccount() {
  try {
    return JSON.parse(sessionStorage.getItem(sessionKey)) ?? defaultAccount;
  } catch {
    return defaultAccount;
  }
}

async function request(path, { account, body, file, signal, headers: extraHeaders, method = file || body !== undefined ? "POST" : "GET" } = {}) {
  const headers = { ...extraHeaders };
  if (account) {
    headers["X-Preview-Username"] = encodeURIComponent(account.username);
    headers["X-Preview-Role"] = account.role;
  }
  if (file) {
    headers["Content-Type"] = file.type;
    headers["X-Compendium-Filename"] = encodeURIComponent(file.name);
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(path, {
    headers,
    method,
    body: file ?? JSON.stringify(body),
    signal,
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error ?? data.message);
    error.status = response.status;
    throw error;
  }
  return data;
}

const selectedAccount = () => saved.find(account => account.key === picker.value);

function renderAccountActions() {
  const selected = selectedAccount();
  load.disabled = remove.disabled = !selected;
  membershipControl.hidden = !active.canManage;
  membership.disabled = !selected || ["manager", "owner"].includes(selected.role);
  membership.value = selected?.membership ?? "viewer";
}

function renderSaved(selected) {
  picker.replaceChildren(new Option(saved.length ? "Choose an account" : "No saved accounts", ""));
  for (const account of saved) {
    picker.add(new Option(`${account.username} · ${label(account.role)}`, account.key));
  }
  picker.value = saved.some(account => account.key === selected) ? selected : "";
  renderAccountActions();
}

function writerFor(account) {
  if (!account.canWrite) return undefined;
  const change = (path, body, { signal } = {}) => request(path, { account, body, signal });
  return {
    saveEntry: changes => change("/writer/entry", changes),
    deleteAbility: reference => change("/writer/ability/delete", { reference }),
    changeNavigation: changes => change("/writer/navigation", changes),
    saveTypography: settings => change("/writer/typography", settings),
    uploadImage: file => request("/writer/image", { account, file }),
    checkSpelling: (text, options) => change("/writer/spellcheck", { text }, options),
  };
}

async function apply(account) {
  const preview = onCompendium ? await request("/preview/compendium", { account }) : null;
  const next = preview?.active ?? await request("/preview/account", { account });
  const editor = openEditor && container.querySelector("iframe");
  const keepEditor = editor && next.key === active.key && next.canUseCloudSharing
    && (useLocalSave || !active.canUseCloudSharing);
  const returnToLibrary = editor && !keepEditor
    && (next.key !== active.key || next.pirateRole !== active.pirateRole);
  active = next;
  form.elements.username.value = next.username;
  form.elements.role.value = next.role;
  accountLabel.querySelector("strong").textContent = next.username;
  accountLabel.querySelector("span").textContent = `${label(next.role)} · ${label(onCompendium ? next.membership : next.pirateRole)}`;
  try {
    sessionStorage.setItem(sessionKey, JSON.stringify({ username: next.username, role: next.role }));
  } catch {
    // The active account still works for the current page.
  }
  if (returnToLibrary) {
    window.location.assign(characterPath);
    return;
  }
  renderAccountActions();
  compendium?.destroy();
  if (keepEditor) editor.inert = true;
  else container.replaceChildren();
  migrationStatus.textContent = migrationError.textContent = "";
  const accountRequest = (url, options) => request(url, { ...options, account: next });
  let movedOpenSave;
  if (next.canUseCloudSharing) {
    try {
      const { moved, remaining } = await migrateLocalCharacters(accountRequest);
      if (openEditor && (useLocalSave || keepEditor) && moved.has(requestedSlot)) {
        movedOpenSave = moved.get(requestedSlot);
        requestedSlot = movedOpenSave.slot;
        useLocalSave = false;
        window.history.replaceState(null, "", characterEditorUrl(requestedSlot));
      }
      if (moved.size) migrationStatus.textContent = `Moved ${moved.size} local ${moved.size === 1 ? "character" : "characters"} to Cloud Saves.`;
      if (remaining) migrationError.textContent = `${remaining} local ${remaining === 1 ? "save could" : "saves could"} not be moved. Apply your account again to retry.`;
    } catch {
      migrationError.textContent = "Could not access browser saves to move them to the cloud.";
    }
    try {
      const moved = await migrateLocalExpansions(accountRequest);
      if (moved) {
        migrationStatus.textContent = [migrationStatus.textContent,
          `Moved ${moved} local ${moved === 1 ? "expansion" : "expansions"} to Cloud Saves.`].filter(Boolean).join(" ");
      }
    } catch {
      migrationError.textContent = [migrationError.textContent,
        "Local expansions could not be moved. Apply your account again to retry."].filter(Boolean).join(" ");
    }
  }
  if (keepEditor) {
    if (movedOpenSave) {
      editor.contentWindow.postMessage({
        type: "pirate-character-sheet-cloud-save",
        slot: requestedSlot,
        etag: movedOpenSave.etag,
        account: { username: next.username, role: next.role },
      }, window.location.origin);
    } else {
      useLocalSave = true;
      window.history.replaceState(null, "", characterEditorUrl(requestedSlot, true));
    }
    editor.inert = false;
    return;
  }
  if (preview) {
    compendium = mountCompendium(container, preview.configuration, {
      title: "Pirate TTRPG Compendium",
      routing: true,
      stylesheets: ["/compendium-theme.css"],
      projectId: `${preview.configuration.id ?? "pirate-ttrpg"}:${next.key}`,
      imageBaseUrl: "/images/",
      writer: writerFor(next),
      saveTarget: "web2.0/compendium.json",
    });
  } else if (onCharacters && !openEditor) {
    mountCharacterLibrary(container, {
      cloud: next.canUseCloudSharing,
      request: accountRequest,
    });
  } else if (tools.has(path)) {
    const [title, file] = tools.get(path);
    const frame = document.createElement("iframe");
    frame.className = "pirate-tool";
    frame.title = `Pirate ${title}`;
    const params = new URLSearchParams({ apiUrl: window.location.origin, role: next.pirateRole });
    if (openEditor) params.set("slot", requestedSlot);
    if (openEditor && useLocalSave) params.set("storage", "local");
    frame.src = `/games/PirateSystem/${file}?${params}`;
    container.append(frame);
  } else {
    renderPirateHome(next);
  }
}

function renderPirateHome(account) {
  container.append(document.querySelector("#pirate-home").content.cloneNode(true));
  const button = container.querySelector(".pirate-settings");
  const dialog = container.querySelector("dialog");
  const list = dialog.querySelector(".pirate-role-list");
  const result = dialog.querySelector(".pirate-role-status");
  const assignable = account.pirateRole === "owner" ? ["viewer", "traveler", "admin", "writer"] : ["viewer", "traveler"];
  button.hidden = !["admin", "owner", "writer"].includes(account.pirateRole);

  function showPatrons(patrons) {
    list.replaceChildren();
    if (!patrons.length) list.textContent = "Save a mock account to assign a Pirate role.";
    for (const patron of patrons) {
      const row = document.createElement("label");
      const select = document.createElement("select");
      row.textContent = patron.username;
      select.disabled = patron.pirateRole === "owner" || !assignable.includes(patron.pirateRole);
      for (const role of new Set([...assignable, patron.pirateRole])) select.add(new Option(label(role), role));
      select.value = patron.pirateRole;
      select.addEventListener("change", async () => {
        list.inert = true;
        try {
          const updated = await request("/pirate-system/roles/set-role", {
            account, body: { targetUserId: patron.id, role: select.value },
          });
          showPatrons(patrons.map(item => item.id === patron.id ? updated.patron : item));
          result.textContent = updated.message;
        } catch (error) {
          select.value = patron.pirateRole;
          result.textContent = error.message;
        } finally {
          list.inert = false;
        }
      });
      row.append(select);
      list.append(row);
    }
  }

  button.addEventListener("click", async () => {
    result.textContent = "Loading mock accounts…";
    list.replaceChildren();
    dialog.showModal();
    try {
      const { patrons } = await request("/pirate-system/roles/list", { account, body: {} });
      result.textContent = "";
      showPatrons(patrons);
    } catch (error) {
      result.textContent = error.message;
    }
  });
}

async function run(action) {
  status.textContent = alert.textContent = "";
  controls.inert = true;
  try {
    status.textContent = await action();
  } catch (error) {
    alert.textContent = error.message;
    renderAccountActions();
  } finally {
    controls.inert = false;
  }
}

async function updateAccounts(body) {
  saved = await request("/preview/accounts", { account: active, body });
}

form.addEventListener("submit", event => {
  event.preventDefault();
  run(async () => {
    const account = Object.fromEntries(new FormData(form));
    account.username = account.username.trim();
    const save = event.submitter?.id === "save-account";
    if (save) {
      await updateAccounts({ action: "save", account });
      renderSaved(account.username.toLowerCase());
    }
    await apply(account);
    return save ? "Mock account saved." : "Mock account applied.";
  });
});

picker.addEventListener("change", renderAccountActions);
load.addEventListener("click", () => run(async () => {
  await apply(selectedAccount());
  return "Mock account loaded.";
}));
remove.addEventListener("click", () => run(async () => {
  const { key } = selectedAccount();
  await updateAccounts({ action: "delete", key });
  renderSaved();
  if (key === active.key) await apply(defaultAccount);
  return "Mock account deleted.";
}));
membership.addEventListener("change", () => run(async () => {
  const key = picker.value;
  await updateAccounts({ action: "assign", key, membership: membership.value });
  renderSaved(key);
  if (key === active.key) await apply(active);
  return "Compendium role updated.";
}));

await run(async () => {
  saved = await request("/preview/accounts");
  renderSaved();
  await apply(restoreAccount());
  return "";
});
if (!container.firstElementChild) container.textContent = "The preview could not be loaded.";
