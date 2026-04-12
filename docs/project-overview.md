# BlockVote — Project Overview

> A privacy-preserving, blockchain-based electronic voting system designed to eliminate election fraud, bribery, and result manipulation in high-stakes elections.

---

## The Problem

Traditional elections — both national and corporate — suffer from a set of fundamental vulnerabilities:

- **Vote buying and bribery**: In exchange for money, voters can prove to a briber how they voted, making coercion effective.
- **Result manipulation**: A central authority tallying votes can falsify results without detection.
- **Lack of transparency**: Voters have no way to independently verify that their vote was counted correctly.
- **Privacy vs. auditability tradeoff**: Systems that are fully transparent reveal individual votes, threatening voter anonymity. Systems that are opaque cannot be independently audited.

BlockVote solves all four problems simultaneously using a combination of blockchain technology and **zero-knowledge proofs (zk-SNARKs)**.

---

## What BlockVote Is

BlockVote is a web-based voting platform built on the Ethereum blockchain. It uses a cryptographic protocol called **MACI (Minimal Anti-Collusion Infrastructure)** to ensure that:

1. **No one can prove how they voted** — not even to a briber. This directly eliminates vote buying.
2. **Votes cannot be changed by anyone except the voter** — the smart contract enforces this.
3. **Results are mathematically proven correct** — the coordinator publishes a cryptographic proof (zk-SNARK) that anyone can verify, without revealing individual votes.
4. **The system is transparent on-chain** — all encrypted votes are recorded on the blockchain and are publicly auditable.

### Intended Use Cases

- **Egyptian national elections** — replacing paper ballots with a tamper-proof, privacy-preserving digital system
- **Corporate elections** — shareholder votes, board elections, employee polls with verifiable results
- **Organizational governance** — any context where result integrity and voter privacy both matter

---

## How It Works (Non-Technical Summary)

BlockVote's voting process has four stages:

### 1. Registration
A voter connects their crypto wallet and registers with the MACI smart contract. This records their public key on-chain, granting them voting rights.

### 2. Poll Creation
An admin account creates a poll with a title, candidates, voting type (single-choice, multi-candidate, or weighted), and scheduled start/end times. All of this is stored on-chain.

### 3. Voting
Registered voters browse active polls and cast their vote. Before the vote reaches the blockchain, it is **encrypted** using a shared key between the voter and a trusted coordinator. The encrypted vote (called a "message") is submitted on-chain. Because the vote is encrypted, no one — not the admin, not other voters, not a blockchain explorer — can see what option was chosen.

Voters may also **change their vote** at any time before the poll closes. This is a key anti-coercion feature: even if a briber forces a voter to vote a certain way, the voter can quietly change their vote afterward.

### 4. Tallying and Proof
After the poll closes:
1. The admin merges all vote messages.
2. The coordinator decrypts and tallies the votes using their private key.
3. A **zk-SNARK proof** is generated — a mathematical certificate proving the tally is correct.
4. The proof and results are published on-chain. Anyone can verify the result is correct without learning how any individual voted.

---

## Current Features (Implemented)

| Feature | Status |
|---|---|
| Voter registration via crypto wallet | ✅ Done |
| Poll creation with start/end dates | ✅ Done |
| Single-candidate polls | ✅ Done |
| Multi-candidate polls | ✅ Done |
| Simple weighted voting | ✅ Done |
| Vote changing while poll is open | ✅ Done |
| Admin dashboard with poll management | ✅ Done |
| Admin can pause/close polls early | ✅ Done |
| Candidate images and descriptions (via IPFS) | ✅ Done |
| zk-SNARK tally proof generation | ⚠️ Implemented, needs validation |
| Tally proof upload and result display | ⚠️ Partially working |
| Quadratic voting (voice credits) | 🔄 Implemented but planned for removal |

---

## Planned Features (Proposed Roadmap)

These features are proposed for future development and are not yet implemented:

| Feature | Description |
|---|---|
| National ID identity verification | Link voter registration to Egyptian national ID |
| Per-poll voter eligibility | Admin defines which registered voters can participate in each poll |
| Mobile application | Native iOS/Android app for voting on mobile |
| AI component | To be defined — possible use cases include fraud detection or result analysis |
| Public testnet / mainnet deployment | Currently runs on a local development blockchain |
| Automated testing suite | Unit and integration tests for smart contracts and frontend |

---

## Technical Stack (Summary)

| Layer | Technology |
|---|---|
| Blockchain | Ethereum (local Hardhat testnet; Sepolia/mainnet-compatible) |
| Smart Contracts | Solidity via MACI protocol |
| zk-SNARK Circuits | Circom + snarkjs (Groth16) |
| Frontend | Next.js (React) |
| File Storage | IPFS via Pinata (candidate metadata + tally proofs) |
| Development Framework | Scaffold-ETH 2 |

---

## Project Context

BlockVote is a graduation project built on top of the open-source [maci-wrapper](https://github.com/yashgo0018/maci-wrapper) starter template (Scaffold-ETH 2 + MACI). The team has significantly extended the starter with UI improvements, bug fixes, new features, and domain-specific customizations documented in the project's Jira board.

### Team
- [Karim Elmasry](https://github.com/karimelmasry42)
- [Amer Ashoush](https://github.com/Mororock6)
- [Omar Hamdy](https://github.com/OmarHamdy24)
- [Yousef Kamal](https://github.com/YxFarghaly)
- [Felopater Osama](https://github.com/Felopater75)

### Supervisor
Dr. Hesham Dahshan — Arab Academy for Science, Technology and Maritime Transport (AASTMT)
Cybersecurity Graduation Project, 2025–2026

---

*Last updated: April 2026*
