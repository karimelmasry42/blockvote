# BlockVote — CLAUDE.md

> Instructions for Claude Code. Read this before touching any file in this repo.

---

## What This Project Is

BlockVote is a graduation project: a privacy-preserving, blockchain-based voting system built on **Scaffold-ETH 2 + MACI** (Minimal Anti-Collusion Infrastructure). It uses **zk-SNARKs** (Groth16 via snarkjs/circom) to allow vote tallying without revealing individual votes, making voter bribery cryptographically impossible.

**Repo**: https://github.com/karimelmasry42/blockvote
Forked from: https://github.com/yashgo0018/maci-wrapper

Full architecture: see `docs/architecture.md`
Project overview (non-technical): see `docs/project-overview.md`
Cryptographic systems: see `docs/cryptography.md`

---

## Repo Structure

```
packages/
  hardhat/          → Solidity contracts, deployment scripts, zkeys, Hardhat tasks
    contracts/      → MACI contracts (mostly unmodified from upstream)
    deploy/         → Deployment scripts
    tasks/          → Hardhat tasks including merge, prove (tally flow)
    zkeys/          → zk-SNARK circuit parameter files (large, downloaded separately)
    contractAddresses.json   → Generated at deploy time, read by frontend
    coordinatorKeyPair.json  → KEEP SECRET. Generated at deploy time.
    .env.example    → Required env vars for Hardhat

  nextjs/           → Next.js frontend (React, TypeScript, Tailwind CSS)
    app/            → Next.js App Router pages
    components/     → Reusable React components
    hooks/          → wagmi/viem contract interaction hooks
    .env.example    → Required env vars for frontend
```

---

## How to Run Locally

```bash
# 1. Install dependencies (uses yarn workspaces)
yarn install

# 2. Download zk-SNARK circuit parameter files (large files, required for proof generation)
yarn download-zkeys

# 3. Copy and fill environment variables
cp packages/hardhat/.env.example packages/hardhat/.env
cp packages/nextjs/.env.example packages/nextjs/.env.local
# Edit both .env files — see Environment Variables section below

# 4. Terminal 1: Start local blockchain
yarn chain

# 5. Terminal 2: Deploy contracts
yarn deploy

# 6. Terminal 3: Start frontend
yarn start
# → http://localhost:3000
```

**Admin account**: Account 0 from the Hardhat local node. In MetaMask, import using the private key printed by `yarn chain`. This account is both the admin and the coordinator.

---

## Environment Variables

### `packages/hardhat/.env`
Copy from `.env.example`. Key variables:
- `DEPLOYER_PRIVATE_KEY` — account 0 private key from local testnet

### `packages/nextjs/.env.local`
Copy from `.env.example`. Key variables:
- `NEXT_PUBLIC_PINATA_GATEWAY` — Pinata gateway URL (for reading files stored on IPFS)
- `PINATA_JWT` — Pinata API JWT token (server-side only, used by `/api/pinata/upload` route for uploading tally files to IPFS). Do NOT prefix with `NEXT_PUBLIC_`.

---

## The zk-SNARK Tally Flow (Critical — Currently Broken)

After a poll closes, results are generated in three steps:

```bash
# Step 1: Merge signup and message trees
yarn hardhat merge --poll <POLL_ID>

# Step 2: Generate proof and tally file
# Update deploy-config.json first: set coordinatorPubkey and useQuadraticVoting
yarn hardhat prove \
  --poll <POLL_ID> \
  --output-dir . \
  --coordinator-private-key <KEY_FROM_coordinatorKeyPair.json> \
  --tally-file tally-poll-<POLL_ID>.json

# Step 3: Upload tally-poll-<POLL_ID>.json via Admin UI → Results appear
```

> ⚠️ **KNOWN CRITICAL BUG**: Step 2 currently fails with an "invalid file" error. Root cause unknown — likely related to zkey file paths, output directory config, or circuit parameter mismatch. **Fixing this is the highest priority technical task.** Do not mark done until the full flow (merge → prove → upload → results visible) works end-to-end.

---

## MACI Key Concepts (Read Before Editing Contracts)

- **Coordinator keypair**: Generated at deploy time, stored in `coordinatorKeyPair.json`. The coordinator decrypts votes — this key must never be exposed or committed. In the current setup, the deployer IS the coordinator.
- **Voice credits**: Every voter gets 100 credits via `ConstantInitialVoiceCreditProxy`. This is enforced at the contract level.
- **Gatekeeper**: Currently `FreeForAllGatekeeper` (anyone can register). Planned replacement: national ID gatekeeper.
- **Poll types**: The MACI contracts treat all votes as voice credit allocations — they do not distinguish between "single candidate" and "weighted" modes. Poll type logic currently lives in the frontend only. **This is a known security risk** — a malicious user can call the contract directly and bypass UI-enforced voting restrictions. See Known Issues.
- **Vote changing**: MACI natively supports this via key switching (the last valid message from a voter wins). This is NOT a custom implementation — do not remove or reimplement this logic.
- **Pause/close polls**: MACI natively ends polls at their scheduled end time. The ability for admins to **manually pause or close polls early** was added by the BlockVote team and is a custom feature — verify implementation before modifying.

---

## What the Team Has Changed From the Starter Repo

Confirmed changes (from Jira BLOCK project):

**Branding**: Renamed from "MACI Starter Kit" → "BlockVote" throughout (layout.tsx, favicon, metadata)

