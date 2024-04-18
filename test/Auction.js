
const { expect } = require("chai");

describe("Auction", function() {
  let _Auction;
  let AuctionContract;
  let owner;
  let addr1;
  let addr2;
  let addr3;

  beforeEach(async function() {
    _Auction = await ethers.getContractFactory("Auction");
    [owner, addr1, addr2, addr3] = await ethers.getSigners();
    AuctionContract = await _Auction.deploy();
  });

  describe("Deployment", function() {
    it("Should set the right owner", async function() {
      expect(await AuctionContract.owner()).to.equal(owner.address);
    });
  });

  describe("Transactions", function() {
    it("Should allow users to fund their accounts", async function() {
      console.log(await ethers.provider.getBalance(addr1));
      await AuctionContract.connect(addr1).buyTokens(ethers.parseEther("10"), {value: ethers.parseEther("10")});
      expect(await AuctionContract.tokenBalance(addr1.address)).to.equal(ethers.parseEther("10"));
      console.log(await ethers.provider.getBalance(addr1));

    });

    it("Should accept bids", async function() {
      console.log(await ethers.provider.getBalance(addr1));
      const bidAmount = ethers.parseEther("10")
      const bidHash = ethers.solidityPackedKeccak256(["uint256", "string"], [bidAmount, "secret"]);
      await AuctionContract.connect(addr1).buyTokens(bidAmount, {value: bidAmount});
      await AuctionContract.connect(addr1).bid(bidHash);
      const bid = await AuctionContract.bids(addr1.address);
      expect(bid.bidHash).to.equal(bidHash);
      console.log(await ethers.provider.getBalance(addr1));
    });

    it("Should allow users to reveal their bids", async function() {
      const bidAmount = ethers.parseEther("10");
      const secret = "secret";
      const bidHash = ethers.solidityPackedKeccak256(["uint256", "string"], [bidAmount, secret]);
      
      // Funding and bidding
      await AuctionContract.connect(addr1).buyTokens(bidAmount, {value: bidAmount});
      await AuctionContract.connect(addr1).bid(bidHash);

      // Moving time forward to after the AuctionContract end
      await network.provider.send("evm_increaseTime", [86400 + 1]); // 24 hours and 1 second
      await network.provider.send("evm_mine");

      // Revealing the bid
      await AuctionContract.connect(addr1).reveal(bidAmount, secret);
      expect(await AuctionContract.highestBid()).to.equal(bidAmount);
    });

    it("Should allow withdrawal after AuctionContract ends", async function() {
      const bidAmount = ethers.parseEther("10");
      const bidAmount2 = ethers.parseEther("15")
      const secret = "secret";
      const secret2 = "anotherSecret"
      const bidHash = ethers.solidityPackedKeccak256(["uint256", "string"], [bidAmount, secret]);
      const bidHash2 = ethers.solidityPackedKeccak256(["uint256", "string"], [bidAmount2, secret2]);

      // Setup and reveal
      await AuctionContract.connect(addr1).buyTokens(bidAmount + ethers.parseEther("10"), {value: bidAmount + ethers.parseEther("10")});
      await AuctionContract.connect(addr2).buyTokens(bidAmount2, {value: bidAmount2});

      expect(await AuctionContract.tokenBalance(addr1.address)).to.equal(bidAmount + ethers.parseEther("10"));
      expect(await AuctionContract.tokenBalance(addr2.address)).to.equal(bidAmount2);
      
      await AuctionContract.connect(addr1).bid(bidHash);
      await AuctionContract.connect(addr2).bid(bidHash2);
      await network.provider.send("evm_increaseTime", [86400 + 1]); // Through the reveal period
      await network.provider.send("evm_mine");
      await AuctionContract.connect(addr1).reveal(bidAmount, secret);
      await AuctionContract.connect(addr2).reveal(bidAmount2, secret2);

      //Skip past reveal phase
      await network.provider.send("evm_increaseTime", [7200]); // Through the reveal period
      await network.provider.send("evm_mine");

      // Ending the AuctionContract
      await AuctionContract.connect(owner).endAuction();
      expect(await AuctionContract.tokenBalance(owner.address)).to.equal(bidAmount2);
      expect(await AuctionContract.tokenBalance(addr1.address)).to.equal(bidAmount + ethers.parseEther("10"));
      expect(await AuctionContract.tokenBalance(addr2.address)).to.equal(0);

      expect(await AuctionContract.highestBidder()).to.equal(addr2.address)
      expect(await AuctionContract.highestBid()).to.equal(bidAmount2)

      // Withdrawal
      const beforeBalance = await ethers.provider.getBalance(owner)
      const tx = await AuctionContract.connect(owner).withdrawFunds();
      const receipt = await tx.wait();

      const gasUsed = receipt.gasUsed *receipt.gasPrice;
      const afterBalance = await ethers.provider.getBalance(owner)

      expect(afterBalance + gasUsed).to.be.closeTo(beforeBalance + bidAmount2, ethers.parseEther("0.01"));


      const _beforeBalance = await ethers.provider.getBalance(addr1)
      const _tx = await AuctionContract.connect(addr1).withdrawFunds();
      const _receipt = await _tx.wait();

      const _gasUsed = receipt.gasUsed *_receipt.gasPrice;
      const _afterBalance = await ethers.provider.getBalance(addr1)

      expect(_afterBalance + _gasUsed).to.be.closeTo(_beforeBalance + bidAmount + ethers.parseEther("10"), ethers.parseEther("0.01"));
    
      await expect(AuctionContract.connect(addr2).withdrawFunds()).to.be.revertedWith("No funds to withdraw.")

    });

    it("Calculate max gas cost", async function() {
      //msg.value size does not affect gas cost
      const bidAmount = ethers.parseEther("10");
      const bidAmount2 = ethers.parseEther("15");
      const secret = "secret";
      const secret2 = "anotherSecret"
      const bidHash = ethers.solidityPackedKeccak256(["uint256", "string"], [bidAmount, secret]);
      const bidHash2 = ethers.solidityPackedKeccak256(["uint256", "string"], [bidAmount2, secret2]);
      
      const tx1 = await AuctionContract.connect(addr1).buyTokens(bidAmount, {value: bidAmount});
      const tx2 = await AuctionContract.connect(addr2).buyTokens(bidAmount2, {value: bidAmount2});

      const tx1_ = await tx1.wait();
      console.log(`tx1 ${tx1_.gasUsed}`)
      
      const tx2_ = await tx2.wait();
      console.log(`tx1 ${tx2_.gasUsed}`)
   
    });


  });
});
