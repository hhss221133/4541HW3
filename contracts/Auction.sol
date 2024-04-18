// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Auction {
    address public owner;
    uint256 public auctionEndTime;
    bool public auctionEnded = false;
    uint256 public revealEndTime;

    struct Bid {
        bytes32 bidHash;
        bool revealed;
    }

    bool private locked = false;


    mapping(address => Bid) public bids;
    mapping(address => uint256) public tokenBalance;
    
    address public highestBidder;
    uint256 public highestBid;

    modifier onlyBefore(uint256 _time) { 
        require(block.timestamp < _time, "Must be before"); 
        _; 
    }

    modifier onlyAfter(uint256 _time) { 
        require(block.timestamp > _time, "Must be after"); 
        _; 
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner is allowed to call");
        _;
    }

    modifier noReentrancy() {
        require(!locked, "Reentrancy");
        locked = true;
        _;
        locked = false;
    }

    event NewBid(address indexed bidder, bytes32 bidHash);
    event BidRevealed(address indexed bidder, uint256 bid, bool isHighest);
    event FundsWithdrawn(address indexed bidder, uint256 amount);


    constructor() {
        owner = msg.sender;
        auctionEndTime = block.timestamp + 24 hours;
        revealEndTime = auctionEndTime + 2 hours;
    }

    function buyTokens(uint256 amount) external payable onlyBefore(auctionEndTime) noReentrancy() {
        require(msg.sender != owner, "Owner cannot participate");
        require(amount > 0, "buy in most be non zero");
        require(msg.value == amount, "Must declare equal amount to value");
        tokenBalance[msg.sender] += msg.value;
    }

    function bid(bytes32 _bidHash) public onlyBefore(auctionEndTime) {
        require(msg.sender != address(0), "Sender is 0 address");
        require(bids[msg.sender].bidHash == bytes32(0), "Bid already placed.");
        require(tokenBalance[msg.sender] > 0, "Need to have some tokens");
        bids[msg.sender] = Bid({
            bidHash: _bidHash,
            revealed: false
        });

        emit NewBid(msg.sender, _bidHash);
    }

    function reveal(uint256 bidAmount, string memory _secret) external onlyAfter(auctionEndTime) onlyBefore(revealEndTime) noReentrancy {
        require(!bids[msg.sender].revealed, "Bid already revealed.");

        Bid storage myBid = bids[msg.sender];
        require(keccak256(abi.encodePacked(bidAmount, _secret)) == myBid.bidHash, "Invalid bid reveal.");
        
        require(tokenBalance[msg.sender] >= bidAmount, "Insufficient funds for bid amount.");

        myBid.revealed = true;
        if (bidAmount > highestBid) {
            if (highestBidder != address(0)) {
                // Allow previous highest bidder to reclaim their bid amount
                tokenBalance[highestBidder] += highestBid;
            }
            tokenBalance[msg.sender] -= bidAmount;
            highestBidder = msg.sender;
            highestBid = bidAmount;
        }
        emit BidRevealed(msg.sender, bidAmount, bidAmount == highestBid);
    }

    function endAuction() external onlyAfter(revealEndTime) noReentrancy() {
        auctionEnded = true;
        tokenBalance[owner] += highestBid;
        emit FundsWithdrawn(owner, highestBid);
    }

    function withdrawFunds() external onlyAfter(revealEndTime) noReentrancy() {
        require(auctionEnded, "Owner has not ended the auction");
        uint256 amount = tokenBalance[msg.sender];
        require(amount > 0, "No funds to withdraw.");
        tokenBalance[msg.sender] = 0;
        payable(msg.sender).transfer(amount);
        emit FundsWithdrawn(msg.sender, amount);
    }

}