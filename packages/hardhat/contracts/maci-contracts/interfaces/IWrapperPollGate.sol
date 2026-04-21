// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Minimal interface WrapperAwarePoll calls back into MACIWrapper to
///         read the three wrapper-side controls that Poll.sol cannot see.
interface IWrapperPollGate {
    /// @param poll Address of the Poll contract querying its own state.
    /// @return paused    True if the admin paused this poll.
    /// @return startTime Unix timestamp before which votes are rejected.
    /// @return endTime   Unix timestamp after  which votes are rejected
    ///                   (may be earlier than deployTime+duration if admin closed early).
    function getPollStateByAddress(
        address poll
    ) external view returns (bool paused, uint256 startTime, uint256 endTime);
}
