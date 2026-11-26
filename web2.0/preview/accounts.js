import { randomUUID } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";

export const siteRoles = ["user", "traveler", "manager", "owner"];
export const membershipRoles = ["viewer", "participant", "writer", "admin"];
export const pirateRoles = ["viewer", "traveler", "admin", "writer"];
export const defaultAccount = { username: "Test Player", role: "user" };

const accountKey = username => username.toLowerCase();

export function resolvePirateRole(account, saved = account) {
  if (account.role === "owner") return "owner";
  return saved?.pirateRole ?? ({ traveler: "traveler", manager: "admin" }[account.role] ?? "viewer");
}

export function normalizeAccount({ username, role } = {}) {
  username = typeof username === "string" ? username.trim() : "";
  if (!username || username.length > 80 || !siteRoles.includes(role)) {
    throw new TypeError("Enter a username and choose a site role.");
  }
  return { username, role };
}

export async function createAccountStore(file) {
  let accounts = [];
  try {
    accounts = JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  let pending = Promise.resolve();

  function update(change) {
    const save = pending.then(async () => {
      const next = change(accounts);
      const temp = new URL(`accounts-${randomUUID()}.tmp`, file);
      try {
        await writeFile(temp, JSON.stringify(next, null, 2) + "\n", { flag: "wx" });
        await rename(temp, file);
        accounts = next;
        return accounts;
      } finally {
        await rm(temp, { force: true });
      }
    });
    pending = save.catch(() => {});
    return save;
  }

  function access(identity) {
    const account = normalizeAccount(identity);
    const key = accountKey(account.username);
    const saved = accounts.find(item => item.key === key);
    const membership = account.role === "owner" ? "owner"
      : account.role === "manager" ? "admin" : saved?.membership ?? "viewer";
    return {
      ...account, key, membership, pirateRole: resolvePirateRole(account, saved),
      canWrite: ["writer", "admin", "owner"].includes(membership),
      canManage: ["admin", "owner"].includes(membership),
    };
  }

  return {
    list: () => accounts,
    access,
    save(draft) {
      const account = normalizeAccount(draft);
      const key = accountKey(account.username);
      return update(items => {
        const existing = items.find(item => item.key === key);
        return [...items.filter(item => item.key !== key),
          { ...existing, ...account, key, membership: existing?.membership ?? "viewer" }];
      });
    },
    remove(key) {
      return update(items => items.filter(item => item.key !== key));
    },
    assign(key, membership) {
      if (!membershipRoles.includes(membership)) throw new TypeError("Choose a Compendium role.");
      return update(items => {
        const target = items.find(item => item.key === key);
        if (!target) throw new TypeError("Choose a saved account.");
        if (["manager", "owner"].includes(target.role)) {
          throw new TypeError("Managers and Owners get Compendium access from their site role.");
        }
        return items.map(item => item === target ? { ...item, membership } : item);
      });
    },
    assignPirate(key, role, actor) {
      if (!pirateRoles.includes(role)) throw new TypeError("Choose a Pirate role.");
      return update(items => {
        const target = items.find(item => item.key === key);
        if (!target || target.role === "owner") throw new TypeError("Choose a saved account other than an Owner.");
        if (actor !== "owner" && (![role, resolvePirateRole(target)].every(item => ["viewer", "traveler"].includes(item)))) {
          throw new TypeError("Only an Owner can assign or change Admin and Writer roles.");
        }
        return items.map(item => item === target ? { ...item, pirateRole: role } : item);
      });
    },
  };
}
