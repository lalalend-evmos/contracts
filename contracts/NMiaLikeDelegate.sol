pragma solidity ^0.5.16;

import "./NTokens/NErc20Delegate.sol";

interface MiaLike {
  function delegate(address delegatee) external;
}

/**
 * @title Lalalend's NMiaLikeDelegate Contract
 * @notice NTokens which can 'delegate votes' of their underlying ERC-20
 * @author Lalalend
 */
contract NMiaLikeDelegate is NErc20Delegate {
  /**
   * @notice Construct an empty delegate
   */
  constructor() public NErc20Delegate() {}

  /**
   * @notice Admin call to delegate the votes of the MIA-like underlying
   * @param miaLikeDelegatee The address to delegate votes to
   */
  function _delegateMiaLikeTo(address miaLikeDelegatee) external {
    require(msg.sender == admin, "only the admin may set the mia-like delegate");
    MiaLike(underlying).delegate(miaLikeDelegatee);
  }
}