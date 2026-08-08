const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PolicyVault", function () {
  async function deployFixture() {
    const [owner, agent, other, user] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdg = await MockERC20.deploy("Mock USDG", "mUSDG");
    const nvdax = await MockERC20.deploy("Mock NVDAx", "mNVDAx");
    const notAllowed = await MockERC20.deploy("Not Allowed", "NOPE");

    const MockRouter = await ethers.getContractFactory("MockRouter");
    const router = await MockRouter.deploy();

    const PolicyVault = await ethers.getContractFactory("PolicyVault");
    const vault = await PolicyVault.deploy(owner.address, agent.address);

    // Allowlist USDG and NVDAx, set a $1000 mUSDG per-trade cap and a 5-token mNVDAx holding cap.
    await vault.connect(owner).setTokenAllowed(await usdg.getAddress(), true);
    await vault.connect(owner).setTokenAllowed(await nvdax.getAddress(), true);
    await vault
      .connect(owner)
      .setPolicy(await usdg.getAddress(), 4000, 0, ethers.parseUnits("1000", 18));
    await vault
      .connect(owner)
      .setPolicy(await nvdax.getAddress(), 6000, ethers.parseUnits("5", 18), 0);

    // Fund the vault with USDG, and pre-fund the router with NVDAx so it can pay out swaps.
    await usdg.mint(await vault.getAddress(), ethers.parseUnits("10000", 18));
    await nvdax.mint(await router.getAddress(), ethers.parseUnits("1000", 18));

    return { owner, agent, other, user, usdg, nvdax, notAllowed, router, vault };
  }

  function swapCalldata(router, fromToken, amountIn, toToken, amountOut) {
    return router.interface.encodeFunctionData("execute", [
      fromToken,
      amountIn,
      toToken,
      amountOut,
    ]);
  }

  describe("policy management", function () {
    it("lets the owner set token allowlist and policy", async function () {
      const { vault, usdg } = await deployFixture();
      expect(await vault.isAllowedToken(await usdg.getAddress())).to.equal(true);
      expect(await vault.targetAllocationBps(await usdg.getAddress())).to.equal(4000n);
    });

    it("rejects policy updates from non-owner", async function () {
      const { vault, usdg, other } = await deployFixture();
      await expect(
        vault.connect(other).setPolicy(await usdg.getAddress(), 1000, 0, 0)
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });

    it("rejects allowlist changes from non-owner", async function () {
      const { vault, notAllowed, other } = await deployFixture();
      await expect(
        vault.connect(other).setTokenAllowed(await notAllowed.getAddress(), true)
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });

    it("rejects setting a policy on a non-allowlisted token", async function () {
      const { vault, owner, notAllowed } = await deployFixture();
      await expect(
        vault.connect(owner).setPolicy(await notAllowed.getAddress(), 1000, 0, 0)
      ).to.be.revertedWith("PolicyVault: token not allowlisted");
    });

    it("lets the owner change the authorized agent", async function () {
      const { vault, owner, other } = await deployFixture();
      await vault.connect(owner).setAgent(other.address);
      expect(await vault.agent()).to.equal(other.address);
    });

    it("rejects agent changes from non-owner", async function () {
      const { vault, other } = await deployFixture();
      await expect(vault.connect(other).setAgent(other.address)).to.be.revertedWithCustomError(
        vault,
        "OwnableUnauthorizedAccount"
      );
    });
  });

  describe("target allocation completeness", function () {
    it("tracks totalTargetBps as policies are set, and the fixture already sums to 100%", async function () {
      const { vault } = await deployFixture();
      expect(await vault.totalTargetBps()).to.equal(10_000n);
    });

    it("rejects a setPolicy call that would push the total over 100%", async function () {
      const { vault, owner, usdg } = await deployFixture();
      // Fixture already totals 100% (40% + 60%); raising USDG to 50% would make it 110%.
      await expect(
        vault.connect(owner).setPolicy(await usdg.getAddress(), 5000, 0, ethers.parseUnits("1000", 18))
      ).to.be.revertedWith("PolicyVault: total target allocation exceeds 100%");
    });

    it("allows setPolicy calls that keep the total at or under 100%", async function () {
      const { vault, owner, usdg } = await deployFixture();
      await vault.connect(owner).setPolicy(await usdg.getAddress(), 3000, 0, ethers.parseUnits("1000", 18));
      expect(await vault.totalTargetBps()).to.equal(9000n); // 30% + 60%
    });

    it("clears a token's target contribution when it's disallowed", async function () {
      const { vault, owner, nvdax } = await deployFixture();
      await vault.connect(owner).setTokenAllowed(await nvdax.getAddress(), false);
      expect(await vault.totalTargetBps()).to.equal(4000n); // only USDG's 40% remains
      expect(await vault.targetAllocationBps(await nvdax.getAddress())).to.equal(0n);
    });

    it("rejects executeTrade when totalTargetBps is not exactly 100%", async function () {
      const { vault, owner, agent, router, usdg, nvdax } = await deployFixture();
      // Disallowing nvdax drops the total to 40%, and also removes it from the allowlist —
      // re-allowlist it (without a policy) so the failure we observe is specifically the
      // 100%-completeness check, not "toToken not allowlisted".
      await vault.connect(owner).setTokenAllowed(await nvdax.getAddress(), false);
      await vault.connect(owner).setTokenAllowed(await nvdax.getAddress(), true);
      expect(await vault.totalTargetBps()).to.equal(4000n);

      const amountIn = ethers.parseUnits("100", 18);
      const data = swapCalldata(router, await usdg.getAddress(), amountIn, await nvdax.getAddress(), ethers.parseUnits("1", 18));
      await expect(
        vault
          .connect(agent)
          .executeTrade(await usdg.getAddress(), await nvdax.getAddress(), amountIn, await router.getAddress(), await router.getAddress(), data)
      ).to.be.revertedWith("PolicyVault: policy incomplete, targets must sum to 100%");
    });
  });

  describe("executeTrade — hard rejection", function () {
    it("rejects a trade from anyone other than the agent", async function () {
      const { vault, other, router, usdg, nvdax } = await deployFixture();
      const amountIn = ethers.parseUnits("100", 18);
      const data = swapCalldata(
        router,
        await usdg.getAddress(),
        amountIn,
        await nvdax.getAddress(),
        ethers.parseUnits("1", 18)
      );
      await expect(
        vault
          .connect(other)
          .executeTrade(
            await usdg.getAddress(),
            await nvdax.getAddress(),
            amountIn,
            await router.getAddress(),
            await router.getAddress(),
            data
          )
      ).to.be.revertedWith("PolicyVault: caller is not the agent");
    });

    it("rejects a trade where fromToken is not allowlisted", async function () {
      const { vault, agent, router, notAllowed, nvdax } = await deployFixture();
      const amountIn = ethers.parseUnits("100", 18);
      const data = swapCalldata(
        router,
        await notAllowed.getAddress(),
        amountIn,
        await nvdax.getAddress(),
        ethers.parseUnits("1", 18)
      );
      await expect(
        vault
          .connect(agent)
          .executeTrade(
            await notAllowed.getAddress(),
            await nvdax.getAddress(),
            amountIn,
            await router.getAddress(),
            await router.getAddress(),
            data
          )
      ).to.be.revertedWith("PolicyVault: fromToken not allowlisted");
    });

    it("rejects a trade where toToken is not allowlisted", async function () {
      const { vault, agent, router, usdg, notAllowed } = await deployFixture();
      const amountIn = ethers.parseUnits("100", 18);
      const data = swapCalldata(
        router,
        await usdg.getAddress(),
        amountIn,
        await notAllowed.getAddress(),
        ethers.parseUnits("1", 18)
      );
      await expect(
        vault
          .connect(agent)
          .executeTrade(
            await usdg.getAddress(),
            await notAllowed.getAddress(),
            amountIn,
            await router.getAddress(),
            await router.getAddress(),
            data
          )
      ).to.be.revertedWith("PolicyVault: toToken not allowlisted");
    });

    it("rejects a trade that exceeds the per-trade size cap", async function () {
      const { vault, agent, router, usdg, nvdax } = await deployFixture();
      // Cap on mUSDG is 1000; try to spend 1500.
      const amountIn = ethers.parseUnits("1500", 18);
      const data = swapCalldata(
        router,
        await usdg.getAddress(),
        amountIn,
        await nvdax.getAddress(),
        ethers.parseUnits("3", 18)
      );
      await expect(
        vault
          .connect(agent)
          .executeTrade(
            await usdg.getAddress(),
            await nvdax.getAddress(),
            amountIn,
            await router.getAddress(),
            await router.getAddress(),
            data
          )
      ).to.be.revertedWith("PolicyVault: exceeds max trade size");
    });

    it("rejects a trade that would push the vault's holding of toToken over its cap", async function () {
      const { vault, agent, router, usdg, nvdax } = await deployFixture();
      // Cap on mNVDAx is 5 tokens; request an output of 6.
      const amountIn = ethers.parseUnits("900", 18);
      const amountOut = ethers.parseUnits("6", 18);
      const data = swapCalldata(router, await usdg.getAddress(), amountIn, await nvdax.getAddress(), amountOut);
      await expect(
        vault
          .connect(agent)
          .executeTrade(
            await usdg.getAddress(),
            await nvdax.getAddress(),
            amountIn,
            await router.getAddress(),
            await router.getAddress(),
            data
          )
      ).to.be.revertedWith("PolicyVault: would exceed max allocation");
    });

    it("rejects a trade whose swap call reverts, surfacing the router's real reason", async function () {
      const { vault, agent, router, usdg, nvdax } = await deployFixture();
      // amountOut larger than what the router holds — router's own transfer will revert
      // with the underlying ERC20's own error, which executeTrade should now bubble up
      // instead of masking it with a generic message.
      const amountIn = ethers.parseUnits("100", 18);
      const amountOut = ethers.parseUnits("100000", 18);
      const data = swapCalldata(router, await usdg.getAddress(), amountIn, await nvdax.getAddress(), amountOut);
      await expect(
        vault
          .connect(agent)
          .executeTrade(
            await usdg.getAddress(),
            await nvdax.getAddress(),
            amountIn,
            await router.getAddress(),
            await router.getAddress(),
            data
          )
      ).to.be.revertedWithCustomError(nvdax, "ERC20InsufficientBalance");
    });

    it("falls back to a generic message when the callee reverts with no data at all", async function () {
      const { vault, agent, usdg, nvdax } = await deployFixture();
      const MockRevertNoData = await ethers.getContractFactory("MockRevertNoData");
      const noDataRouter = await MockRevertNoData.deploy();
      const amountIn = ethers.parseUnits("100", 18);
      const data = noDataRouter.interface.encodeFunctionData("execute", [
        await usdg.getAddress(),
        amountIn,
        await nvdax.getAddress(),
        1,
      ]);
      await expect(
        vault
          .connect(agent)
          .executeTrade(
            await usdg.getAddress(),
            await nvdax.getAddress(),
            amountIn,
            await noDataRouter.getAddress(),
            await noDataRouter.getAddress(),
            data
          )
      ).to.be.revertedWith("PolicyVault: swap call failed");
    });

    it("rejects fromToken == toToken", async function () {
      const { vault, agent, router, usdg } = await deployFixture();
      const amountIn = ethers.parseUnits("100", 18);
      const data = swapCalldata(router, await usdg.getAddress(), amountIn, await usdg.getAddress(), amountIn);
      await expect(
        vault
          .connect(agent)
          .executeTrade(
            await usdg.getAddress(),
            await usdg.getAddress(),
            amountIn,
            await router.getAddress(),
            await router.getAddress(),
            data
          )
      ).to.be.revertedWith("PolicyVault: fromToken equals toToken");
    });
  });

  describe("executeTrade — happy path", function () {
    it("executes a valid trade within all constraints and updates balances", async function () {
      const { vault, agent, router, usdg, nvdax } = await deployFixture();
      const amountIn = ethers.parseUnits("500", 18);
      const amountOut = ethers.parseUnits("2", 18);
      const data = swapCalldata(router, await usdg.getAddress(), amountIn, await nvdax.getAddress(), amountOut);

      const vaultAddr = await vault.getAddress();
      const usdgBefore = await usdg.balanceOf(vaultAddr);
      const nvdaxBefore = await nvdax.balanceOf(vaultAddr);

      await expect(
        vault
          .connect(agent)
          .executeTrade(
            await usdg.getAddress(),
            await nvdax.getAddress(),
            amountIn,
            await router.getAddress(),
            await router.getAddress(),
            data
          )
      )
        .to.emit(vault, "TradeExecuted")
        .withArgs(await usdg.getAddress(), await nvdax.getAddress(), amountIn, amountOut);

      expect(await usdg.balanceOf(vaultAddr)).to.equal(usdgBefore - amountIn);
      expect(await nvdax.balanceOf(vaultAddr)).to.equal(nvdaxBefore + amountOut);
      // No leftover approval left on the approve target.
      expect(await usdg.allowance(vaultAddr, await router.getAddress())).to.equal(0n);
    });

    it("approves approveTarget, not swapTarget, when they're different addresses — the exact bug that broke the first real mainnet trade attempt", async function () {
      const { vault, agent, router, usdg, nvdax } = await deployFixture();
      // `router` (an unrelated MockRouter instance, never called here) stands in for OKX's
      // separate allowance-holding contract. `executor` stands in for OKX's swap-executing
      // contract (tx.to) and asserts, AT CALL TIME, that only the approve target holds
      // allowance — proving PolicyVault approves the right address, not just that some
      // trade happens to succeed.
      const MockApprovalCapturingRouter = await ethers.getContractFactory("MockApprovalCapturingRouter");
      const executor = await MockApprovalCapturingRouter.deploy();

      const amountIn = ethers.parseUnits("100", 18);
      const amountOut = ethers.parseUnits("1", 18);
      const data = executor.interface.encodeFunctionData("execute", [
        await usdg.getAddress(),
        await router.getAddress(), // the approveTarget this mock expects to see approved
        amountIn,
        await nvdax.getAddress(),
        amountOut,
      ]);

      await expect(
        vault
          .connect(agent)
          .executeTrade(
            await usdg.getAddress(),
            await nvdax.getAddress(),
            amountIn,
            await router.getAddress(), // approveTarget
            await executor.getAddress(), // swapTarget
            data
          )
      ).to.not.be.reverted;
    });

    it("allows a trade exactly at the per-trade size cap", async function () {
      const { vault, agent, router, usdg, nvdax } = await deployFixture();
      const amountIn = ethers.parseUnits("1000", 18); // exactly the cap
      const amountOut = ethers.parseUnits("4", 18); // exactly the holding cap
      const data = swapCalldata(router, await usdg.getAddress(), amountIn, await nvdax.getAddress(), amountOut);
      await expect(
        vault
          .connect(agent)
          .executeTrade(
            await usdg.getAddress(),
            await nvdax.getAddress(),
            amountIn,
            await router.getAddress(),
            await router.getAddress(),
            data
          )
      ).to.not.be.reverted;
    });
  });

  describe("deposits and withdrawals", function () {
    it("lets anyone deposit an allowlisted token", async function () {
      const { vault, usdg, user } = await deployFixture();
      const amount = ethers.parseUnits("100", 18);
      await usdg.mint(user.address, amount);
      await usdg.connect(user).approve(await vault.getAddress(), amount);
      await expect(vault.connect(user).deposit(await usdg.getAddress(), amount))
        .to.emit(vault, "Deposited")
        .withArgs(await usdg.getAddress(), user.address, amount);
    });

    it("rejects depositing a non-allowlisted token", async function () {
      const { vault, notAllowed, user } = await deployFixture();
      const amount = ethers.parseUnits("100", 18);
      await notAllowed.mint(user.address, amount);
      await notAllowed.connect(user).approve(await vault.getAddress(), amount);
      await expect(
        vault.connect(user).deposit(await notAllowed.getAddress(), amount)
      ).to.be.revertedWith("PolicyVault: token not allowlisted");
    });

    it("rejects withdrawals from non-owner", async function () {
      const { vault, usdg, other } = await deployFixture();
      const amount = ethers.parseUnits("100", 18);
      await expect(
        vault.connect(other).withdraw(await usdg.getAddress(), amount, other.address)
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });

    it("lets the owner withdraw and actually moves the funds out (balance proof, not just an event)", async function () {
      const { vault, usdg, owner, user } = await deployFixture();
      const amount = ethers.parseUnits("250", 18);
      const vaultAddr = await vault.getAddress();

      const vaultBefore = await usdg.balanceOf(vaultAddr);
      const recipientBefore = await usdg.balanceOf(user.address);

      await expect(vault.connect(owner).withdraw(await usdg.getAddress(), amount, user.address))
        .to.emit(vault, "Withdrawn")
        .withArgs(await usdg.getAddress(), user.address, amount);

      expect(await usdg.balanceOf(vaultAddr)).to.equal(vaultBefore - amount);
      expect(await usdg.balanceOf(user.address)).to.equal(recipientBefore + amount);
    });

    it("lets the owner withdraw a token that was never allowlisted, arriving via a direct transfer instead of deposit()", async function () {
      const { vault, owner, notAllowed, user } = await deployFixture();
      const amount = ethers.parseUnits("50", 18);
      const vaultAddr = await vault.getAddress();

      // Simulate an unlisted token landing in the vault outside of deposit() — a plain
      // ERC20 transfer, which nothing in PolicyVault can prevent (standard ERC20 behavior).
      await notAllowed.mint(vaultAddr, amount);
      expect(await notAllowed.balanceOf(vaultAddr)).to.equal(amount);
      expect(await vault.isAllowedToken(await notAllowed.getAddress())).to.equal(false);

      // The owner can still recover it — withdraw() does not check the allowlist.
      await expect(
        vault.connect(owner).withdraw(await notAllowed.getAddress(), amount, user.address)
      ).to.not.be.reverted;
      expect(await notAllowed.balanceOf(vaultAddr)).to.equal(0n);
      expect(await notAllowed.balanceOf(user.address)).to.equal(amount);
    });
  });

  describe("reentrancy protection", function () {
    it("blocks a reentrant call into deposit() made from inside executeTrade's swap call", async function () {
      const { vault, agent, usdg, nvdax } = await deployFixture();

      const MockReentrantRouter = await ethers.getContractFactory("MockReentrantRouter");
      const reentrant = await MockReentrantRouter.deploy(await vault.getAddress(), await usdg.getAddress());

      const amountIn = ethers.parseUnits("100", 18);
      const data = reentrant.interface.encodeFunctionData("execute", [
        await usdg.getAddress(),
        amountIn,
        await nvdax.getAddress(),
        ethers.parseUnits("1", 18),
      ]);

      // Without nonReentrant, this reentrant router would succeed at re-entering deposit()
      // mid-swap. With it, the nested deposit() call reverts with ReentrancyGuardReentrantCall,
      // which bubbles up through the router's own call and then through executeTrade's own
      // revert-bubbling, so the specific guard error surfaces all the way up.
      await expect(
        vault
          .connect(agent)
          .executeTrade(
            await usdg.getAddress(),
            await nvdax.getAddress(),
            amountIn,
            await reentrant.getAddress(),
            await reentrant.getAddress(),
            data
          )
      ).to.be.revertedWithCustomError(vault, "ReentrancyGuardReentrantCall");
    });
  });
});
