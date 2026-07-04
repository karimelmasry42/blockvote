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
///
///         Time management is delegated to the wrapper's startTime / endTime
///         stored in MACIWrapper: the modifier overrides below ignore the
///         inherited Poll duration entirely and gate on the wrapper's PollData.
///
///         The Poll's immutable duration (set by MACIWrapper.createPoll to the
///         real voting window, deployTime + duration == endTime) is still used
///         by downstream contracts (MessageProcessor, Tally) for two things:
///         the _votingPeriodOver gate, and the pollEndTimestamp public input
///         that the tally circuit verifies. A real duration is required there
///         so the circuit accepts voters who sign up during the voting window
///         (see MACIWrapper.createPoll for the full rationale). Wrapper-side
///         pause / startTime / early-close gating is independent of it.
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

    /// @dev Overrides Poll's isWithinVotingDeadline so that all temporal
    ///      gating comes from the wrapper (pause / startTime / endTime).
    ///      The inherited check using the immutable duration is replaced
    ///      entirely by the wrapper's startTime / endTime.
    modifier isWithinVotingDeadline() override {
        (bool paused, uint256 startTime, uint256 endTime) = IWrapperPollGate(wrapper)
            .getPollStateByAddress(address(this));

        if (paused) revert PollIsPaused();
        if (block.timestamp < startTime) revert VotingNotStarted();
        if (block.timestamp >= endTime) revert VotingPeriodOver();

        _;
    }

    /// @dev Overrides Poll's isAfterVotingDeadline to allow merge as soon as
    ///      the wrapper's endTime has passed (including when the poll was
    ///      closed early), regardless of the inherited deployTime + duration.
    modifier isAfterVotingDeadline() override {
        (bool paused, uint256 startTime, uint256 endTime) = IWrapperPollGate(wrapper)
            .getPollStateByAddress(address(this));

        if (block.timestamp < endTime) revert VotingPeriodNotOver();

        _;
    }
}
