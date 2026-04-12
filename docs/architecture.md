# BlockVote — Technical Architecture

> This document describes the system architecture of BlockVote, how its components interact, and the role of cryptographic primitives (MACI, zk-SNARKs) in the voting flow.

---

## System Overview

BlockVote is a decentralized application (dApp) composed of four main layers:

```
┌─────────────────────────────────────────────────────┐
│                   Next.js Frontend                   │
│         (Voter UI, Admin Dashboard, Results)         │
└──────────────────────┬──────────────────────────────┘
                       │ reads/writes via wagmi/viem
┌──────────────────────▼──────────────────────────────┐
│              Ethereum Smart Contracts                │
│     MACI · Poll · PollProcessorAndTallyer · etc.    │
└────────────┬──────────────────────┬─────────────────┘
             │ Hardhat RPC           │ IPFS CID stored on-chain
┌────────────▼──────────┐  ┌────────▼────────────────┐
│   Local Hardhat Node  │  │   IPFS via Pinata        │
│   (dev testnet)       │  │   (images, tally files)  │
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

**IPFS integration**: Candidate images and descriptions are stored on IPFS via Pinata. The frontend reads the `NEXT_PUBLIC_PINATA_GATEWAY` env variable to construct IPFS URLs. The admin upload flow for tally results also uses Pinata.

Environment config: `packages/nextjs/.env.example`

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
- Enforces the poll's start and end time
- Supports vote changing (voters can submit new messages overriding old ones)
- Stores the coordinator's public key

#### `PollProcessorAndTallyer.sol` (PPT)
Used after the poll closes. Responsibilities:
- Processes batches of encrypted messages
- Verifies the zk-SNARK proof submitted by the coordinator
- Records the final tally on-chain once the proof is verified

#### `VkRegistry.sol`
Stores the **verification keys** for the zk-SNARK circuits. These keys are generated during deployment from the pre-compiled circuit parameter files (`.zkey` files). They are used by PPT to verify proofs on-chain.

#### Gatekeeper Contract
Controls who can register. Currently uses `FreeForAllGatekeeper` (anyone with a wallet can register). Planned replacement: a custom gatekeeper that validates national ID.

#### `ConstantInitialVoiceCreditProxy.sol`
Assigns an initial voice credit balance to each voter upon registration. Currently set to **100 credits** (hardcoded). This is the basis for weighted and quadratic voting.

> ⚠️ **Known Issue**: The 100-credit limit is enforced at the contract level by this proxy, but it is not configurable per-poll and is not clearly communicated to voters in the UI. Quadratic voting logic is currently handled by the frontend only and should be moved to contract-level enforcement.

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
  │  (submit MACI pubkey)     │                            │
  │                          │                            │
  ├─ Encrypt vote ────────────► Poll.publishMessage()      │
  │  (ECDH shared key)        │  (encrypted msg stored)   │
  │                          │                            │
  │  [optional: change vote] │                            │
  ├─ Encrypt new vote ────────► Poll.publishMessage()      │
  │                          │                            │
  │         [poll ends]      │                            │
  │                          │                            │
  │                 Admin runs:│                            │
  │                  merge ───►                            │
  │                          │                            │
  │                          │◄── prove (off-chain) ──────┤
  │                          │    (decrypt, tally,        │
  │                          │     generate zk proof)     │
  │                          │                            │
  │                          │◄── upload tally.json ──────┤
  │                          │    PPT.verifyProof()        │
  │                          │    (on-chain verification) │
  │                          │                            │
  ├─ View results ◄───────────┤                            │
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

After a poll closes, the admin/coordinator runs these commands:

```bash
# Step 1: Merge the signup and message trees
yarn hardhat merge --poll <POLL_ID>

# Step 2: Generate the zk-SNARK proof and tally file
yarn hardhat prove \
  --poll <POLL_ID> \
  --output-dir . \
  --coordinator-private-key <COORDINATOR_PRIVATE_KEY> \
  --tally-file tally-poll-<POLL_ID>.json

# Step 3: Upload tally-poll-<POLL_ID>.json via the Admin UI
# This triggers on-chain verification and publishes results
```

> ⚠️ **Known Issue**: The proof generation flow currently fails with an "invalid file" error. Root cause not yet identified — suspected issue with zkey file paths or output directory configuration. The Pinata upload step (Step 3) has also not been validated end-to-end. This is a **critical bug** that must be resolved before the project can be considered functional.

#### The Pinata/IPFS Role
Pinata is used in two places:

1. **Candidate metadata**: When creating a poll, candidate images and descriptions are uploaded to IPFS via Pinata. The returned IPFS CID (content hash) is stored on-chain. The frontend reads it back using the `NEXT_PUBLIC_PINATA_GATEWAY` URL.

2. **Tally file**: After proof generation, the `tally.json` file is uploaded to IPFS via Pinata. The IPFS CID is then submitted to the smart contract to publish results. Environment variable: `PINATA_JWT` (server-side, not exposed to browser).

Both use the same Pinata account and API key. The JWT is used for uploads; the Gateway URL is used for reads.

---

## Voting Types

BlockVote supports three voting modes, configured per-poll at creation time:

| Mode | How It Works | Voice Credits Used |
|---|---|---|
| **Single candidate** | Voter picks exactly one option | 1 credit per vote |
| **Multi-candidate** | Voter picks multiple options, one vote each | 1 credit per selection |
| **Simple weighted** | Voter allocates credits across options freely | Up to 100 credits total |

> **Quadratic voting** (where cost = votes²) is currently implemented in the codebase but is planned for removal. It was designed for DAO token governance and is not appropriate for general elections. Its UI elements should be disabled/removed.

> **Credit limit**: All voters receive 100 voice credits via `ConstantInitialVoiceCreditProxy`. This is enforced at the contract level. The limit is not currently configurable per-poll.

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

## Known Issues and Technical Debt

| Issue | Severity | Notes |
|---|---|---|
| zk-SNARK proof generation fails | 🔴 Critical | `yarn hardhat prove` gives "invalid file" error |
| Admin = Coordinator (same key) | 🟡 Medium | Should be separated for security in production |
| Voice credit limit (100) not configurable | 🟡 Medium | Hardcoded in `ConstantInitialVoiceCreditProxy` |
| Quadratic voting not yet disabled | 🟡 Medium | UI and contract logic still present |
| No automated tests | 🟡 Medium | Manual testing only |
| Local testnet only | 🟡 Medium | No public testnet deployment tested |
| Null poll dates crash | 🟠 Low-Medium | BLOCK-39, input validation needed |
| Admin address not verified on-chain | 🟠 Low-Medium | Admin role assumed from account index, not enforced |

---

*Last updated: April 2026*
