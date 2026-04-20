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
Smart contract reference: see `docs/smart-contracts.md`

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

## The zk-SNARK Tally Flow

After a poll closes, results are generated in three steps. **All Hardhat commands must be run from `packages/hardhat/`.**

> ⚠️ **Local Hardhat chain note**: Block timestamps only advance when blocks are mined, not in real time. If the merge step fails with "Voting period is not over" even though the poll appears closed in the UI, run `yarn hardhat run scripts/advance-time.ts --network localhost` to advance the chain clock by 1 hour.
>
> **Why this happens**: The admin's "Close Poll" button updates `MACIWrapper.endTime` (the UI state), but MACI's merge task checks the immutable `deployTime + duration` from the underlying `Poll.sol` contract. These are independent — closing a poll early in the UI does not change the on-chain poll duration.

```bash
cd packages/hardhat

# Step 1: Merge signup and message trees
yarn hardhat merge --poll <POLL_ID>

# Step 2: Generate proof and tally file
# Update deploy-config.json first: set coordinatorPubkey and useQuadraticVoting
yarn hardhat prove \
  --poll <POLL_ID> \
  --output-dir tally-output \
  --coordinator-private-key <KEY_FROM_coordinatorKeyPair.json> \
  --tally-file tally-output/tally-poll-<POLL_ID>.json

# Step 3: Upload tally-output/tally-poll-<POLL_ID>.json via Admin UI → Results appear
```

Output files go in `tally-output/` which is gitignored. Do not use `--output-dir .` as that places files in `packages/hardhat/` where they could be committed accidentally.

---

## MACI Key Concepts (Read Before Editing Contracts)

- **Coordinator keypair**: Generated at deploy time, stored in `coordinatorKeyPair.json`. The coordinator decrypts votes — this key must never be exposed or committed. In the current setup, the deployer IS the coordinator.
- **Voice credits**: Every voter gets 99 credits via `ConstantInitialVoiceCreditProxy` (`DEFAULT_INITIAL_VOICE_CREDITS = 99` in `packages/hardhat/deploy/00_initial_voice_credit_proxy.ts`). This is enforced at the contract level.
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
- Quadratic voting disabled
- Bug fix: user could navigate back to home page and re-enter a poll to vote again after already voting (BLOCK-16, now fixed)
- Change vote button disappears when poll ends even if user stays on page
- Unnecessary transaction no longer sent when user opens "change vote" but makes no changes

**Candidate data**:
- Candidates have images and descriptions
- Images are stored as URLs (not uploaded files) — verify whether these are Pinata IPFS URLs or arbitrary external URLs
- Multiple candidates with same name: tested and works correctly (BLOCK-24, resolved)

**Results**:
- Single-candidate result page simplified

---

## Voting Types — Important Constraints

| Type | Status | Notes |
|---|---|---|
| Single candidate | ✅ Working | Voter picks exactly one option |
| Multi-candidate | ✅ Working | Voter picks multiple options |
| Simple weighted | ✅ Working | Voter allocates up to 99 credits freely |

**Security note**: The 99 voice credit limit is enforced by `ConstantInitialVoiceCreditProxy` at the contract level. Poll type restrictions (e.g., preventing a "single candidate" voter from allocating credits to multiple options) are NOT yet enforced at the contract level — this is a security gap that needs to be addressed.

---

## Coding Conventions

- Language: **TypeScript** on frontend, **Solidity** on contracts
- Package manager: **yarn** (workspaces). Do not use npm or pnpm.
- Contract interaction hooks:
  - Prefer the Scaffold-ETH 2 wrappers (`useScaffoldContractRead`, `useScaffoldContractWrite`) for **named deployed contracts** configured through Scaffold-ETH (e.g. `MACIWrapper`).
  - Direct wagmi hooks (`useContractRead`, `useContractWrite`) may be used when the contract address is only known dynamically at runtime (e.g. per-poll `Poll` contracts) or in debug pages that intentionally expose lower-level contract interactions.
