import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "./db.js";

const VAULT_PATH = join(DATA_DIR, "vault.enc");
const ALGORITHM = "aes-256-gcm";
const KEY_LEN = 32;

function getMachineId(): string {
  try {
    return readFileSync("/etc/machine-id", "utf8").trim();
  } catch {
    // Fallback for systems without /etc/machine-id
    return "opskrew-default-machine-id-fallback";
  }
}

function deriveKey(): Buffer {
  const salt = Buffer.from("opskrew-vault-v1");
  return scryptSync(getMachineId(), salt, KEY_LEN) as Buffer;
}

type VaultData = Record<string, string>;

function readVault(): VaultData {
  if (!existsSync(VAULT_PATH)) return {};
  try {
    const raw = JSON.parse(readFileSync(VAULT_PATH, "utf8")) as {
      iv: string;
      tag: string;
      data: string;
    };
    const key = deriveKey();
    const iv = Buffer.from(raw.iv, "hex");
    const tag = Buffer.from(raw.tag, "hex");
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    const decrypted =
      decipher.update(raw.data, "hex", "utf8") + decipher.final("utf8");
    return JSON.parse(decrypted) as VaultData;
  } catch {
    return {};
  }
}

function writeVault(data: VaultData): void {
  const key = deriveKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted =
    cipher.update(JSON.stringify(data), "utf8", "hex") + cipher.final("hex");
  const tag = cipher.getAuthTag();
  writeFileSync(
    VAULT_PATH,
    JSON.stringify({
      iv: iv.toString("hex"),
      tag: tag.toString("hex"),
      data: encrypted,
    }),
    "utf8",
  );
}

export interface Vault {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
  delete(key: string): void;
  all(): VaultData;
}

export function getVault(): Vault {
  return {
    get(key: string): string | undefined {
      return readVault()[key];
    },
    set(key: string, value: string): void {
      const data = readVault();
      data[key] = value;
      writeVault(data);
    },
    delete(key: string): void {
      const data = readVault();
      delete data[key];
      writeVault(data);
    },
    all(): VaultData {
      return readVault();
    },
  };
}
