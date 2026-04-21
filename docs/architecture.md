# BlockVote — Technical Architecture

> This document describes the system architecture of BlockVote, how its components interact, and the role of cryptographic primitives (MACI, zk-SNARKs) in the voting flow.
>
> For a per-contract reference (roles, edit-safety, known security gaps in the custom wrapper), see [smart-contracts.md](smart-contracts.md).

---

## System Overview

BlockVote is a decentralized application (dApp) composed of four main layers:

```
┌─────────────────────────────────────────────────────┐
│                   Next.js Frontend                  │
│         (Voter UI, Admin Dashboard, Results)        │
└──────────────────────┬──────────────────────────────┘
                       │ reads/writes via wagmi/viem
┌──────────────────────▼──────────────────────────────┐
│              Ethereum Smart Contracts               │
│     MACI · Poll · MessageProcessor · Tally · etc.   │
└────────────┬──────────────────────┬─────────────────┘
             │ Hardhat RPC          │ IPFS CID stored on-chain
┌────────────▼──────────┐  ┌────────▼────────────────┐
│   Local Hardhat Node  │  │   IPFS via Pinata       │
│   (dev testnet)       │  │   (tally files / JSON)  │
└───────────────────────┘  └─────────────────────────┘
```

---

## Components

### 1. Frontend — Next.js (`packages/nextjs/`)

Built with **Scaffold-ETH 2** conventions using Next.js (React), TypeScript, and Tailwind CSS.

Key pages and their responsibilities:

| Page / Component | Role |
|---|---|
| `/` | Landing page and voter registration |
| `/polls` | Lists all polls with status (not started / active / closed) |
| `/vote/[pollId]` | Voting interface for a specific poll |
| `/results/[pollId]` | Displays tally results after proof upload |
| `/admin` | Admin dashboard — create polls, manage status, upload tally |

The frontend interacts with the blockchain via **wagmi** and **viem** hooks (injected by Scaffold-ETH 2). It reads contract state (polls, registration status, results) and sends signed transactions (register, vote, change vote).

**IPFS integration**: The admin upload flow for tally results uses a server-side API route (`/api/pinata/upload`) to proxy uploads to Pinata, keeping the `PINATA_JWT` secret on the server. The frontend reads `NEXT_PUBLIC_PINATA_GATEWAY` to construct IPFS URLs when fetching tally JSON. Candidate images are stored as URLs in on-chain metadata (not uploaded by this app) — whether those URLs point to Pinata or arbitrary external hosts is up to the poll creator.

Environment config: `packages/nextjs/.env.example`

#### Frontend Architecture Patterns

**State management**:
- `contexts/AuthContext.tsx` — primary auth state. Holds the MACI keypair, stateIndex, and `isRegistered` flag. Always check this before assuming a user is registered.
- Zustand is available for local UI state (e.g. modal open/close).

**Web3 hook conventions** (Scaffold-ETH 2):
- Contract reads: `useScaffoldContractRead` from `hooks/scaffold-eth/`
- Contract writes: `useScaffoldContractWrite` from `hooks/scaffold-eth/`
- Do not call wagmi hooks directly for contract interactions — use the scaffold-eth wrappers.

**Poll data**:
- `useFetchPolls` / `useFetchPoll` — fetch and normalise poll data from the chain. Poll metadata is stored on-chain in `MACIWrapper.PollData.metadata` as a JSON string, which the frontend parses directly. The metadata contains candidate details (including image URLs) inline; only the tally JSON is uploaded to IPFS via Pinata.

**UI library**: Tailwind CSS + DaisyUI component library. Use DaisyUI class names before writing custom CSS.

**Poll types are frontend-only**: The contract has no concept of "single candidate", "multi-candidate", or "weighted". The frontend reads `pollType` from the on-chain `metadata` JSON string and uses it for UI behaviour only; it is not enforced on-chain. A user can bypass UI restrictions by calling the contract directly — this is a known security gap.

---

### 2. Smart Contracts — Solidity (`packages/hardhat/`)

BlockVote inherits MACI's contract architecture. The key contracts are:

#### `MACI.sol`
The root contract. Responsibilities:
- Tracks all registered voters (stores their public keys)
- Deploys new `Poll` contracts when the admin creates a poll
- Enforces that only registered users can vote

