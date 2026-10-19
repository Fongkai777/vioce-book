// Portable browser/Worker envelope. No password or encryption key is persisted.
export type BackupEnvelope = { format: "voicebook-encrypted"; version: 1; iterations: 100000; salt: string; iv: string; data: string };
const encoder = new TextEncoder();
const aad = encoder.encode("voicebook-encrypted:v1:pbkdf2-sha256:100000:aes-256-gcm");
export function base64(bytes: Uint8Array) {
  let text = "";
  for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
}
export function unbase64(text: string) { return Uint8Array.from(atob(text), char => char.charCodeAt(0)); }
async function key(password: string, salt: Uint8Array<ArrayBuffer>) {
  if (typeof password !== "string" || password.length < 12 || password.length > 256) throw new Error("Use a backup passphrase of 12–256 characters.");
  const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, material,
    { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
export async function encryptBackup(value: unknown, password: string): Promise<BackupEnvelope> {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad }, await key(password, salt), encoder.encode(JSON.stringify(value)));
  return { format: "voicebook-encrypted", version: 1, iterations: 100000, salt: base64(salt), iv: base64(iv), data: base64(new Uint8Array(encrypted)) };
}
export async function decryptBackup(envelope: unknown, password: string, maxEncodedBytes = 100_000_000): Promise<unknown> {
  const value = envelope as BackupEnvelope;
  if (!value || value.format !== "voicebook-encrypted" || value.version !== 1 || value.iterations !== 100000 ||
    typeof value.data !== "string" || value.data.length > maxEncodedBytes ||
    typeof value.salt !== "string" || value.salt.length !== 24 || typeof value.iv !== "string" || value.iv.length !== 16) {
    throw new Error("Unsupported or oversized backup.");
  }
  try {
    const salt = unbase64(value.salt), iv = unbase64(value.iv);
    if (salt.length !== 16 || iv.length !== 12) throw new Error("Invalid nonce");
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: aad }, await key(password, salt), unbase64(value.data));
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(decrypted));
  } catch { throw new Error("Incorrect passphrase or damaged backup. No data was changed."); }
}
