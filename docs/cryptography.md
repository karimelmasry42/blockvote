# BlockVote — Cryptographic Systems Reference

> This document catalogs every cryptographic primitive used in BlockVote: what it is, what problem it solves, where in the codebase it appears, when it is invoked, and who performs the operation.

---

## Overview

BlockVote uses cryptography at three distinct layers:

| Layer | Purpose | Primitives Used |
|---|---|---|
| **Blockchain** | Tamper-proof record keeping, transaction authentication | ECDSA, Keccak-256 |
| **MACI vote privacy** | Voter anonymity, anti-collusion, encrypted messaging | ECDH (Baby Jubjub), Poseidon hash, EdDSA |
| **zk-SNARK proof system** | Verifiable computation without revealing inputs | Groth16, BN254 curve, Circom circuits |

---

## 1. Blockchain Layer — Ethereum

### 1.1 ECDSA (Elliptic Curve Digital Signature Algorithm)

**What it is**: The signature scheme used by Ethereum accounts. Every transaction is signed with the sender's private key and verified using their public key (wallet address).

**What problem it solves**: Proves that a transaction (register, vote, create poll) was authorized by the owner of a wallet address. Prevents anyone from submitting transactions on behalf of another user.

**Curve**: secp256k1

**Where used**:
- Every on-chain interaction (voter registration, vote submission, poll creation)
- Handled transparently by MetaMask / RainbowKit / wagmi — the user never touches this directly

**Who performs it**: The voter's or admin's Ethereum wallet (MetaMask)

**When**: Every time a signed transaction is sent to the blockchain

---

### 1.2 Keccak-256

