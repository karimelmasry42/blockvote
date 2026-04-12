# 🗳️ BlockVote
### Secure Voting System using Blockchain and MACI (Minimal Anti-Collusion Infrastructure)

---

## 📘 Project Overview

**BlockVote** is a web-based platform designed to provide **secure, transparent, and tamper-resistant digital voting**.
The system leverages **blockchain** for immutable record-keeping and **Groth16 zk-SNARKs** for voter anonymity and anti-collusion.

Developed as part of the **AASTMT College of Computing and Information Technology – Cybersecurity Graduation Project (2025–2026)**, BlockVote demonstrates how decentralized technologies can ensure **trust**, **integrity**, and **verifiability** in modern digital elections.

---

## 🎯 Objectives

- Guarantee **data integrity** and prevent vote tampering through blockchain immutability.
- Ensure **voter anonymity** and **anti-collusion** using zero-knowledge cryptographic proofs.
- Provide a **user-friendly interface** for web-based voting.

---

## 🧠 Key Features

✅ Blockchain-based decentralized voting ledger
✅ Private, encrypted vote submission — no one can see how you voted
✅ Anti-collusion: voters cannot prove their vote to a briber
✅ Vote changing: voters can update their vote any time before the poll closes
✅ Multiple voting modes: single-candidate, multi-candidate, weighted
✅ Admin dashboard for poll management and result publishing
✅ Tamper-proof, cryptographically verified result auditing via zk-SNARKs

---

## 🧪 Technology Stack

**Frontend (dApp)**
- Next.js 15 + React 18 + TypeScript
- Web3 wallet integration: RainbowKit + wagmi + viem
- Styling: Tailwind CSS + daisyUI
- ZK-related libs: snarkjs, circomlib, @zk-kit/circuits

**Smart Contracts**
- Hardhat (TypeScript) + Solidity 0.8.20
- Deploy tooling: hardhat-deploy, hardhat-verify, typechain
- Networks: Alchemy RPC endpoints configured (Sepolia, mainnet, L2s)

**Privacy / ZK Voting Core**
- MACI stack: maci-contracts, maci-cli, maci-circuits, maci-crypto, maci-domainobjs, maci-core
- Proof system: Groth16 over BN254 curve via snarkjs
- Circuit parameters: downloaded separately via `yarn download-zkeys`

**File Storage**
- IPFS via Pinata (tally result files)

---

## 🧑‍💻 Team Members

