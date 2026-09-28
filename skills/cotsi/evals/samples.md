# Reference outputs (hand-run)

These were written by following SKILL.md step by step for three of the prompts in `evals.json`.
They show the intended shape of a v6 lesson and serve as a baseline when the skill changes. They
are not benchmark results from independent test runs.

---

## Eval 1: `/cotsi how HTTPS actually works` (characters style)

🗺️ **Leverage Map — How HTTPS works** (for: understanding what really happens behind the padlock)

**The 20% — learn in this order:**
1. **Two kinds of keys** — unlocks: why HTTPS is fast, SSH keys, signed software, crypto wallets
2. **Digital signatures and certificates** — unlocks: the padlock icon, "Your connection is not
   private" warnings, certificate authorities
3. **Key exchange** — unlocks: session keys, forward secrecy, why recorded traffic stays safe later
4. **The handshake, end to end** — unlocks: TLS 1.2 vs 1.3, cipher suites, debugging HTTPS errors

**The 80% it unlocks:** cipher suites, TLS versions, HSTS, certificate revocation, mutual TLS, VPN
encryption
**Look up when needed:** algorithm names (AES-GCM, ECDHE, RSA key sizes), OpenSSL commands ·
**Safe to ignore for now:** the math inside the algorithms (primes, elliptic curves), the byte
layout of TLS records
🔭 **Expert lens:** Who am I really talking to? Can anyone read this? Can anyone change it without
being caught?
🎯 **Anchor problem:** You're on a café's Wi-Fi, and the owner controls the network. Can they read
your bank password when you log in over HTTPS? What would they need to pull it off?

### 1/4 · Two kinds of keys

Your laptop has never met your bank's server, yet in a fraction of a second they share a secret,
over a network anyone can listen to. How do you agree on a secret in public?

🎬 *Dunder Mifflin. Michael wants to send Jan a secret note, but Dwight reads all the office mail.*

**Michael:** Easy. I lock the note in a box and send Jan the key in a separate envelope.

**Jim:** Dwight opens every envelope, Michael. He gets the box *and* the key. Try this instead: Jan
mails you an open padlock. Anyone can snap it shut. Only Jan has the key that opens it.

**Michael:** So Dwight can see the padlock… but it doesn't help him?

**Jim:** Right. Snapping it shut is public. Opening it is private.

**Dwight:** Flaw. I could swap Jan's padlock for my own before it reaches you. You'd lock your note
with *my* padlock.

**Jim:** Which is why we'll need proof that the padlock is really Jan's. Next time.

**The real version:** **Symmetric encryption** uses one shared key to lock and unlock. It's fast,
but both sides need the same key first. **Public-key (asymmetric) encryption** uses a **key pair**:
a public key anyone can use, and a private key that never leaves its owner. What the public key
locks, only the private key opens. Public-key math is slow, so HTTPS uses it only at the start, to
prove who the server is and to agree on a fresh shared key. Then it switches to fast symmetric
encryption for everything else.

🧠 **Sticky line:** Padlocks to meet, shared keys to talk.

🎯 **Your turn:** Dwight can see Jan's padlock and the locked box. Why can't he open it, and why
doesn't HTTPS just use padlocks for everything?

🔮 **Guess the next one:** If Dwight swaps Jan's padlock for his own, how could Michael possibly
tell?

*Answer in a line (add a 1–5 confidence if you like), or type "skip".*

---

## Eval 6: a pasted Two Sum problem (hint ladder, rung 1)

**Two Sum, in one line:** find the two positions whose values add up to `target`. Exactly one pair
works, and you can't use the same element twice.

🧭 **Pattern hint: hash map.** The clue is "find a pair that adds up to a target" in an array that
*isn't sorted*. For each number, the partner you need is fixed (`target − num`), so the whole
problem becomes "have I already seen that number?", and a hash map answers that instantly.

Try it: describe your approach in a sentence or two, or paste your code. Want the next hint
instead? Type `hint`.

---

## Eval 14: a confident miss (feedback and mastery gate)

❌ **Not yet**, and that was a confident miss (5/5). Those are the most useful kind to fix, so I'll
bring this one back in review.

The padlock's strength isn't the point: a flimsy padlock would work the same way. What matters is
**who holds which key**. Snapping it shut needs no key at all, so anyone can do it. Opening it
needs Jan's key, and that key never leaves Jan.

A new angle: think of the **mail slot** in Jan's front door. Anyone can push a letter through it;
that's the public side. Only Jan has the key to the door, so only Jan can take the letters out;
that's the private side. Watching you post the letter doesn't let Dwight read it.

🎯 **Your turn (same idea, new question):** Pam wants to send Jan a secret through that mail slot.
Which part plays the public key, which part plays the private key, and what can Dwight learn just
by watching?
