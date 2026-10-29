/**
 * Secrets a centre gives us (its Razorpay key secret and webhook secret) are
 * stored only as AES-256-GCM ciphertext: "v1.<iv>.<ciphertext>", base64url.
 * The key is derived from the environment's JWT_SECRET, so each environment
 * reads only its own; rotating JWT_SECRET means centres re-enter their keys.
 */

const encoder = new TextEncoder();
const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");
const unb64 = (text: string) => new Uint8Array(Buffer.from(text, "base64url"));

async function keyFor(secret: string) {
  const material = await crypto.subtle.digest("SHA-256", encoder.encode(`chukta-secrets-v1:${secret}`));
  return crypto.subtle.importKey("raw", material, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function sealSecret(secret: string, plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await keyFor(secret), encoder.encode(plain));
  return `v1.${b64(iv)}.${b64(new Uint8Array(sealed))}`;
}

export async function openSecret(secret: string, sealed: string): Promise<string> {
  const [version, iv, data] = sealed.split(".");
  if (version !== "v1" || !iv || !data) throw new Error("This is not a sealed secret");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await keyFor(secret), unb64(data));
  return new TextDecoder().decode(plain);
}
