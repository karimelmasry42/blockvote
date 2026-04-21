// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { PollFactory } from "maci-contracts/contracts/PollFactory.sol";
import { AccQueueQuinaryMaci } from "maci-contracts/contracts/trees/AccQueueQuinaryMaci.sol";
import { IMACI } from "maci-contracts/contracts/interfaces/IMACI.sol";
import { Params } from "maci-contracts/contracts/utilities/Params.sol";
import { DomainObjs } from "maci-contracts/contracts/utilities/DomainObjs.sol";
import { WrapperAwarePoll } from "./WrapperAwarePoll.sol";

/// @title WrapperAwarePollFactory
/// @notice Replaces PollFactory in the MACIWrapper deployment stack.
///         Deploys WrapperAwarePoll instead of Poll so that the wrapper's
///         pause / close / startTime controls are enforced at the contract
///         level rather than only in wrapper storage.
///
/// Deployment order:
///   1. Deploy WrapperAwarePollFactory (wrapper address not yet known — leave unset).
///   2. Deploy MACIWrapper, passing this factory as _pollFactory.
///   3. Call setWrapper(maciWrapperAddress) once to complete the wiring.
///      After this point createPoll deploys WrapperAwarePoll instances that
///      call back into MACIWrapper for their gate checks.
contract WrapperAwarePollFactory is PollFactory {
    error WrapperAlreadySet();
    error WrapperNotSet();

    /// @notice Address of the MACIWrapper that owns this factory's polls.
    ///         Set once via setWrapper() after MACIWrapper is deployed.
    address public wrapper;

    /// @notice Called once, immediately after MACIWrapper is deployed.
    function setWrapper(address _wrapper) external {
        if (wrapper != address(0)) revert WrapperAlreadySet();
        wrapper = _wrapper;
    }

    /// @inheritdoc PollFactory
    function deploy(
        uint256 _duration,
        Params.TreeDepths calldata _treeDepths,
        DomainObjs.PubKey calldata _coordinatorPubKey,
        address _maci,
        uint256 _emptyBallotRoot
    ) public override returns (address pollAddr) {
        if (wrapper == address(0)) revert WrapperNotSet();

        AccQueueQuinaryMaci messageAq = new AccQueueQuinaryMaci(_treeDepths.messageTreeSubDepth);

        Params.ExtContracts memory extContracts = Params.ExtContracts({
            maci: IMACI(_maci),
            messageAq: messageAq
        });

        WrapperAwarePoll poll = new WrapperAwarePoll(
            _duration,
            _treeDepths,
            _coordinatorPubKey,
            extContracts,
            _emptyBallotRoot,
            wrapper
        );

        messageAq.transferOwnership(address(poll));
        poll.init();

        pollAddr = address(poll);
    }
}