**Poll lifecycle**:
- Poll start and end times displayed on voting and change-vote pages
- Admin can manually pause and close polls early (custom feature — not in base MACI)
- Poll ID visible in admin tab
- "Voting hasn't started yet" message shown when poll is not yet active
- Poll list sorted newest-first in both voter and admin views

**Voting UI fixes**:
- Quadratic vote controls greyed out when poll is single-candidate type
- Bug fix: user could navigate back to home page and re-enter a poll to vote again after already voting (BLOCK-16, now fixed)
- Change vote button disappears when poll ends even if user stays on page
- Unnecessary transaction no longer sent when user opens "change vote" but makes no changes

**Candidate data**:
- Candidates have images and descriptions
- Images are stored as URLs (not uploaded files) — verify whether these are Pinata IPFS URLs or arbitrary external URLs
- Multiple candidates with same name: tested and works correctly (BLOCK-24, resolved)

**Results**:
- Single-candidate result page simplified

**Not yet done** (open Jira items):
- Main page content still refers to MACI in places (BLOCK-29)
- Null date input crash on poll creation (BLOCK-39)
- Pinata JWT workflow not documented in README (BLOCK-42)
- Identity verification not started (BLOCK-41)
- Architecture diagram not created (BLOCK-26)

---

## Voting Types — Important Constraints

| Type | Status | Notes |
|---|---|---|
| Single candidate | ✅ Working | Voter picks exactly one option |
| Multi-candidate | ✅ Working | Voter picks multiple options |
| Simple weighted | ✅ Working | Voter allocates up to 100 credits freely |
| Quadratic | 🚫 Must be disabled | Not appropriate for elections context |

**Quadratic voting must be disabled** — remove from UI and disable the contract path. It is designed for DAO token governance and is confusing/inappropriate for the election use case.

**Security note**: The 100 voice credit limit is enforced by `ConstantInitialVoiceCreditProxy` at the contract level. Poll type restrictions (e.g., preventing a "single candidate" voter from allocating credits to multiple options) are NOT yet enforced at the contract level — this is a security gap that needs to be addressed.

---

## Coding Conventions

- Language: **TypeScript** on frontend, **Solidity** on contracts
- Package manager: **yarn** (workspaces). Do not use npm or pnpm.
- Contract interaction hooks:
  - Prefer the Scaffold-ETH 2 wrappers (`useScaffoldContractRead`, `useScaffoldContractWrite`) for **named deployed contracts** configured through Scaffold-ETH (e.g. `MACIWrapper`).
  - Direct wagmi hooks (`useContractRead`, `useContractWrite`) may be used when the contract address is only known dynamically at runtime (e.g. per-poll `Poll` contracts) or in debug pages that intentionally expose lower-level contract interactions.
- Code style is enforced automatically before each git commit (ESLint + Prettier via lint-staged).
- Worktree branches must follow the Jira naming convention: `BLOCK-XX` (where XX is the Jira issue number).

---

## What NOT to Change Without Discussion

- MACI core contracts (`MACI.sol`, `Poll.sol`, `PollProcessorAndTallyer.sol`, `VkRegistry.sol`) — cryptographically sensitive; any change may break proof verification
- `.zkey` files — compiled zk-SNARK parameters; do not regenerate without redeploying `VkRegistry`
- `coordinatorKeyPair.json` — do not commit; do not regenerate without full redeployment
- Vote message encryption logic in the frontend — implements MACI ECDH key scheme; do not reimplement

---

## Known Issues and Security Gaps

| Issue | Severity |
|---|---|
| zk-SNARK proof generation fails (`yarn hardhat prove`) | 🔴 Critical |
| Full tally flow (merge → prove → upload → results) not validated end-to-end (upload step fixed — see `/api/pinata/upload` route) | 🟡 Medium |
| Poll type restrictions only enforced in UI — contract callable directly, bypassing rules | 🔴 Security gap |
| Admin = Coordinator (same account/key) — no separation of trust | 🟡 Medium |
| Voice credit limit (100) not configurable per poll | 🟡 Medium |
| Quadratic voting not yet disabled | 🟡 Medium |
| No automated tests | 🟡 Medium |
| Package vulnerabilities flagged by GitHub — triage needed | 🟡 Medium |
| Local testnet only, public testnet not yet tested | 🟠 Low |
| Null poll dates crash on creation (BLOCK-39) | 🟠 Low |

---

## Current Priority Tasks (as of April 2026)

1. 🔴 Fix zk-SNARK proof generation — debug `yarn hardhat prove` failure
2. 🔴 Validate full tally flow end-to-end — merge → prove → upload → results
3. 🔴 Investigate poll type enforcement — audit whether contract enforces poll type restrictions
4. 🟡 Disable quadratic voting — remove from UI and contract path
5. 🟡 Fix null date crash on poll creation (BLOCK-39)
6. 🟡 Document Pinata JWT setup in README (BLOCK-42)
7. 🟡 Write automated tests — contract unit tests (Hardhat/Chai) + frontend tests
8. 🟡 Triage package vulnerabilities — separate upstream MACI issues from project issues
9. 🟠 Test public testnet deployment (Sepolia)
10. 🟠 Document and plan admin/coordinator role separation

---

## How to Keep This File Updated

Update `CLAUDE.md` whenever a known issue is fixed, a feature is added, or setup steps change.
After a task: ask Claude Code *"Update CLAUDE.md to reflect what we just changed."*

---

*Last updated: April 2026*
