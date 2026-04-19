# Smart Contracts

Reference for every contract that participates in BlockVote's on-chain flow, with a focus on the zk-SNARK tally path. For the broader system design see [architecture.md](architecture.md); for circuit-level details see [cryptography.md](cryptography.md).

---

## Summary table — deployed contracts

These are the contracts actually deployed on-chain by `yarn deploy` (see `packages/hardhat/deploy/`). Per-poll contracts (`Poll`, `MessageProcessor`, `Tally`) are deployed dynamically by the corresponding factories when `MACIWrapper.createPoll(...)` is called.

| Contract | Origin | Location | Role | Safe to edit? |
|---|---|---|---|---|
| `MACIWrapper` | Custom (BlockVote) | `packages/hardhat/contracts/maci-contracts/MACIWrapper.sol` | Deploys polls, stores app-level metadata, gates admin actions | ✅ Yes — app-layer only |
| `MACI` | Upstream MACI (inherited by `MACIWrapper`) | `node_modules/maci-contracts/contracts/MACI.sol` | Signup registry; owns state tree; SNARK public-input source | 🚫 No |
| `Poll` | Upstream, deployed by `PollFactory` per poll | `node_modules/maci-contracts/contracts/Poll.sol` | Accepts encrypted vote messages; owns message tree | 🚫 No |
| `MessageProcessor` | Upstream, per poll | `node_modules/maci-contracts/contracts/MessageProcessor.sol` | Verifies `processMessages` proof | 🚫 No |
| `Tally` | Upstream, per poll | `node_modules/maci-contracts/contracts/Tally.sol` | Verifies `tallyVotes` proof; commits tally | 🚫 No |
| `PollFactory` | Upstream MACI | `node_modules/maci-contracts/contracts/PollFactory.sol` | Deploys `Poll` instances with correct params | 🚫 No |
| `MessageProcessorFactory` | Upstream MACI | `node_modules/maci-contracts/contracts/MessageProcessorFactory.sol` | Deploys `MessageProcessor` per poll | 🚫 No |
| `TallyFactory` | Upstream MACI | `node_modules/maci-contracts/contracts/TallyFactory.sol` | Deploys `Tally` per poll | 🚫 No |
| `VkRegistry` | Upstream MACI | `node_modules/maci-contracts/contracts/VkRegistry.sol` | Stores verifying keys derived from `.zkey` files | 🚫 No |
| `Verifier` | Upstream MACI | `node_modules/maci-contracts/contracts/crypto/Verifier.sol` | Groth16 pairing check | 🚫 No |
| `ConstantInitialVoiceCreditProxy` | Upstream MACI | `node_modules/maci-contracts/contracts/initialVoiceCreditProxy/ConstantInitialVoiceCreditProxy.sol` | Issues 100 voice credits per voter | 🚫 No (replace, don't edit) |
| `FreeForAllGatekeeper` | Upstream MACI | `node_modules/maci-contracts/contracts/gatekeepers/FreeForAllGatekeeper.sol` | Signup gate (to be replaced by national-ID gatekeeper) | 🚫 No (replace, don't edit) |
| `PoseidonT3` / `T4` / `T5` / `T6` | Upstream MACI | `node_modules/maci-contracts/contracts/crypto/PoseidonTN.sol` | Poseidon hash libraries (2/3/4/5 inputs) linked into MACI/Poll | 🚫 No |

Deploy order is numbered in the filenames: voice-credit proxy → gatekeepers → Verifier → Poseidon → three factories → MACI(Wrapper) → VkRegistry → `configure` (calls `MACIWrapper.setConfig`) → address-file + ABI generation.

---

## MACIWrapper — the only custom contract

File: [`packages/hardhat/contracts/maci-contracts/MACIWrapper.sol`](../packages/hardhat/contracts/maci-contracts/MACIWrapper.sol)

Extends `MACI` and adds application-level concerns that don't belong in the cryptographic core:

- **Admin gating** via OpenZeppelin `Ownable` — `createPoll`, `updatePollTallyCID`, `pausePoll`, `resumePoll`, `closePoll`, `setConfig` are all `onlyOwner`.
- **Poll metadata**: name, options, description/metadata, start time, end time, tally CID, paused flag — stored per-poll in `_polls`.
- **Pause / resume / close** bookkeeping flags for admin UX.
- **Start-time** parameter on `createPoll` (poll is scheduled to open in the future).
- **Quadratic-voting disable**: `createPoll` requires `Mode.NON_QV`.
- **Duplicate-pubkey prevention**: `signUp` override with `isPublicKeyRegistered` mapping.
- **Pagination helpers** (`fetchPolls`, `fetchPoll`) for the admin and voter UIs.

Anything that affects signup state, vote message format, tree depths, or coordinator key handling is left to `MACI`/`Poll` and must not be reimplemented here.

### Known security gaps in the custom features

The wrapper's pause/close/startTime flags are stored only on `MACIWrapper` — the underlying `Poll.sol` never reads them. A voter who knows the poll contract address (it is public, and emitted in `PollCreated`) can call `Poll.publishMessage(...)` directly and bypass these UI-level guards.

| Feature | Enforced on-chain for direct calls? | Notes |
|---|---|---|
| `pausePoll` / `resumePoll` | 🔴 No | Cosmetic flag; `Poll` still accepts votes. |
| `closePoll` | 🔴 No | Wrapper `endTime` moves; inner `Poll.deployTime + duration` is immutable. Same asymmetry that forces the `advance-time.ts` workaround for `merge`. |
| `_startTime` | 🟡 No | `Poll` is live from deployment; users can vote before the announced start. |
| QV disable | 🟡 Partial | `createPoll` blocks `Mode.QV`, but inherited `MACI.deployPoll(...)` is public and ungated — an attacker can deploy a QV poll directly. |
| `onlyOwner` on admin fns | ✅ Yes | Standard OZ Ownable. |
| Duplicate pubkey on signup | ✅ Yes | `isPublicKeyRegistered` mapping. |
| 100 voice credit cap | ✅ Yes | Enforced by `ConstantInitialVoiceCreditProxy`. |

**Durable fix path**: introduce a `Poll` subclass whose `publishMessage` consults wrapper state, and register it through a custom `PollFactory` wired via `setConfig`. This keeps the circuits (`processMessages`, `tallyVotes`) and their verifiers untouched while closing the bypasses in one place. See [architecture.md](architecture.md) for how the factories are wired.

---

## Upstream MACI contracts

These live in `node_modules/maci-contracts/contracts/` and are installed via the `maci-contracts` npm package. They are **not** checked into the repo and would be overwritten on any `yarn install` — do not edit them in place. Any change that affects state tree structure, message format, or verifier math will break proof generation (`yarn hardhat prove`) and/or on-chain verification.

### `MACI.sol`

The root registry. Tracks signups into a state AccQueue, holds the signup state-tree root, and deploys polls via `PollFactory` / `MessageProcessorFactory` / `TallyFactory`. The state-tree root is a public input to the `processMessages` SNARK — changing how signups are processed invalidates every proof.

`MACIWrapper` inherits from this and forwards its constructor args (`_pollFactory`, `_messageProcessorFactory`, `_tallyFactory`, `_signUpGatekeeper`, `_initialVoiceCreditProxy`, `_stateTreeDepth`, `_emptyBallotRoots`). When upstream MACI bumps its constructor signature (it has twice: `TopupCredit` removal, `_emptyBallotRoots` addition), the wrapper must update in lockstep or deploys fail.

### `Poll.sol`

Per-poll contract created by `PollFactory`. Exposes `publishMessage(Message, PubKey)` — the entry point for encrypted votes — and owns the message AccQueue. Immutable parameters include `deployTime`, `duration`, `coordinatorPubKey`, and tree depths. The message-tree root becomes a public input to the `processMessages` proof after merging.

### `MessageProcessor.sol`

Consumes merged message-tree roots from `Poll` and calls `Verifier` with the `processMessages` verifying key pulled from `VkRegistry`. Enforces ordering: messages must be processed in batches and the on-chain state commitment must match the SNARK's public outputs at each step. There is no admin lever that can "skip" a batch without a valid proof.

### `Tally.sol`

Consumes the state commitments emitted by `MessageProcessor` and verifies the `tallyVotes` proof (again via `Verifier` + `VkRegistry`). Commits the final tally commitment on-chain; the plaintext tally JSON is uploaded off-chain and its CID stored via `MACIWrapper.updatePollTallyCID`. (Older MACI documentation calls this contract `PollProcessorAndTallyer`; it was split into `MessageProcessor` + `Tally` in a recent version.)

### `VkRegistry.sol`

Stores Groth16 verifying keys, keyed by `(stateTreeDepth, messageTreeDepth, voteOptionTreeDepth, messageBatchSize, mode)`. The keys are derived from the `.zkey` files in `packages/hardhat/zkeys/` at deploy time. The mode field is how QV vs non-QV polls pick the right verifying key — both `processMessages` and `tallyVotes` circuits have QV and non-QV variants.

**Regeneration coupling**: if the `.zkey` files are regenerated (different circuit, different powers of tau, etc.) the `VkRegistry` must be redeployed with the new keys. Otherwise verification will fail with no clear error beyond "invalid proof".

### `Verifier.sol`

Stateless Groth16 pairing-check math. No storage, no admin. Editing this guarantees every proof is rejected (or, worse, accepts invalid proofs).

### `ConstantInitialVoiceCreditProxy`

Returns a fixed voice-credit allocation per signup. BlockVote deploys this with the constant `100`. Enforced at signup time by `MACI` — there is no code path that lets a voter acquire more than 100 credits.

### `FreeForAllGatekeeper`

Current signup gate: approves every address. Planned replacement: a national-ID gatekeeper that checks an eligibility proof before admitting a signup. Swapping the gatekeeper is a constructor-time decision — it does not require circuit changes because the SNARK only sees the resulting state leaves, not how they were admitted.

---

## Factories

Per-poll contracts are deployed through factories so that `MACIWrapper.createPoll(...)` ends up with a matching `(Poll, MessageProcessor, Tally)` triple wired to the same coordinator key, tree depths, and mode (QV vs non-QV).

- **`PollFactory.sol`** — `node_modules/maci-contracts/contracts/PollFactory.sol`. Deploys a fresh `Poll` contract and returns its address. Takes `TreeDepths`, `coordinatorPubKey`, `_duration`, mode, etc.
- **`MessageProcessorFactory.sol`** — deploys a `MessageProcessor` bound to that poll, the `Verifier`, and the `VkRegistry`.
- **`TallyFactory.sol`** — deploys a `Tally` bound to the same verifier + registry + message processor.

`MACI.deployPoll(...)` atomically invokes all three and emits the resulting addresses. `MACIWrapper` stores them in `PollData.pollContracts` so the UI can look up the per-poll `MessageProcessor` / `Tally` addresses when running the merge + prove flow.

**Don't edit.** The factories hard-wire the constructor argument order the core contracts expect; drift here breaks deploys and, if it compiled, would break proofs.

---

## Cryptographic libraries

These are *libraries*, not stateful contracts, but they are deployed and linked at deploy time because they contain the expensive math for MACI's tree and SNARK operations.

- **`PoseidonT3.sol`, `PoseidonT4.sol`, `PoseidonT5.sol`, `PoseidonT6.sol`** — `crypto/`. Poseidon hash permutations for 2, 3, 4, and 5 inputs respectively. Poseidon is the zk-friendly hash used inside the MACI circuits, so the on-chain implementations must produce byte-identical outputs to the circom version — never edit.
- **`Hasher.sol`** — wrappers around Poseidon that expose `hashN`, `hashLeftRight`, and the domain-separated hashes used for state leaves, message leaves, and ballot leaves.
- **`BabyJubJub.sol`** — curve arithmetic for the Baby Jubjub curve, used for MACI's ECDH key exchange between voters and the coordinator.
- **`Pairing.sol`** — elliptic-curve pairing helpers consumed by `Verifier.sol`.
- **`SnarkCommon.sol`** — shared types (`VerifyingKey`, `G1Point`, `G2Point`) used by `Verifier` and `VkRegistry`.
- **`SnarkConstants.sol`** — field modulus (`SNARK_SCALAR_FIELD`) and other compile-time constants. Editing this would change the entire cryptographic universe the contracts operate in — do not touch.
- **`MockVerifier.sol`** — used only in upstream MACI tests; always accepts proofs. BlockVote's deploy scripts use the real `Verifier`.

---

## Merkle trees / AccQueue

MACI batches signups and vote messages into large Merkle trees. Inserts are cheap (enqueue into an "acc queue"); merges (computing roots) happen once at poll close.

- **`trees/AccQueue.sol`** — abstract base for the accumulator queue.
- **`AccQueueBinary.sol` / `AccQueueQuinary.sol`** — binary (2-ary) vs quinary (5-ary) trees. MACI uses both: state tree is typically quinary, message tree is typically binary.
- **`AccQueueBinary0.sol` / `AccQueueBinaryMaci.sol` / `AccQueueQuinary0.sol` / `AccQueueQuinaryBlankSl.sol` / `AccQueueQuinaryMaci.sol`** — concrete instances with different zero-value conventions (all-zero leaves vs MACI-specific blank state leaves). The correct pair of AccQueue contracts is selected at `PollFactory` / `MACI` construction.
- **`LazyIMT.sol`** — an "incremental Merkle tree" variant used for the ballot tree.
- **`trees/zeros/Merkle*.sol`** — pre-computed zero subtrees used to initialize empty AccQueues cheaply.

All of the above are consumed by `MACI` and `Poll`. Their structure is baked into the SNARK circuits (tree depth, arity, zero convention) — changes here must be matched by new circuits + zkeys + a fresh `VkRegistry` deploy.

---

## Utilities & shared types

- **`utilities/DomainObjs.sol`** — the `PubKey`, `Message`, `StateLeaf`, `Ballot` structs shared between MACI and the circuits. These *define the vote message format* — changes are a circuit break.
- **`utilities/Params.sol`** — the `TreeDepths`, `MaxValues`, `ExtContracts` structs passed through constructors.
- **`utilities/Utilities.sol`** — leaf-hash helpers (`hashStateLeaf`, `hashMessage`, `padAndHashMessage`) used by both `MACI` and `Poll`. Must match the circuit's hash schema.
- **`utilities/CommonUtilities.sol`** — small helpers used by `MessageProcessor` and `Tally` (e.g. voting-period checks).
- **`utilities/SignUpToken.sol`** — a simple ERC721 that the `SignUpTokenGatekeeper` uses as a proof-of-eligibility token. BlockVote does not deploy it today (we use `FreeForAllGatekeeper`); listed here because it's the natural template if the eventual national-ID gatekeeper issues an on-chain token.

---

## Available gatekeepers (alternatives to `FreeForAllGatekeeper`)

All implement the `SignUpGatekeeper` interface (`gatekeepers/SignUpGatekeeper.sol`), so swapping the signup check is a constructor-time decision — no circuit changes. Useful to know when planning the national-ID gatekeeper:

| Gatekeeper | How it gates signup |
|---|---|
| `FreeForAllGatekeeper` | Accepts everyone (current) |
| `SignUpTokenGatekeeper` | Requires holding a specific ERC721 `SignUpToken` |
| `EASGatekeeper` | Requires an attestation on the Ethereum Attestation Service for a given schema |
| `GitcoinPassportGatekeeper` | Requires a minimum Gitcoin Passport humanity score |
| `HatsGatekeeperSingle` / `HatsGatekeeperMultiple` (and base) | Requires the caller to wear a given Hats Protocol hat |
| `SemaphoreGatekeeper` | Requires a valid Semaphore group-membership proof |
| `zupass/ZupassGatekeeper` | Requires a Zupass Groth16 attendance proof (`ZupassGroth16Verifier.sol` is its dedicated verifier) |

For BlockVote's planned national-ID gatekeeper, the cleanest path is a new implementation of `SignUpGatekeeper` whose `register(...)` verifies an off-chain-issued eligibility proof (or a national-ID attestation). Model it on `EASGatekeeper` or `SemaphoreGatekeeper` depending on whether the proof is an attestation or a ZK credential.

---

## Voice credit proxies

Implementations of `initialVoiceCreditProxy/InitialVoiceCreditProxy.sol`. MACI calls `getVoiceCredits(address, bytes)` at signup to decide how many credits the voter gets.

- **`ConstantInitialVoiceCreditProxy.sol`** — returns a fixed constant (deployed with `100`).
- The abstract base allows for per-address, token-balance-gated, or attestation-gated credit allocations. If voice credits ever need to be per-poll or per-voter, subclass this rather than editing `MACI.sol`.

---

## Interfaces

`node_modules/maci-contracts/contracts/interfaces/` holds the Solidity interfaces the rest of the code programs against:

`IMACI`, `IPoll`, `IMessageProcessor`, `ITally`, `IVerifier`, `IVkRegistry`, `IPollFactory`, `IMPFactory`, `ITallyFactory`, plus external integration interfaces (`IEAS`, `IGitcoinPassportDecoder`, `IHats`, `ISemaphore`) used by the corresponding gatekeepers.

These are inert — they're compile-time contracts only, not deployed.

---

## Mocks and benchmarks (not deployed)

Present in `node_modules/maci-contracts/contracts/mocks/` and `benchmarks/` for upstream MACI's own test suite:

- `MockEAS`, `MockERC20`, `MockGitcoinPassportDecoder`, `MockHatsProtocol`, `MockSemaphore`, `MockTally` — test doubles for the gatekeepers' external dependencies.
- `HasherBenchmarks.sol` — gas measurements for the Poseidon wrappers.

BlockVote's deploy scripts do not touch these. Ignore unless debugging an upstream issue.

---

## Deploy-time wiring

All of the above are wired together by the deploy scripts in `packages/hardhat/deploy/`. The output — contract addresses per network — is written to `packages/hardhat/contractAddresses.json` and consumed by the frontend via Scaffold-ETH 2's `useScaffoldContractRead` / `useScaffoldContractWrite` hooks (for `MACIWrapper`, the one named deployment) and by direct wagmi hooks (for per-poll `Poll` addresses discovered at runtime).

The coordinator keypair is generated once at deploy time into `packages/hardhat/coordinatorKeyPair.json` and passed to `MACIWrapper.setConfig(...)` as the `coordinatorPubKey`. The private half must never be committed — it's what decrypts votes during off-chain `prove`.

---

## Changing contracts safely

| Want to change… | Do this |
|---|---|
| Admin UX, poll metadata, lifecycle flags | Edit `MACIWrapper.sol`. Keep changes off the signup / message-processing path. |
| Enforce pause / close / startTime on-chain | Add a `Poll` subclass + custom `PollFactory`; wire via `setConfig`. Do **not** modify upstream `Poll.sol`. |
| Swap signup eligibility | Write a new gatekeeper implementing `SignUpGatekeeper`; pass it to the `MACIWrapper` constructor. |
| Change voice-credit allocation | Write a new `InitialVoiceCreditProxy` implementation; pass it in the constructor. |
| Anything circuit-adjacent (tree depths, batch size, QV vs non-QV semantics) | Requires matching circuit + zkey + `VkRegistry` redeploy. Do not attempt piecemeal. |

When in doubt, the rule from [CLAUDE.md](../CLAUDE.md) applies: MACI core contracts and `.zkey` files are cryptographically sensitive — any change may break proof verification.
