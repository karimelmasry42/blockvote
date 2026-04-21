// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Poll } from "maci-contracts/contracts/Poll.sol";
import { Params } from "maci-contracts/contracts/utilities/Params.sol";
import { DomainObjs } from "maci-contracts/contracts/utilities/DomainObjs.sol";
import { IWrapperPollGate } from "./interfaces/IWrapperPollGate.sol";

/// @title WrapperAwarePoll
/// @notice Extends Poll to enforce MACIWrapper's pause, early-close, and
///         startTime controls at the contract level.  Without this subclass
///         those three controls exist only in wrapper storage and can be
///         bypassed by calling Poll.publishMessage directly.
contract WrapperAwarePoll is Poll {
    error PollIsPaused();
    error VotingNotStarted();

    /// @notice The MACIWrapper that manages this poll's lifecycle state.
    address public immutable wrapper;

    constructor(
        uint256 _duration,
        Params.TreeDepths memory _treeDepths,
        DomainObjs.PubKey memory _coordinatorPubKey,
        Params.ExtContracts memory _extContracts,
        uint256 _emptyBallotRoot,
        address _wrapper
    ) Poll(_duration, _treeDepths, _coordinatorPubKey, _extContracts, _emptyBallotRoot) {
        wrapper = _wrapper;
    }

    /// @dev Overrides Poll's isWithinVotingDeadline to additionally enforce
    ///      wrapper-side pause, startTime, and early endTime.
    ///      Poll's own deployTime+duration deadline is checked first so that
    ///      the wrapper state query (an external call) is skipped once the
    ///      hard deadline has passed.
    modifier isWithinVotingDeadline() override {
        // Hard on-chain deadline (Poll.sol invariant — cannot be bypassed).
        uint256 secondsPassed = block.timestamp - deployTime;
        if (secondsPassed >= duration) revert VotingPeriodOver();

        // Wrapper-controlled gate (pause / startTime / early close).
        (bool paused, uint256 startTime, uint256 endTime) = IWrapperPollGate(wrapper)
            .getPollStateByAddress(address(this));

        if (paused) revert PollIsPaused();
        if (block.timestamp < startTime) revert VotingNotStarted();
        if (block.timestamp >= endTime) revert VotingPeriodOver();

        _;
    }
}
