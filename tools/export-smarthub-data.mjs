import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const localDir = path.join(repoRoot, ".local");
const dataDir = path.join(repoRoot, "data");
const passphrasePath = path.join(localDir, "sync-passphrase.txt");
const settingsPath = path.join(process.env.LOCALAPPDATA ?? "", "SmartHub", "settings.json");
const appDataPath = path.join(process.env.LOCALAPPDATA ?? "", "SmartHub");

fs.mkdirSync(localDir, { recursive: true });
fs.mkdirSync(dataDir, { recursive: true });

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function readText(filePath, fallback = "") {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return fallback;
  }
}

function ensurePassphrase() {
  if (fs.existsSync(passphrasePath)) {
    return fs.readFileSync(passphrasePath, "utf8").trim();
  }

  const passphrase = crypto.randomBytes(32).toString("base64url");
  fs.writeFileSync(passphrasePath, `${passphrase}\n`, "utf8");
  return passphrase;
}

function sqliteTables(databasePath) {
  if (!fs.existsSync(databasePath)) {
    return {};
  }

  const script = `
import json, sqlite3, sys
db = sys.argv[1]
con = sqlite3.connect(db)
con.row_factory = sqlite3.Row
cur = con.cursor()
tables = {}
for row in cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"):
    name = row["name"]
    tables[name] = [dict(item) for item in con.execute(f"SELECT * FROM {name}")]
print(json.dumps(tables, ensure_ascii=False))
con.close()
`;
  const output = execFileSync("python", ["-c", script, databasePath], { encoding: "utf8" });
  return JSON.parse(output);
}

function encryptPayload(payload, passphrase) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const iterations = 310000;
  const key = crypto.pbkdf2Sync(passphrase, salt, iterations, 32, "sha256");
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    version: 1,
    algorithm: "AES-256-GCM",
    kdf: {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations,
      salt: salt.toString("base64")
    },
    iv: iv.toString("base64"),
    ciphertext: Buffer.concat([encrypted, tag]).toString("base64"),
    exportedAt: payload.exportedAt
  };
}

const settings = readJson(settingsPath, {});
const resourceRoot = settings.ResourceRootPath ?? "";
const activeBreaks = sqliteTables(path.join(appDataPath, "active-breaks.db"));

const payload = {
  exportedAt: new Date().toISOString(),
  smartHub: {
    source: "SmartHub local export",
    resourceRoot,
    appDataPath
  },
  appData: {
    settings: {
      monitorDeviceName: settings.MonitorDeviceName ?? "",
      screenAliases: settings.ScreenAliases ?? {},
      resourceRootPath: settings.ResourceRootPath ?? "",
      scriptingProjectPath: settings.ScriptingProjectPath ?? ""
    },
    stickyNotes: readJson(path.join(appDataPath, "sticky-notes.json"), []),
    scriptDesignerDraft: readText(path.join(appDataPath, "script-designer-draft.txt")),
    activeBreaksDatabase: "active-breaks.db"
  },
  activeBreaks: {
    settings: activeBreaks.Settings ?? [],
    exercises: activeBreaks.Exercises ?? [],
    activityRecords: activeBreaks.ActivityRecords ?? [],
    streakRecords: activeBreaks.StreakRecords ?? []
  },
  resourceRoot: {
    orders: readJson(path.join(resourceRoot, "orders.json"), { Items: [] }),
    orderQuotes: readJson(path.join(resourceRoot, "Orders", "order-quotes.json"), { Items: [] }),
    library: readJson(path.join(resourceRoot, "library.json"), {}),
    marketBookmarks: readJson(path.join(resourceRoot, "mercado-libre-bookmarks.json"), {}),
    broadcasterProfiles: readJson(path.join(resourceRoot, "WAShareables", "broadcaster-profiles.json"), []),
    scripts: readJson(path.join(resourceRoot, "Scripts", "scripts.json"), {}),
    scriptDictionary: readJson(path.join(resourceRoot, "Scripts", "script-dictionary.json"), {}),
    passwordManager: {
      generatorSettings: readJson(path.join(resourceRoot, "PasswordManager", "generator-settings.json"), {}),
      passwordCount: (readJson(path.join(resourceRoot, "PasswordManager", "passwords.json"), { Items: [] })?.Items ?? []).length
    }
  }
};

const passphrase = ensurePassphrase();
const encrypted = encryptPayload(payload, passphrase);
fs.writeFileSync(path.join(dataDir, "smarthub.enc.json"), `${JSON.stringify(encrypted, null, 2)}\n`, "utf8");
fs.writeFileSync(path.join(localDir, "last-export-summary.json"), `${JSON.stringify({
  exportedAt: payload.exportedAt,
  resourceRoot,
  orders: payload.resourceRoot.orders?.Items?.length ?? payload.resourceRoot.orders?.items?.length ?? 0,
  quotes: payload.resourceRoot.orderQuotes?.Items?.length ?? payload.resourceRoot.orderQuotes?.items?.length ?? 0,
  activeBreakRecords: payload.activeBreaks.activityRecords.length,
  scripts: payload.resourceRoot.scripts?.Items?.length ?? payload.resourceRoot.scripts?.items?.length ?? 0,
  passphrasePath
}, null, 2)}\n`, "utf8");

console.log(`Encrypted export written: ${path.join(dataDir, "smarthub.enc.json")}`);
console.log(`Local passphrase file: ${passphrasePath}`);
