# ARGUS

A real-time facial recognition and analysis platform, bridging mobile camera capture with a
centralized monitoring dashboard. See [`documentation/`](documentation/) for the full overview,
features, usage, and architecture.

---

## ⚠️ Security notice: SSL private keys removed from git history (2026-09-04)

The git history of this repository was rewritten to permanently remove committed SSL private
keys. **All branches were force-pushed.** If you have an existing local clone, see
[Resyncing your local clone](#resyncing-your-local-clone) below.

### What was removed

Four `key.pem` files, deleted from **every commit** in the history (not just from the current tree):

| Path |
| --- |
| `backend/key.pem` |
| `kye/key.pem` |
| `live-camera-server/key.pem` |
| `argus-integrated-build/backend/key.pem` |

These were TLS private keys. ARGUS requires HTTPS so that browsers will grant camera access via
`navigator.mediaDevices.getUserMedia` (see [`documentation/04-Architecture.md`](documentation/04-Architecture.md)),
which is why the certificate pair was committed in the first place.

### Why this matters

A private key that has ever been committed must be treated as compromised, even in a private
repository. Rewriting history removes it from the current history, but it does not un-share a key
that was already pushed. **These keys must not be reused.** Since the certificates were
self-signed development certs, the practical fix is simply to generate a fresh pair — which is
required for any new deployment anyway.

### Current state

The matching `cert.pem` files (orphaned without their keys) are no longer tracked, and the root
`.gitignore` now excludes `*.pem`, `*.key`, `*.crt`, `.env*` and `**/dataset/*`.

The duplicate server copies (`kye/`, `live-camera-server/`, `vedang/`) have been removed. The
repository now has a single backend and frontend:

| Path | Contents |
| --- | --- |
| `backend/` | Express HTTPS + WebSocket relay server (formerly `argus-integrated-build/backend/`) |
| `frontend/` | React dashboard (formerly `argus-integrated-build/frontend/`) |
| `scripts/` | Legacy EC2 deploy scripts — run from the repository root |

---

## Moving forward

### 1. Generate a fresh certificate pair

Run this once in `backend/` on each machine that runs the server:

```bash
openssl req -x509 -newkey rsa:4096 -sha256 -days 365 \
  -nodes -keyout key.pem -out cert.pem \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:<your-lan-ip>"
```

Replace `<your-lan-ip>` with the machine's LAN address (e.g. `192.168.1.20`). The SAN entry
matters: phones streaming to the backend connect by IP, and browsers reject certificates whose
SAN does not cover the address actually used.

Because these are self-signed, you will still need to accept the browser warning once on each
device — or install the certificate as trusted on the phone to avoid repeated prompts.

### 2. Keep keys out of git

The root `.gitignore` excludes `*.pem`, so a regenerated pair will not be committed. Do not
remove that rule or force-add certificate files.

### 3. For a real deployment

Self-signed certs are fine for local development and demos. For anything exposed beyond the LAN,
use certificates from a real CA (Let's Encrypt via `certbot`) and supply the key to the
application through a mounted secret or environment-specific path — never through the repository.

---

## Resyncing your local clone

History was rewritten, so an existing clone has diverged and will conflict on the next push.
The simplest fix is a fresh clone. To keep your existing working directory instead, back up any
uncommitted work first, then:

```bash
git fetch origin
git reset --hard origin/main   # repeat per branch you track
```

Any local branch still built on the old history must be rebased onto the rewritten history, or
recreated from it.