#### `Poll.sol`
One instance is deployed per poll. Responsibilities:
- Stores all encrypted vote messages submitted by voters
- Enforces the poll's **end** via the immutable `deployTime + duration` set at construction — `Poll` is live from the moment it is deployed
- Supports vote changing (voters can submit new messages overriding old ones)
- Stores the coordinator's public key

> The `startTime` shown in the UI is tracked in `MACIWrapper` (see [smart-contracts.md](smart-contracts.md)); `Poll.sol` itself does not gate submissions on a start time.

#### `MessageProcessor.sol` and `Tally.sol`
Current MACI splits the old `PollProcessorAndTallyer` into two per-poll contracts, each deployed by its own factory (`MessageProcessorFactory`, `TallyFactory`):
- **`MessageProcessor`** — the coordinator calls `processMessages(...)`, which verifies the `ProcessMessages` zk-SNARK proof via `Verifier` + `VkRegistry` and advances the message-processing state.
- **`Tally`** — once all messages are processed, the coordinator calls `tallyVotes(...)`, which verifies the `TallyVotes` zk-SNARK proof and records the final tally commitment on-chain.

#### `VkRegistry.sol`
Stores the **verification keys** for the zk-SNARK circuits. These keys are generated during deployment from the pre-compiled circuit parameter files (`.zkey` files). `MessageProcessor` and `Tally` read from this registry (through `Verifier`) to validate proofs.

#### Gatekeeper Contract
Controls who can register. Currently uses `FreeForAllGatekeeper` (anyone with a wallet can register). Planned replacement: a custom gatekeeper that validates national ID.

#### `ConstantInitialVoiceCreditProxy.sol`
Assigns an initial voice credit balance to each voter upon registration. Currently set to **99 credits** (`DEFAULT_INITIAL_VOICE_CREDITS` in `deploy/00_initial_voice_credit_proxy.ts`; `deploy-config.json` uses the same value). This is the basis for weighted voting.

> ⚠️ **Known Issue**: The 99-credit limit is enforced at the contract level by this proxy, but it is not configurable per-poll and is not clearly communicated to voters in the UI. Quadratic voting is disabled at the wrapper level (see [smart-contracts.md](smart-contracts.md)).

Contract addresses after deployment are saved to `packages/hardhat/contractAddresses.json`.

---

### 3. MACI Protocol — How Votes Are Kept Private

MACI (Minimal Anti-Collusion Infrastructure) is the cryptographic protocol that BlockVote is built on. Understanding it is essential to understanding why BlockVote is secure.

#### The Core Problem MACI Solves
In a naive on-chain voting system, all votes are public on the blockchain. This means a briber can verify that a voter voted as instructed. MACI eliminates this by making it **impossible for a voter to prove to anyone how they voted**.

#### Key Roles

**Voter**
- Has a MACI keypair (separate from their Ethereum wallet)
- Encrypts their vote using a shared key derived from their MACI private key and the coordinator's public key (ECDH key exchange)
- Submits the encrypted vote on-chain as a "message"
- Can submit a new message at any time to change their vote (key switching)

**Coordinator**
- Has a keypair (`coordinatorKeyPair.json`, generated at deployment — stored in `packages/hardhat/`)
- The coordinator's **public key** is embedded in every Poll contract
- After the poll closes, the coordinator uses their **private key** to decrypt all messages and determine each voter's final vote
- Runs the off-chain proof generation to produce the tally + zk-SNARK proof
- Uploads the tally file so results can be published on-chain

> ⚠️ **Current Setup**: The coordinator is the deployer account (account 0 on the local testnet). The coordinator private key is stored in `coordinatorKeyPair.json`. This key must be kept secret — anyone with this key can decrypt individual votes. In production, the coordinator role should be managed by a trusted, independent party or replaced with a decentralized MPC setup.

**Admin**
- The Ethereum account that deployed the MACI contract (account 0 on local testnet)
- Can create polls, pause polls, close polls early
- Triggers the merge step before proof generation
- Uploads the final tally file to publish results

> ⚠️ **Note**: Currently, admin = coordinator = account 0. In a real deployment these roles should be separated.

#### The Vote Flow in Detail