**What it is**: The hash function used natively by Ethereum (also called SHA-3 in its original form, though Ethereum's variant is slightly different).

**What problem it solves**: Produces fixed-size fingerprints of data. Used internally by Solidity for storage slot computation, event topic IDs, and general hashing.

**Where used**:
- Internally by Solidity smart contracts (automatic)
- Used in `abi.encodePacked(...)` patterns in contracts
- ABI encoding of function calls uses keccak-256 for function selectors

**Who performs it**: Ethereum Virtual Machine (EVM), automatically

**When**: During contract execution on-chain

---

## 2. MACI Layer — Vote Privacy and Anti-Collusion

### 2.1 Baby Jubjub Elliptic Curve

**What it is**: A twisted Edwards elliptic curve defined over the BN254 scalar field. Designed specifically to be efficient inside zk-SNARK circuits.

**What problem it solves**: Provides the mathematical foundation for ECDH key exchange and EdDSA signatures within the MACI protocol. Standard Ethereum curves (secp256k1) are not efficient inside zk circuits — Baby Jubjub is.

**Where used**:
- `maci-crypto` library (MACI keypair generation)
- MACI Circom circuits

**Who performs it**: The MACI library on the client side (when a voter registers, their MACI keypair is generated using this curve)

**When**: At voter registration (keypair generation) and at vote submission (key derivation for ECDH)

---

### 2.2 ECDH — Elliptic Curve Diffie-Hellman Key Exchange (Baby Jubjub)

**What it is**: A key agreement protocol that allows two parties to independently compute a shared secret using each other's public keys.

**What problem it solves**: Allows a voter and the coordinator to share a symmetric encryption key without ever transmitting it. This key is used to encrypt the voter's vote before it goes on-chain, so no one except the coordinator can read it.

**How it works in MACI**:
1. Every voter has a Baby Jubjub keypair (generated at registration)
2. The coordinator has a Baby Jubjub keypair (generated at deployment)
3. When a voter votes, they compute: `sharedKey = ECDH(voterPrivKey, coordinatorPubKey)`
4. The coordinator later computes: `sharedKey = ECDH(coordinatorPrivKey, voterPubKey)`
5. Both arrive at the same shared key — this is used to encrypt/decrypt the vote message

**Where used**:
- Frontend: vote encryption before submission (`maci-crypto` library)
- Coordinator off-chain: vote decryption during tallying

**Who performs it**:
- **Voter** (client-side, in browser) — encrypts their vote
- **Coordinator** (off-chain, during `yarn hardhat prove`) — decrypts votes for tallying

**When**: At vote submission (voter side) and at proof generation after poll closes (coordinator side)

---

### 2.3 Poseidon Hash Function

**What it is**: A zk-SNARK-friendly hash function designed to be computationally efficient inside arithmetic circuits. Operates over finite field elements rather than bytes.

**What problem it solves**: Standard hash functions (SHA-256, Keccak) are expensive to represent as arithmetic circuits. Poseidon is designed to minimize constraint count, making it practical inside zk proofs.

**Where used**:
- Building the **message tree** (Merkle tree of encrypted votes stored on-chain)
- Building the **state tree** (Merkle tree of registered voters)
- Vote message commitment construction
- Deployed as standalone contracts: `PoseidonT3`, `PoseidonT4`, `PoseidonT5`, `PoseidonT6` (parameter variants)

**Who performs it**:
- EVM (on-chain) for tree updates when votes are submitted
- Circom circuits (inside zk proofs) for verifying tree integrity

**When**: Every time a vote message is published on-chain, and during proof generation

---

### 2.4 EdDSA — Edwards-curve Digital Signature Algorithm (Baby Jubjub)

**What it is**: A digital signature scheme operating over the Baby Jubjub curve, efficient inside zk circuits.

**What problem it solves**: Allows voters to sign their vote messages, proving the message genuinely came from the holder of that MACI keypair. This is what enables **vote changing** — a new signed message from the same keypair supersedes the old one.

**Where used**:
- Frontend: vote messages are signed before encryption and submission
- Circom `ProcessMessages` circuit: verifies message signatures during proof generation

**Who performs it**:
- **Voter** (client-side) — signs every vote message using their MACI private key
- **Circom circuit** — verifies signatures as part of the zk proof

**When**: At vote submission, and verified during proof generation

---

## 3. zk-SNARK Layer — Verifiable Tally

### 3.1 Groth16

**What it is**: A specific zk-SNARK proof system (a proving scheme). Produces small, fast-to-verify proofs given a circuit and a witness.

**What problem it solves**: Allows the coordinator to prove they correctly processed and tallied all votes without revealing any individual vote. The proof is published on-chain and verified by the smart contract.

**Properties**:
- Proof size: ~200 bytes (very small, cheap to verify on-chain)
- Requires a **trusted setup** (powers of tau ceremony) specific to each circuit
- Verification is fast — done on-chain in the `PollProcessorAndTallyer` contract

**Curve**: BN254 (alt_bn128) — natively supported by the Ethereum EVM as a precompile

**Where used**:
- Off-chain proof generation: `yarn hardhat prove` (uses snarkjs)
- On-chain proof verification: `PollProcessorAndTallyer.sol` calls the `Verifier` contract

**Who performs it**:
- **Coordinator** (off-chain) — generates the proof using `snarkjs groth16 prove`
- **EVM / Verifier contract** (on-chain) — verifies the proof when tally is submitted

**When**: After poll closes, during `yarn hardhat prove`, and again on-chain when the tally file is uploaded

---

### 3.2 Circom Circuits

**What they are**: Domain-specific programs that define the arithmetic constraints the zk proof must satisfy. They are compiled into R1CS (rank-1 constraint systems) and then into `.zkey` files used by snarkjs.

**The two main circuits in MACI**:

| Circuit | What it proves |
|---|---|
| `ProcessMessages` | All vote messages were correctly decrypted, key-switching was applied correctly, and the resulting state tree is valid |
| `TallyVotes` | The vote counts are a correct sum of all processed messages |

**Where used**:
- `.zkey` files in `packages/hardhat/zkeys/` (compiled circuit parameters — downloaded via `yarn download-zkeys`)
- `VkRegistry.sol` stores the **verification keys** extracted from the `.zkey` files at deployment
- `PollProcessorAndTallyer.sol` uses the verification keys to verify proofs

**Who performs it**:
- **Coordinator** (off-chain) — runs circuits as part of proof generation
- **VkRegistry / PPT contracts** (on-chain) — use verification keys to verify proofs

**When**: During deployment (verification keys registered), during `yarn hardhat prove` (circuit execution), and during tally upload (on-chain verification)

---

### 3.3 Trusted Setup (Powers of Tau)

**What it is**: A one-time ceremony required by Groth16 to generate the circuit parameters (`.zkey` files). Multiple participants contribute randomness; as long as at least one participant destroys their contribution, the system is secure.

**What problem it solves**: Groth16 requires a circuit-specific common reference string (CRS). The trusted setup generates this securely.

**In BlockVote's context**: The `.zkey` files used are pre-generated by the MACI team and downloaded via `yarn download-zkeys`. BlockVote does not run its own trusted setup — it inherits MACI's.

**Security note**: The security of the zk proof system depends on the integrity of the trusted setup. If BlockVote were to be used in production national elections, a new, independently verified trusted setup should be conducted.

---

## 4. IPFS Content Addressing

### 4.1 CID — Content Identifier (SHA-256 based)

**What it is**: IPFS identifies files by their content hash rather than their location. The CID is derived from the SHA-256 hash of the file content.

**What problem it solves**: Guarantees that a file retrieved from IPFS matches exactly what was stored — if anyone modifies the file, the CID changes and the link breaks. This makes IPFS-stored content tamper-evident.

**Where used**:
- Tally result files (`tally-poll-<ID>.json`) uploaded to Pinata/IPFS after proof generation
- The CID is submitted on-chain so anyone can independently retrieve and verify the tally

**Who performs it**: Pinata IPFS service (automatic when file is uploaded)

**When**: During tally file upload via admin UI

---

## 5. Summary Table

| Primitive | Library / Tool | Where | Who | When |
|---|---|---|---|---|
| ECDSA (secp256k1) | MetaMask / wagmi | Every tx | Voter / Admin wallet | Every blockchain interaction |
| Keccak-256 | EVM (built-in) | Contracts | EVM | During contract execution |
| Baby Jubjub ECDH | maci-crypto | Frontend | Voter (encrypt), Coordinator (decrypt) | Vote submission & tallying |
| Baby Jubjub EdDSA | maci-crypto + circom | Frontend + circuits | Voter (sign), Circuit (verify) | Vote submission & proof gen |
| Poseidon hash | maci-contracts + circom | Contracts + circuits | EVM + Coordinator | Vote storage & proof gen |
| Groth16 (BN254) | snarkjs + Verifier.sol | Off-chain + on-chain | Coordinator (prove), EVM (verify) | After poll closes |
| Circom circuits | snarkjs | Off-chain | Coordinator | During `yarn hardhat prove` |
| SHA-256 / CID | IPFS / Pinata | File layer | Pinata | Tally file upload |

---

## 6. Key Management Summary

| Key | Where Stored | Who Has Access | Risk if Exposed |
|---|---|---|---|
| Voter Ethereum private key | MetaMask (user's device) | Voter only | Attacker can register/vote as that voter |
| Voter MACI private key | Browser memory (session) | Voter only | Attacker can submit fake vote-change messages as that voter |
| Coordinator private key | `coordinatorKeyPair.json` | Deployer (admin) | **All individual votes can be decrypted — full privacy breach** |
| Deployer private key | `.env` file | Dev team | Attacker can deploy new contracts, drain testnet funds |
| Pinata JWT | `.env.local` | Dev team | Attacker can upload/delete files from Pinata account |

> ⚠️ **`coordinatorKeyPair.json` must never be committed to git.** It should be in `.gitignore`. Verify this is the case.

---

*Last updated: April 2026*
