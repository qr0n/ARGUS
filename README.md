# ARGUS

A real-time facial recognition and analysis platform, bridging mobile camera capture with a
centralized monitoring dashboard. See [`documentation/`](documentation/) for the full overview,
features, usage, and architecture.

---

## Running locally (development)

Requires Node.js 22.9 or newer. Everything requires sign-in; there is no anonymous access.

```bash
# Backend (first time)
cd backend
npm install
node generate-certs.js                       # fresh TLS pair for this machine (never commit)
cp .env.example .env                         # then set SESSION_SECRET (command is in the file)
cp config/roles.example.json config/roles.json

# Terminal 1 — local login server (development only, accepts any username)
npm run dev:idp

# Terminal 2 — backend
npm run dev

# Terminal 3 — dashboard
cd frontend && npm install && npm run dev    # open http://localhost:5173
```

Sign in with `admin@argus.test`, `operator@argus.test` or `viewer@argus.test` (any password).
Roles: **viewer** can see the dashboard, photos, logs and live view; **operator** can also stream and
create/review alerts; **admin** can also add and remove case photos. Anyone not listed in
`config/roles.json` can sign in but is denied access.

Face photos and the activity log are stored privately in `backend/data/` (git-ignored) and are only
returned through signed-in API routes. If you have photos in the old `backend/dataset/` folder, they
are moved there automatically the first time the server starts. New uploads never overwrite an
existing photo: a second photo of "Jane Doe" is stored as `jane_doe_2.jpg`.

To use real accounts instead, set `ARGUS_AUTH_PROVIDERS=google` and/or `entra` in `backend/.env`
with the provider's client ID and secret (see `backend/.env.example`), and add each person to
`config/roles.json`.

### Granting access

Access is controlled by `backend/config/roles.json` (git-ignored). Each entry names the sign-in
provider, the person, and a role:

```json
{
  "users": [
    { "provider": "dev",    "email": "admin@argus.test",       "role": "admin" },
    { "provider": "google", "email": "jane@yourcompany.com",   "role": "operator" },
    { "provider": "entra",  "sub": "AAAAAAAAAAAAAAAAAAAAAIkzqFVrSaSaFHy782bbtaQ", "role": "viewer" }
  ]
}
```

- **Roles:** `viewer` (see everything), `operator` (+ stream, pair phones, create/review alerts),
  `admin` (+ add and remove case photos).
- **Matching:** by `email` for `dev` and `google` (Google verifies emails). For `entra`, use `sub`:
  ask the person to sign in once — the "Access not granted" screen and the server log show their
  `sub` — then add it.
- Changes apply on the next request; no restart needed. Removing someone revokes their access
  immediately. Anyone not listed can sign in but sees "Access not granted".

### Connecting a phone camera

Phones don't sign in; they are **paired** once and then stream with a device credential.

1. Run the backend with the default `ARGUS_BIND_HOST` (0.0.0.0) so the phone can reach it, on a
   trusted network only.
2. In the dashboard, open **Live Camera → External Phone → Pair a phone** (operator or admin).
3. On the phone, open the link shown (same Wi-Fi) and accept the certificate warning, or open
   `https://<your-lan-ip>:3000/stream-video` and type the one-time code. Codes expire after 10 minutes.
4. Tap **Start Camera**. The phone appears in the device list; select it to watch.

Each phone is its own stream: only that phone can stream into it, and viewers pick which phone to
watch. Remove a phone from the same panel to disconnect it immediately and revoke its credential.

---

## ⚠️ Security notice: face photos removed from git history (2026-11-21)

The history was rewritten again to remove every committed face photo, `logs.json` (names of
people matched) and `.env` file, from all commits on all branches. **All branches were
force-pushed and every commit ID changed.** Content is otherwise identical.

- **Re-clone** (recommended) or follow [Resyncing your local clone](#resyncing-your-local-clone).
  Do not push, merge or rebase anything built on the old history: that would put the photos back.
- The repository is public, so these files must be treated as already exposed. GitHub may still
  serve old commits by ID until GitHub Support purges them.
- Face photos now live only in `backend/data/` on each machine (git-ignored).

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

History was rewritten (most recently on 2026-11-21), so an existing clone has diverged and will
conflict on the next push. The simplest fix is a fresh clone. To keep your existing working
directory instead, back up any uncommitted work and any local face photos first, then:

```bash
git fetch origin --prune
git reset --hard origin/main   # repeat per branch you track
git reflog expire --expire=now --all && git gc --prune=now   # drop the old history locally
```

Any local branch still built on the old history must be recreated from the rewritten history
(cherry-pick your own commits onto it), never merged.
