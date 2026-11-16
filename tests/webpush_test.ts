// Web Push crypto and the habit helpers.
//   deno test -A --config supabase/functions/api/deno.json tests/webpush_test.ts
import { b64url, encryptPayload, fromB64url, generateVapidKeys, isPushEndpoint, vapidAuthorization } from "../supabase/functions/api/src/webpush.ts";
import { addDays, cleanDream, dreamPhrase, localDay, localHour, recordDay, reminderText, streakView } from "../supabase/functions/api/src/engage.ts";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

// RFC 8291, Appendix A: the worked example every implementation must reproduce.
const RFC = {
  plaintext: "When I grow up, I want to be a watermelon",
  asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  asPublic: "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  uaPublic: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  auth: "BTBZMqHH6r4Tts7J_aSIgg",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  body:
    "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};

Deno.test("encryption matches RFC 8291's worked example", async () => {
  const pub = fromB64url(RFC.asPublic);
  const jwk: JsonWebKey = { kty: "EC", crv: "P-256", d: RFC.asPrivate, x: b64url(pub.slice(1, 33)), y: b64url(pub.slice(33)), ext: true };
  const out = await encryptPayload(new TextEncoder().encode(RFC.plaintext), { p256dh: RFC.uaPublic, auth: RFC.auth }, {
    serverPrivateJwk: jwk,
    salt: fromB64url(RFC.salt),
  });
  assert(b64url(out) === RFC.body, `body differs:\n${b64url(out)}`);
});

Deno.test("VAPID header is a valid ES256 token for the push service's origin", async () => {
  const keys = await generateVapidKeys();
  const at = new Date("2026-11-16T10:00:00Z");
  const header = await vapidAuthorization("https://fcm.googleapis.com/fcm/send/abc", keys, "https://cotsi.siddheshthapa.com", at);
  const m = header.match(/^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/);
  assert(m, "header shape");
  const claims = JSON.parse(new TextDecoder().decode(fromB64url(m[2])));
  assert(claims.aud === "https://fcm.googleapis.com" && claims.sub === "https://cotsi.siddheshthapa.com", "claims");
  assert(claims.exp - at.getTime() / 1000 <= 24 * 3600, "expires within 24 hours, as RFC 8292 requires");
  const pub = await crypto.subtle.importKey("raw", fromB64url(m[4]), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, fromB64url(m[3]), new TextEncoder().encode(`${m[1]}.${m[2]}`));
  assert(ok, "signature verifies with the public key");
});

Deno.test("only real push services are accepted as endpoints", () => {
  assert(isPushEndpoint("https://fcm.googleapis.com/fcm/send/x"), "Chrome/Android");
  assert(isPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/x"), "Firefox");
  assert(isPushEndpoint("https://web.push.apple.com/x"), "Safari/iPhone");
  assert(!isPushEndpoint("https://evil.example.com/fcm.googleapis.com"), "other hosts refused");
  assert(!isPushEndpoint("http://fcm.googleapis.com/x"), "plain http refused");
  assert(!isPushEndpoint("https://fcm.googleapis.com.evil.com/x"), "look-alike refused");
});

Deno.test("streak: consecutive days count, a missed day resets, best is kept", () => {
  let s = recordDay(null, "2026-11-10")!;
  s = recordDay(s, "2026-11-11")!;
  s = recordDay(s, "2026-11-12")!;
  assert(recordDay(s, "2026-11-12") === null, "the same day twice changes nothing");
  assert(streakView(s, "2026-11-12").current === 3 && streakView(s, "2026-11-12").doneToday, "3 days, done today");
  const next = streakView(s, "2026-11-13");
  assert(next.current === 3 && !next.doneToday, "the next morning the streak is still alive");
  assert(streakView(s, "2026-11-14").current === 0, "a whole missed day breaks it");
  s = recordDay(s, "2026-11-15")!;
  const v = streakView(s, "2026-11-15");
  assert(v.current === 1 && v.best === 3, "starts again at 1, best stays 3");
  assert(v.week.length === 7 && v.week[6].day === "2026-11-15" && v.week[6].on && !v.week[5].on && !v.week[4].on && v.week[3].on, "week dots");
  assert(addDays("2026-03-01", -1) === "2026-02-28", "month edges");
});

Deno.test("local day and hour follow the learner's time zone", () => {
  const at = new Date("2026-11-16T20:00:00Z"); // 01:30 next day in India
  assert(localDay(at, "Asia/Kolkata") === "2026-11-17" && localHour(at, "Asia/Kolkata") === 1, "India");
  assert(localDay(at, "America/New_York") === "2026-11-16" && localHour(at, "America/New_York") === 15, "New York");
  assert(localDay(at, "Not/AZone") === "2026-11-17", "unknown zones fall back to India");
});

Deno.test("dream: checked input, wording, and reminders that never promise a job", () => {
  assert(dreamPhrase(cleanDream({ kind: "bike" })) === "your bike", "default phrase");
  assert(dreamPhrase(cleanDream({ kind: "bike", text: "My Royal Enfield  Classic" })) === "your Royal Enfield Classic", "named");
  let threw = false;
  try {
    cleanDream({ kind: "other" });
  } catch {
    threw = true;
  }
  assert(threw, "'something else' needs words");
  const week = streakView(recordDay(recordDay(null, "2026-11-15"), "2026-11-16"), "2026-11-17");
  const r = reminderText(week, { kind: "laptop" });
  assert(/2-day streak/.test(r.title) && /your new laptop/.test(r.body), "streak reminder mentions the dream");
  assert(/your bike/.test(reminderText(streakView(null, "2026-11-17"), { kind: "bike" }).title), "dream reminder");
  for (const text of [r.title, r.body]) assert(!/guarantee|you will get|salary|₹/i.test(text), "no promises");
});
