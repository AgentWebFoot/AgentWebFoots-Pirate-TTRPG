import { mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createAccountStore, defaultAccount } from "./accounts.js";
import { createCompendiumStore } from "./data.js";
import { readImage, saveImage } from "./images.js";
import { createPirateApi } from "./pirate-api.js";
import { getSeedVersion, loadSeed } from "./seed.js";

const packageSource = new URL("./", import.meta.resolve("compendium"));
const assets = new Map([
  ["/", ["index.html", "text/html"]],
  ["/app.js", ["app.js", "text/javascript"]],
  ["/style.css", ["style.css", "text/css"]],
  ["/compendium-theme.css", ["compendium-theme.css", "text/css"]],
  ["/pirate-frame.js", ["pirate-frame.js", "text/javascript"]],
  ["/character-library.js", ["character-library.js", "text/javascript"]],
]);
const pirateAssets = new Map([
  ...["PirateCharacterSheet.html", "PirateNpcBuilder.html", "PirateHomebrewBuilder.html"].map(name => [name, "text/html"]),
  ...["PirateCharacterSheet.bundle.js", "PirateNpcBuilder.bundle.js", "character-files.js"].map(name => [name, "text/javascript"]),
  ...["CompassRose.png", "InkStain.png", "SkullAndCrossbones.png", "Wheel.png"].map(name => [name, "image/png"]),
  ["rules.json", "application/json"],
  ["expansion-saves.js", "text/javascript"],
]);
const vendor = new Map([
  ["/vendor/react.js", new URL("./umd/react.development.js", import.meta.resolve("react"))],
  ["/vendor/react-dom.js", new URL("./umd/react-dom.development.js", import.meta.resolve("react-dom"))],
]);
const projects = new Set([
  "/projects/Pirate", "/projects/PirateCompendium", "/projects/PirateCharacterSheet",
  "/projects/PirateNpcBuilder", "/projects/PirateCustom", "/projects/PirateCustomItem",
].map(path => path.toLowerCase()));
const isPirateApi = path => /^\/pirate-(?:system|character-sheet|homebrew)\//.test(path);

function json(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" }).end(JSON.stringify(payload));
}

