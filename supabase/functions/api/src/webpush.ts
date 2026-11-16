// Web Push without a library, using only Web Crypto (works in Deno, Supabase and browsers).
//   RFC 8291: message encryption (aes128gcm content coding, RFC 8188)
//   RFC 8292: VAPID, which proves to the browser's push service that the message is from Cotsi

const te = new TextEncoder();

/** Bytes backed by a plain ArrayBuffer, which is what Web Crypto accepts. */
type Bytes = Uint8Array<ArrayBuffer>;

export function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromB64url(s: string): Bytes {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function concat(...parts: Uint8Array[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, bytes: number): Promise<Bytes> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8));
}

// ------------------------------------------------------------------ VAPID

/** The server's signing key pair. The public half goes to browsers; the private half stays on the server. */
export type VapidKeys = { publicKey: string; privateJwk: JsonWebKey };

export async function generateVapidKeys(): Promise<VapidKeys> {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  return { publicKey: b64url(raw), privateJwk: await crypto.subtle.exportKey("jwk", pair.privateKey) };
}

/** The Authorization header value for one push service (RFC 8292). */
export async function vapidAuthorization(endpoint: string, keys: VapidKeys, subject: string, at: Date): Promise<string> {
  const header = b64url(te.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64url(
    te.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(at.getTime() / 1000) + 12 * 3600, sub: subject })),
  );
  const key = await crypto.subtle.importKey("jwk", keys.privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, te.encode(`${header}.${claims}`)));
  return `vapid t=${header}.${claims}.${b64url(sig)}, k=${keys.publicKey}`;
}

// ------------------------------------------------------------------ encryption

export type PushSubscription = { endpoint: string; keys: { p256dh: string; auth: string } };

/** Fixed inputs, only for checking against the RFC's worked example. */
export type EncryptOverrides = { serverPrivateJwk?: JsonWebKey; salt?: Bytes };

/** Encrypts a message for one browser subscription (RFC 8291, a single aes128gcm record). */
export async function encryptPayload(
  plaintext: Bytes,
  sub: PushSubscription["keys"],
  overrides: EncryptOverrides = {},
): Promise<Bytes> {
  const uaPublic = fromB64url(sub.p256dh);
  const authSecret = fromB64url(sub.auth);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error("bad p256dh key");
  if (authSecret.length < 16) throw new Error("bad auth secret");

  const ecdh = { name: "ECDH", namedCurve: "P-256" };
  let asPrivate: CryptoKey;
  let asPublic: Bytes;
  if (overrides.serverPrivateJwk) {
    const jwk = overrides.serverPrivateJwk;
    asPrivate = await crypto.subtle.importKey("jwk", jwk, ecdh, true, ["deriveBits"]);
    asPublic = concat(new Uint8Array([4]), fromB64url(jwk.x!), fromB64url(jwk.y!));
  } else {
    const pair = (await crypto.subtle.generateKey(ecdh, true, ["deriveBits"])) as CryptoKeyPair;
    asPrivate = pair.privateKey;
    asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  }
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, ecdh, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, asPrivate, 256));

  const ikm = await hkdf(authSecret, shared, concat(te.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const salt = overrides.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, te.encode("Content-Encoding: nonce\0"), 12);

  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes, concat(plaintext, new Uint8Array([2]))));

  const rs = new Uint8Array([0, 0, 16, 0]); // record size 4096
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, sealed);
}

// ------------------------------------------------------------------ sending

/** Push services browsers use. Cotsi only sends to these, so a fake subscription can't make it call other servers. */
const PUSH_HOSTS = ["fcm.googleapis.com", "android.googleapis.com", "push.services.mozilla.com", "notify.windows.com", "push.apple.com"];

export function isPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== "string" || endpoint.length > 1000) return false;
  try {
    const u = new URL(endpoint);
    return u.protocol === "https:" && PUSH_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

/** Sends one notification. Returns the push service's HTTP status (201 = accepted, 404/410 = gone). */
export async function sendPush(
  sub: PushSubscription,
  message: unknown,
  keys: VapidKeys,
  subject: string,
  at: Date,
  fetchFn: typeof fetch = fetch,
): Promise<number> {
  if (!isPushEndpoint(sub.endpoint)) return 410;
  const body = await encryptPayload(te.encode(JSON.stringify(message)), sub.keys);
  const res = await fetchFn(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidAuthorization(sub.endpoint, keys, subject, at),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(12 * 3600),
      Urgency: "normal",
    },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  await res.body?.cancel();
  return res.status;
}