```
Voter                    Blockchain                  Coordinator
  │                          │                            │
  ├─ Register ───────────────► MACI.signUp()              │
  │  (submit MACI pubkey)    │                            │
  │                          │                            │
  ├─ Encrypt vote ────────────► Poll.publishMessage()     │
  │  (ECDH shared key)       │  (encrypted msg stored)    │
  │                          │                            │
  │  [optional: change vote] │                            │
  ├─ Encrypt new vote ────────► Poll.publishMessage()     │
  │                          │                            │
  │         [poll ends]      │                            │
  │                          │                            │
  │               Admin runs:│                            │
  │                  merge ───►                           │
  │                          │                            │
  │                          │◄── prove (off-chain) ──────┤
  │                          │    (decrypt, tally,        │
  │                          │     generate zk proof)     │
  │                          │                            │
  │                          │◄── upload tally.json ──────┤
  │                   Coordinator submits:│                │
  │                          │◄── processMessages(...) ───┤
  │                          │◄── tallyVotes(...) ────────┤
  │                          │  (proofs verified on-chain │
  │                          │   via Verifier+VkRegistry) │
  │                          │    (on-chain verification) │
  │                          │                            │
  ├─ View results ◄──────────┤                            │
```

#### Why Vote Changing Defeats Bribery
If a briber pays a voter to vote for option A, the voter can:
1. Submit a vote for A (satisfying the briber if they're watching)
2. Later submit a new encrypted message changing their vote to B

The briber has no way to verify the final vote — the encrypted messages on-chain are indistinguishable to anyone without the coordinator's private key. This is the fundamental anti-collusion property of MACI.

---

### 4. zk-SNARK Proof System

#### What a zk-SNARK Does Here
After tallying, the coordinator needs to publish results without revealing individual votes. A zk-SNARK (Zero-Knowledge Succinct Non-Interactive Argument of Knowledge) allows the coordinator to prove:

> "I correctly decrypted all messages, applied the key-switching rules, and the final tally is [X votes for A, Y votes for B, ...]"

...without revealing which voter chose which option.

#### Circuit Stack (from MACI)
MACI uses two main circuits, compiled with **Circom** and proven with **snarkjs (Groth16)**:

| Circuit | Purpose |
|---|---|
| `ProcessMessages` | Proves all vote messages were correctly processed (decrypted, key-switching applied) |
| `TallyVotes` | Proves the vote counts are a correct sum of processed messages |

The verification keys for these circuits are stored in the `VkRegistry` contract (registered during deployment from `.zkey` files in `packages/hardhat/zkeys/`).

#### Proof Generation Flow (Off-Chain)

After a poll closes, the admin/coordinator runs these commands from `packages/hardhat/`:

```bash
cd packages/hardhat

# Step 1: Merge the signup and message trees
yarn hardhat merge --poll <POLL_ID>

# Step 2: Generate the zk-SNARK proof and tally file
mkdir -p tally-output
yarn hardhat prove \
  --poll <POLL_ID> \
  --output-dir tally-output \
  --coordinator-private-key <COORDINATOR_PRIVATE_KEY> \
  --tally-file tally-output/tally-poll-<POLL_ID>.json

# Step 3: Upload tally-output/tally-poll-<POLL_ID>.json via the Admin UI
# This triggers on-chain verification and publishes results
```

Output files go in `tally-output/` (gitignored) to prevent accidental commits.

> **Local Hardhat chain timing**: The merge step checks the immutable `deployTime + duration` from `Poll.sol`, NOT the `endTime` in `MACIWrapper`. If the admin closes a poll early via the UI, MACI's merge task still waits for the original on-chain duration to elapse. On a local Hardhat node, block timestamps only advance when blocks are mined — use `yarn hardhat run scripts/advance-time.ts --network localhost` to force the clock forward.

#### The Pinata/IPFS Role

**Tally file**: After proof generation, the `tally.json` file is uploaded to IPFS via a server-side API route (`/api/pinata/upload`). The IPFS CID is then submitted to the smart contract to publish results. Environment variable: `PINATA_JWT` (server-side only, never exposed to the browser).


---

## Voting Types

BlockVote supports three voting modes, configured per-poll at creation time:

| Mode | How It Works | Voice Credits Used |
|---|---|---|
| **Single candidate** | Voter picks exactly one option | 1 credit per vote |
| **Multi-candidate** | Voter picks multiple options, one vote each | 1 credit per selection |
| **Simple weighted** | Voter allocates credits across options freely | Up to 99 credits total |


> **Credit limit**: All voters receive 99 voice credits via `ConstantInitialVoiceCreditProxy` (`DEFAULT_INITIAL_VOICE_CREDITS = 99` in `packages/hardhat/deploy/00_initial_voice_credit_proxy.ts`). This is enforced at the contract level. The limit is not currently configurable per-poll.

---

## Deployment Architecture (Current: Local Dev)

```
Developer machine
│
├── yarn chain          → starts local Hardhat node (port 8545)
├── yarn deploy         → deploys all MACI contracts, saves contractAddresses.json
│                          generates coordinatorKeyPair.json
└── yarn start          → starts Next.js dev server (port 3000)
```

All contract addresses are written to `packages/hardhat/contractAddresses.json` and picked up by the frontend automatically via Scaffold-ETH's configuration.

For public testnet deployment (Sepolia, etc.), the starter repo supports this via Hardhat network configs — not yet attempted by the BlockVote team.

---

## CI and Branch Protection

Lint and type-check enforcement happens in three layers, each catching what the previous layer might miss:

| Layer | Script | Bypassable? |
|---|---|---|
| Pre-commit (husky + lint-staged) | auto-format staged files | yes (`--no-verify`) |
| Pre-push (`.husky/pre-push`) | `next lint --max-warnings=0 && tsc --noEmit` on `packages/nextjs` | yes (`--no-verify`) |
| CI (`.github/workflows/lint.yaml`) | `yarn next:lint --max-warnings=0 && yarn next:check-types` | **no** — required status check on `main` |

The pre-push hook is worktree-aware — it resolves `node_modules` from the main worktree because `yarn install` is not re-run per worktree.

**Branch protection on `main`** is configured via two independent GitHub systems that both apply simultaneously:
- **Classic branch protection** (`gh api repos/.../branches/main/protection`) — enforces the required `ci (ubuntu-latest, lts/*)` status check, linear history, and admin enforcement.
- **Rulesets** (Settings → Rules → Rulesets) — additional rules including Copilot code review and code quality gates.

Changing review requirements or status checks in one system does not affect the other. When "merging is blocked" despite a ruleset update, check the classic protection too.

### Dev loop: lint + type-check after every edit

Before committing anything under `packages/nextjs/`, run:

```bash
yarn next:lint --max-warnings=0
yarn next:check-types
```

The incremental TS cache (`tsconfig.tsbuildinfo`) occasionally lets broken code pass locally while CI rebuilds from scratch and fails. If a PR's CI rejects changes that passed locally, delete the cache and re-run:

```bash
rm packages/nextjs/tsconfig.tsbuildinfo && yarn next:check-types
```

Prefer fixing the underlying type mismatch over `as any` casts — casts silence errors everywhere the value flows, not just at the site of the mismatch. When a third-party package's types are unavoidably broken (e.g. a library's `PureComponent<Props>` is missing fields that current `@types/react` requires), the lower-risk fix is usually to drop the dependency and inline the behavior using a native Web API, rather than shim the types.