async function readJson(request) {
  if (request.headers["content-type"] !== "application/json") {
    throw new TypeError("Send JSON from the local preview.");
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > 1_000_000) {
      request.resume();
      throw new RangeError("The preview request is too large.");
    }
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function identity(request) {
  const username = request.headers["x-preview-username"];
  const role = request.headers["x-preview-role"];
  if (username === undefined && role === undefined) return defaultAccount;
  return { username: decodeURIComponent(username ?? ""), role };
}

function entryReference(reference) {
  if (typeof reference?.tabId !== "string" || typeof reference.entryId !== "string") {
    throw new TypeError("Choose an entry.");
  }
  return reference;
}

export async function createPreviewServer({
  compendiumFile = new URL("../compendium.json", import.meta.url),
  stateDirectory = new URL("../.preview/", import.meta.url),
} = {}) {
  await mkdir(stateDirectory, { recursive: true });
  const accounts = await createAccountStore(new URL("accounts.json", stateDirectory));
  const pirateApi = await createPirateApi(stateDirectory, accounts);
  const store = createCompendiumStore(compendiumFile, { loadSeed, getSeedVersion });
  const images = new URL("images/", stateDirectory);
  let spellcheck;
  const writerRoutes = new Map([
    ["/writer/entry", ({ reference, values } = {}) => {
      if (!values || typeof values !== "object" || Array.isArray(values)) {
        throw new TypeError("Provide the entry edits.");
      }
      return store.saveCompendiumEntry(entryReference(reference), values);
    }],
    ["/writer/navigation", store.saveCompendiumNavigation],
    ["/writer/typography", store.saveCompendiumTypography],
    ["/writer/ability/delete", ({ reference } = {}) => store.deleteCompendiumAbility(entryReference(reference))],
    ["/writer/spellcheck", async ({ text } = {}) => {
      spellcheck ??= import("./spellcheck.js").then(module => module.createPreviewSpellcheck(store));
      return { issues: await (await spellcheck)(text) };
    }],
  ]);

  async function post(request, response, path) {
    if (request.headers.origin !== `http://${request.headers.host}`) {
      return json(response, 403, { error: "Use the local preview to make changes." });
    }
    const active = accounts.access(identity(request));
    if (path === "/preview/accounts") {
      const payload = await readJson(request);
      if (payload?.action === "save") return json(response, 200, await accounts.save(payload.account));
      if (payload?.action === "delete") return json(response, 200, await accounts.remove(payload.key));
      if (payload?.action === "assign") {
        if (!active.canManage) return json(response, 403, { error: "This account cannot assign roles." });
        return json(response, 200, await accounts.assign(payload.key, payload.membership));
      }
      throw new TypeError("Choose a preview account action.");
    }
    const writerAction = writerRoutes.get(path);
    if (!writerAction && path !== "/writer/image") return json(response, 404, { error: "Route not found." });
    if (!active.canWrite) return json(response, 403, { error: "This account has read-only Compendium access." });
    if (path === "/writer/image") {
      const { status, ...result } = await saveImage(images, request);
      return json(response, status, result);
    }
    const result = await writerAction(await readJson(request));
    if (result === null) return json(response, 404, { error: "This entry could not be found." });
    return json(response, 200, result);
  }

  const server = createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    const port = server.address().port;
    if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(request.headers.host)) {
      return response.writeHead(403).end("Open the preview on localhost.");
    }
    const path = request.url.split("?")[0];
    try {
      if (isPirateApi(path)) {
        const method = request.method;
        if (["POST", "DELETE"].includes(method) && request.headers.origin !== `http://${request.headers.host}`) {
          return json(response, 403, { message: "Use the local preview to make changes." });
        }
        const active = accounts.access(identity(request));
        const body = method === "POST" && path !== "/pirate-system/roles/list" ? await readJson(request) : undefined;
        const { status, payload, etag } = await pirateApi(path, method === "HEAD" ? "GET" : method, active, body, {
          ifMatch: request.headers["if-match"],
          endSharing: request.headers["x-end-pirate-sharing"] === "true",
        });
        if (etag) response.setHeader("ETag", etag);
        return json(response, status, payload);
      }
      if (request.method === "POST") return await post(request, response, path);
      if (request.method !== "GET" && request.method !== "HEAD") {
        return response.writeHead(405, { Allow: "GET, HEAD, POST" }).end();
      }
      if (path === "/preview/accounts") return json(response, 200, accounts.list());
      if (path === "/preview/account") return json(response, 200, accounts.access(identity(request)));
      if (path === "/preview/compendium") {
        const active = accounts.access(identity(request));
        return json(response, 200, { active, configuration: await store.readCompendium() });
      }
      if (path.startsWith("/images/")) {
        const image = await readImage(images, path.slice("/images/".length));
        if (!image) return response.writeHead(404).end("Image not found");
        return response.writeHead(200, { "Content-Type": image.type, "Content-Length": image.bytes.length })
          .end(request.method === "HEAD" ? undefined : image.bytes);
      }

      const pirateName = path.startsWith("/games/PirateSystem/") ? path.slice("/games/PirateSystem/".length) : "";
      const pirateType = pirateAssets.get(pirateName);
      const vendorFile = vendor.get(path);
      const asset = projects.has(path.toLowerCase()) ? assets.get("/") : assets.get(path);
      const modulePath = /^\/compendium\/((?:browser\/)?[a-z-]+\.(?:js|css))$/.exec(path)?.[1];
      const file = asset ? new URL(asset[0], import.meta.url)
        : pirateType ? new URL(`../pirate/${pirateName}`, import.meta.url)
        : vendorFile ?? (modulePath ? new URL(modulePath, packageSource) : null);
      if (!file) return response.writeHead(404).end("Not found");
      const content = await readFile(file);
      const type = asset?.[1] ?? pirateType ?? (modulePath?.endsWith(".css") ? "text/css" : "text/javascript");
      return response.writeHead(200, { "Content-Type": type.startsWith("image/") ? type : `${type}; charset=utf-8` })
        .end(request.method === "HEAD" ? undefined : content);
    } catch (error) {
      const key = isPirateApi(path) ? "message" : "error";
      if (error.code === "ENOENT") return json(response, 404, { [key]: "A preview file could not be found." });
      if (error instanceof RangeError) return json(response, 413, { [key]: error.message });
      if (error instanceof SyntaxError || error instanceof TypeError || error instanceof URIError) {
        return json(response, 400, { [key]: error.message });
      }
      console.error(error);
      return json(response, 500, { [key]: "The local preview could not complete this request." });
    }
  });
  return server;
}
