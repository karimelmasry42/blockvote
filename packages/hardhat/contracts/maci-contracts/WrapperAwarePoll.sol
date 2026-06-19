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
///         IMPORTANT: Polls deployed through this factory have duration = 0
///         (set during MACIWrapper.createPoll).  All time management is
///         delegated to the wrapper's startTime / endTime stored in
///         MACIWrapper.  This is necessary because downstream contracts
///         (MessageProcessor, Tally) read the Poll's immutable
///         getDeployTimeAndDuration() to check _votingPeriodOver; with
///         duration = 0 the check resolves to
///         block.timestamp > deployTime which passes after
///         deployment.  The wrapper's PollData.endTime provides the real
///         voting deadline and is enforced by the overridden modifiers below.
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
    ///      The inherited check using the immutable duration is omitted
    ///      because the contract is always deployed with duration = 0.
    modifier isWithinVotingDeadline() override {
        (bool paused, uint256 startTime, uint256 endTime) = IWrapperPollGate(wrapper)
            .getPollStateByAddress(address(this));

        if (paused) revert PollIsPaused();
        if (block.timestamp < startTime) revert VotingNotStarted();
        if (block.timestamp >= endTime) revert VotingPeriodOver();

        _;
    }

    /// @dev Overrides Poll's isAfterVotingDeadline to allow merge when the
    ///      wrapper has closed the poll early, even if deployTime+duration
    ///      has not yet elapsed.  Because duration is always 0 the inherited
    ///      check is replaced entirely by the wrapper's endTime.
    modifier isAfterVotingDeadline() override {
        (bool paused, uint256 startTime, uint256 endTime) = IWrapperPollGate(wrapper)
            .getPollStateByAddress(address(this));

        if (block.timestamp < endTime) revert VotingPeriodNotOver();

        _;
    }
}