### Address validation at route boundaries

User-supplied hex strings from route params (e.g. `[address]` dynamic segments) or from contracts that can return `undefined` during loading must not be cast directly to `` `0x${string}` ``. Instead:

- Validate with viem's `isAddress` and return `notFound()` (or render an error state) for invalid input.
- Normalize the hex with `getAddress` before passing it to downstream consumers so checksum casing is consistent.
- For wagmi hooks that take an address, use `enabled: Boolean(address)` so the hook doesn't fire against `undefined` during render.

Precedent: [blockexplorer/address/[address]/page.tsx](../packages/nextjs/app/blockexplorer/address/[address]/page.tsx), [PollDetail.tsx](../packages/nextjs/components/PollDetail.tsx).

---

## Known Issues and Technical Debt

| Issue | Severity | Notes |
|---|---|---|
| Admin = Coordinator (same key) | 🟡 Medium | Should be separated for security in production |
| Voice credit limit (99) not configurable per-poll | 🟡 Medium | Hardcoded in `ConstantInitialVoiceCreditProxy` deployment args |
| Local testnet only | 🟡 Medium | No public testnet deployment tested |
| Owner/admin operational hardening | 🟠 Low-Medium | Admin access is enforced on-chain via `MACIWrapper`'s `Ownable` owner, but production deployments should review owner management, role separation, and multisig use |

---

*Last updated: April 2026 — added CI/branch-protection section, lint-after-edit dev loop, and address-validation guidance*
