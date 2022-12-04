pragma solidity ^0.5.16;

import "./NTokens/NEvmos.sol";

/**
 * @title Lalalend's Maximillion Contract
 * @author Lalalend
 */
contract Maximillion {
    /**
     * @notice The default nEvmos market to repay in
     */
    // DONE : should be done
    NEvmos public nEvmos;

    /**
     * @notice Construct a Maximillion to repay max in a NEvmos market
     */
    constructor(NEvmos nEvmos_) public {
        nEvmos = nEvmos_;
    }

    /**
     * @notice msg.sender sends EVMOS to repay an account's borrow in the nEvmos market
     * @dev The provided EVMOS is applied towards the borrow balance, any excess is refunded
     * @param borrower The address of the borrower account to repay on behalf of
     */
    function repayBehalf(address borrower) public payable {
        repayBehalfExplicit(borrower, nEvmos);
    }

    /**
     * @notice msg.sender sends EVMOS to repay an account's borrow in a nEvmos market
     * @dev The provided EVMOS is applied towards the borrow balance, any excess is refunded
     * @param borrower The address of the borrower account to repay on behalf of
     * @param nEvmos_ The address of the nEvmos contract to repay in
     */
    function repayBehalfExplicit(address borrower, NEvmos nEvmos_) public payable {
        uint received = msg.value;
        uint borrows = nEvmos_.borrowBalanceCurrent(borrower);
        if (received > borrows) {
            nEvmos_.repayBorrowBehalf.value(borrows)(borrower);
            msg.sender.transfer(received - borrows);
        } else {
            nEvmos_.repayBorrowBehalf.value(received)(borrower);
        }
    }
}