- Code style is enforced automatically before each git commit (ESLint + Prettier via lint-staged).
- A `.husky/pre-push` hook runs `next lint --max-warnings=0 && tsc --noEmit` against `packages/nextjs` for fast local feedback. It is worktree-aware (resolves `node_modules` via `git worktree list`). `--no-verify` bypasses it locally, but CI + branch protection re-enforce the same checks.
- ESLint rules in `packages/nextjs/.eslintrc.json` include `import/first` (no statements between imports) and Next's `@next/next/no-img-element` (use `next/image` with `unoptimized` for user-supplied URLs — see [PollDetail.tsx](packages/nextjs/components/PollDetail.tsx) for precedent).
- Worktree branches must follow the Jira naming convention: `BLOCK-XX` (where XX is the Jira issue number). Session/chore branches not tied to a Jira ticket may use a descriptive name (e.g. `ci-lint-hardening`).
- **Branch protection on `main` uses two systems simultaneously** — classic branch protection (`gh api repos/.../branches/main/protection`) AND rulesets (Settings → Rules → Rulesets). Both apply; changing one does not affect the other. Required status check: `ci (ubuntu-latest, lts/*)` from `.github/workflows/lint.yaml`. Review requirement currently set to 0.

---

## Linting and Type-Checking Workflow

**Run lint + type-check after every edit** to `packages/nextjs` before committing. The local-dev setup may silently pass a stale type cache that CI rebuilds from scratch — if you skip this step, a clean CI run can reject a PR for errors your machine doesn't surface.

### Commands (run from repo root)

```bash
yarn next:lint                    # ESLint with auto-fix disabled
yarn next:lint --fix              # ESLint with auto-fix (prettier, import order, unused imports)
yarn next:check-types             # tsc --noEmit --incremental (same as CI)
```

Or from `packages/nextjs/`:

```bash
./node_modules/.bin/next lint --max-warnings=0
rm -f tsconfig.tsbuildinfo && ./node_modules/.bin/tsc --noEmit   # force a clean check
```

Delete `tsconfig.tsbuildinfo` before running `tsc` when you suspect a stale cache — it occasionally lets broken code pass locally while CI fails.

### Fixing common issues

| Error shape | Fix |
|---|---|
| `prettier/prettier` formatting warnings | `yarn next:lint --fix` rewrites the file. |
| `import/first`, `import/order` | Run `--fix`; if imports must stay in a specific order (e.g. side-effect polyfill first), add `// eslint-disable-next-line import/order` sparingly. |
| `@next/next/no-img-element` | Replace `<img>` with `next/image`'s `Image` component. For user-supplied URLs, pass `unoptimized`. Precedent: [PollDetail.tsx](packages/nextjs/components/PollDetail.tsx). |
| `TS2786 'X cannot be used as a JSX component'` | Third-party type mismatch with `@types/react` 18 (seen with `react-copy-to-clipboard`). Prefer dropping the dep in favor of a native Web API over `as any` casts — the cast silences type checking everywhere the component is used. |
| `TS2345 address must be 0x\${string}` | Validate at the boundary with viem's `isAddress`, normalize with `getAddress`, and gate wagmi reads with `enabled: Boolean(address)` rather than asserting `as 0x\${string}`. See [[address]/page.tsx](packages/nextjs/app/blockexplorer/address/[address]/page.tsx) and [PollDetail.tsx](packages/nextjs/components/PollDetail.tsx) for precedent. |

### If CI fails after local passes

The usual cause is `tsconfig.tsbuildinfo` caching success. Reproduce CI conditions:

```bash
rm -f packages/nextjs/tsconfig.tsbuildinfo
yarn install                # ensures lockfile matches a fresh CI install
yarn next:check-types
yarn next:lint
```

If CI still diverges, check which `@types/*` versions CI resolves vs. your `node_modules` — a dependency upgrade can tighten third-party typings.

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
| Poll type restrictions only enforced in UI — contract callable directly, bypassing rules | 🔴 Security gap |
| Admin = Coordinator (same account/key) — no separation of trust | 🟡 Medium |
| Voice credit limit (100) not configurable per poll | 🟡 Medium |
| No automated tests | 🟡 Medium |
| Package vulnerabilities flagged by GitHub — triage needed | 🟡 Medium |
| Local testnet only, public testnet not yet tested | 🟠 Low |

---

## Current Priority Tasks (as of April 2026)

1. 🔴 Investigate poll type enforcement — audit whether contract enforces poll type restrictions
2. 🟡 Triage package vulnerabilities — separate upstream MACI issues from project issues
3. 🟠 Test public testnet deployment (Sepolia)
4. 🟠 Document and plan admin/coordinator role separation

---

## How to Keep This File Updated

Update `CLAUDE.md` whenever a known issue is fixed, a feature is added, or setup steps change.
After a task: ask Claude Code *"Update CLAUDE.md to reflect what we just changed."*

---

*Last updated: April 2026*