- [**Karim Elmasry**](https://github.com/karimelmasry42)
- [**Amer Ashoush**](https://github.com/Mororock6)
- [**Omar Hamdy**](https://github.com/OmarHamdy24)
- [**Yousef Kamal**](https://github.com/YxFarghaly)
- [**Felopater Osama**](https://github.com/Felopater75)

**Supervisor:** Dr. Hesham Dahshan
*Arab Academy for Science, Technology and Maritime Transport (AASTMT)*

---

## ⚙️ Requirements

Ensure you have the following installed before proceeding:

- [Node.js (>= v18.17)](https://nodejs.org/en/download/)
- [Yarn (v1 or v2+)](https://classic.yarnpkg.com/en/docs/install/)
- [Git](https://git-scm.com/downloads)

---

## 🚀 Quickstart

### 1. Clone and Install

```bash
git clone https://github.com/karimelmasry42/blockvote.git
cd blockvote
yarn install
```

### 2. Download zk-SNARK Circuit Parameters

These are large parameter files required for proof generation. Download them once:

```bash
yarn download-zkeys
```

### 3. Configure Environment Variables

```bash
cp packages/hardhat/.env.example packages/hardhat/.env
cp packages/nextjs/.env.example packages/nextjs/.env.local
```

Edit `packages/hardhat/.env` and `packages/nextjs/.env.local` with your values.

**Required for result publishing (Pinata/IPFS):**
1. Create a free account at [pinata.cloud](https://pinata.cloud)
2. Generate an API key with full permissions
3. Add the following to `packages/nextjs/.env.local`:
   ```
   PINATA_JWT=<your Pinata JWT token>
   NEXT_PUBLIC_PINATA_GATEWAY=<your Pinata gateway URL>
   ```

### 4. Start a Local Blockchain

In terminal 1:

```bash
yarn chain
```

This starts a local Ethereum network via Hardhat. The first account printed is the **admin account** — import its private key into MetaMask to access admin features.

### 5. Deploy Contracts

In terminal 2:

```bash
yarn deploy
```

Contract addresses are saved to `packages/hardhat/contractAddresses.json`.
The coordinator keypair is saved to `packages/hardhat/coordinatorKeyPair.json`.

> ⚠️ **Security**: `coordinatorKeyPair.json` contains the private key used to decrypt all votes. Never commit this file to git and never share it.

### 6. Launch the Frontend

In terminal 3:

```bash
yarn start
```

Navigate to [http://localhost:3000](http://localhost:3000).

---

## 📊 Computing Results

After a poll closes, results must be generated and published in three steps.

### Step 1 — Merge

```bash
yarn hardhat merge --poll <POLL_ID>
```

Replace `<POLL_ID>` with the numeric ID of the poll (visible in the admin dashboard).

### Step 2 — Generate Proof

Before running this step, open `packages/hardhat/deploy-config.json` and confirm:
- `coordinatorPubkey` matches the public key in `packages/hardhat/coordinatorKeyPair.json`
- `useQuadraticVoting` is set to `false` (quadratic voting is not supported in this version)

Then run:

```bash
yarn hardhat prove \
  --poll <POLL_ID> \
  --output-dir . \
  --coordinator-private-key <COORDINATOR_PRIVATE_KEY> \
  --tally-file tally-poll-<POLL_ID>.json
```

- `<COORDINATOR_PRIVATE_KEY>` — the `privKey` field from `packages/hardhat/coordinatorKeyPair.json`
- `--tally-file` — name of the output file (use `tally-poll-<POLL_ID>.json` as convention)

This produces a `tally-poll-<POLL_ID>.json` file containing the vote counts and their zk-SNARK proof.

### Step 3 — Publish Results

1. Open the admin dashboard at [http://localhost:3000](http://localhost:3000)
2. Navigate to the closed poll
3. Upload the `tally-poll-<POLL_ID>.json` file
4. The file is stored on IPFS via Pinata and the result is published on-chain

Results are now publicly visible to all voters.

---

## 🗳️ Usage

After setup, you can:

- **Register** — connect a wallet and register to gain voting rights
- **Create Polls** — admin can create polls with candidates, voting type, and start/end times
- **Vote** — registered voters can cast votes in active polls; votes may be changed before the poll closes
- **Admin Dashboard** — manage polls, view status, pause or close polls early, upload tally results
- **View Results** — after the tally is published, results are visible to all with a cryptographic proof of correctness

---

## 🧪 Development Commands

```bash
# Run Hardhat tests (with gas reporting)
yarn test

# Lint
yarn next:lint        # Frontend ESLint
yarn hardhat:lint     # Contracts ESLint

# Format (Prettier)
yarn format           # Both packages

# Run a single test by name
yarn hardhat:test --grep "test description"
```

---

## 📁 Project Structure

```
packages/
  hardhat/                    → Smart contracts, deployment scripts, Hardhat tasks
    contracts/                → MACI contracts (mostly upstream, unmodified)
    deploy/                   → Deployment scripts
    tasks/                    → merge, prove (tally flow)
    zkeys/                    → zk-SNARK circuit parameters (downloaded separately)
    contractAddresses.json    → Generated at deploy time, read by frontend
    coordinatorKeyPair.json   → KEEP SECRET — never commit
  nextjs/                     → Next.js frontend
    app/                      → App Router pages (polls, vote, admin, results)
    components/               → Reusable UI components (DaisyUI + Tailwind)
    hooks/                    → wagmi/scaffold-eth contract interaction hooks
    contexts/AuthContext.tsx  → MACI keypair, stateIndex, registration state
    services/                 → Web3 utilities and state management
    types/poll.ts             → Poll type definitions
```

For detailed architecture and cryptographic documentation, see the `docs/` folder.

---

## 🤝 Contributing

Contributions are welcome. Please open an issue or submit a pull request.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).