const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("VaultFactory", function () {
  const PRESET = { Conservative: 0, Balanced: 1, Growth: 2 };

  // Token order matches the factory's fixed [USDG, NVDAx, SPYx, xBTC] array, so each
  // expected row lines up with tokens[i] by index, not by re-deriving the order per test.
  const EXPECTED_TARGETS = {
    [PRESET.Conservative]: [6000n, 1500n, 1500n, 1000n],
    [PRESET.Balanced]: [4000n, 2500n, 2000n, 1500n],
    [PRESET.Growth]: [1500n, 3500n, 2500n, 2500n],
  };

  async function deployFixture() {
    const [deployer, agent, owner, otherOwner] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdg = await MockERC20.deploy("Mock USDG", "mUSDG");
    const nvdax = await MockERC20.deploy("Mock NVDAx", "mNVDAx");
    const spyx = await MockERC20.deploy("Mock SPYx", "mSPYx");
    const xbtc = await MockERC20.deploy("Mock xBTC", "mxBTC");

    const VaultFactory = await ethers.getContractFactory("VaultFactory");
    const factory = await VaultFactory.deploy(
      agent.address,
      await usdg.getAddress(),
      await nvdax.getAddress(),
      await spyx.getAddress(),
      await xbtc.getAddress()
    );

    return { deployer, agent, owner, otherOwner, usdg, nvdax, spyx, xbtc, factory };
  }

  const EXPECTED_MAX_HOLDING = [0n, ethers.parseUnits("20", 18), ethers.parseUnits("20", 18), 20_000_000n];
  const EXPECTED_MAX_TRADE = [2_000_000_000n, 0n, 0n, 0n];

  describe("constructor", function () {
    it("rejects a zero agent address", async function () {
      const { usdg, nvdax, spyx, xbtc } = await deployFixture();
      const VaultFactory = await ethers.getContractFactory("VaultFactory");
      await expect(
        VaultFactory.deploy(
          ethers.ZeroAddress,
          await usdg.getAddress(),
          await nvdax.getAddress(),
          await spyx.getAddress(),
          await xbtc.getAddress()
        )
      ).to.be.revertedWith("VaultFactory: zero agent");
    });

    it("rejects a zero token address", async function () {
      const { agent, usdg, nvdax, spyx } = await deployFixture();
      const VaultFactory = await ethers.getContractFactory("VaultFactory");
      await expect(
        VaultFactory.deploy(
          agent.address,
          await usdg.getAddress(),
          await nvdax.getAddress(),
          await spyx.getAddress(),
          ethers.ZeroAddress
        )
      ).to.be.revertedWith("VaultFactory: zero token");
    });
  });

  describe("createVault, per preset", function () {
    for (const [name, preset] of Object.entries(PRESET)) {
      it(`configures the ${name} preset correctly and hands ownership to the caller`, async function () {
        const { agent, owner, usdg, nvdax, spyx, xbtc, factory } = await deployFixture();
        const tokens = [usdg, nvdax, spyx, xbtc];

        const tx = await factory.connect(owner).createVault(preset);
        const receipt = await tx.wait();

        const event = receipt.logs
          .map((log) => {
            try {
              return factory.interface.parseLog(log);
            } catch {
              return null;
            }
          })
          .find((parsed) => parsed?.name === "VaultCreated");
        expect(event, "VaultCreated event not emitted").to.not.be.undefined;
        expect(event.args.owner).to.equal(owner.address);
        expect(event.args.preset).to.equal(BigInt(preset));

        const vault = await ethers.getContractAt("PolicyVault", event.args.vault);

        expect(await vault.owner()).to.equal(owner.address);
        expect(await vault.agent()).to.equal(agent.address);
        expect(await vault.totalTargetBps()).to.equal(10_000n);

        for (let i = 0; i < tokens.length; i++) {
          const tokenAddress = await tokens[i].getAddress();
          expect(await vault.isAllowedToken(tokenAddress)).to.equal(true);
          expect(await vault.targetAllocationBps(tokenAddress)).to.equal(EXPECTED_TARGETS[preset][i]);
          expect(await vault.maxHoldingAmount(tokenAddress)).to.equal(EXPECTED_MAX_HOLDING[i]);
          expect(await vault.maxTradeSize(tokenAddress)).to.equal(EXPECTED_MAX_TRADE[i]);
        }
      });
    }

    it("reports real gas cost for a createVault call, informational not a hard assertion", async function () {
      const { owner, factory } = await deployFixture();
      const tx = await factory.connect(owner).createVault(PRESET.Balanced);
      const receipt = await tx.wait();
      console.log(`      createVault gas used: ${receipt.gasUsed.toString()}`);
      expect(receipt.gasUsed).to.be.gt(0n);
    });
  });

  describe("ownership handoff", function () {
    it("leaves the factory with no lingering owner privileges on a vault it created", async function () {
      const { owner, usdg, factory } = await deployFixture();
      const tx = await factory.connect(owner).createVault(PRESET.Balanced);
      const receipt = await tx.wait();
      const event = receipt.logs.map((l) => {
        try {
          return factory.interface.parseLog(l);
        } catch {
          return null;
        }
      }).find((p) => p?.name === "VaultCreated");
      const vault = await ethers.getContractAt("PolicyVault", event.args.vault);

      // The factory contract itself has no signer, but simulate the call it would make to
      // prove it is rejected, the real guarantee this test exists for.
      const factoryAddress = await factory.getAddress();
      await ethers.provider.send("hardhat_impersonateAccount", [factoryAddress]);
      await ethers.provider.send("hardhat_setBalance", [factoryAddress, "0x" + (10n ** 18n).toString(16)]);
      const factorySigner = await ethers.getSigner(factoryAddress);

      await expect(
        vault.connect(factorySigner).setPolicy(await usdg.getAddress(), 5000, 0, 0)
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");

      await ethers.provider.send("hardhat_stopImpersonatingAccount", [factoryAddress]);
    });

    it("lets the real owner, not the deployer or the factory, manage the vault after creation", async function () {
      const { owner, usdg, factory } = await deployFixture();
      const tx = await factory.connect(owner).createVault(PRESET.Balanced);
      const receipt = await tx.wait();
      const event = receipt.logs.map((l) => {
        try {
          return factory.interface.parseLog(l);
        } catch {
          return null;
        }
      }).find((p) => p?.name === "VaultCreated");
      const vault = await ethers.getContractAt("PolicyVault", event.args.vault);

      // Same targetBps USDG already has (proven correct above), different maxTrade -
      // isolates "the owner can adjust this vault's policy" from the unrelated
      // totalTargetBps completeness constraint, which a same-value update can't trip.
      await expect(vault.connect(owner).setPolicy(await usdg.getAddress(), EXPECTED_TARGETS[PRESET.Balanced][0], 0, 3_000_000_000n))
        .to.not.be.reverted;
      expect(await vault.maxTradeSize(await usdg.getAddress())).to.equal(3_000_000_000n);
    });
  });

  describe("registry", function () {
    it("marks a vault it created as a real vault", async function () {
      const { owner, factory } = await deployFixture();
      const tx = await factory.connect(owner).createVault(PRESET.Conservative);
      const receipt = await tx.wait();
      const event = receipt.logs.map((l) => {
        try {
          return factory.interface.parseLog(l);
        } catch {
          return null;
        }
      }).find((p) => p?.name === "VaultCreated");

      expect(await factory.isVault(event.args.vault)).to.equal(true);
    });

    it("does not mark an arbitrary address as a vault", async function () {
      const { otherOwner, factory } = await deployFixture();
      expect(await factory.isVault(otherOwner.address)).to.equal(false);
    });

    it("does not mark a hand-deployed PolicyVault (not created via the factory) as a vault", async function () {
      const { agent, owner, factory } = await deployFixture();
      const PolicyVault = await ethers.getContractFactory("PolicyVault");
      const handDeployed = await PolicyVault.deploy(owner.address, agent.address);
      expect(await factory.isVault(await handDeployed.getAddress())).to.equal(false);
    });

    it("tracks multiple vaults for the same owner independently", async function () {
      const { owner, factory } = await deployFixture();
      await factory.connect(owner).createVault(PRESET.Conservative);
      await factory.connect(owner).createVault(PRESET.Growth);
      expect(await factory.vaultsByOwnerCount(owner.address)).to.equal(2n);
      expect(await factory.allVaultsCount()).to.equal(2n);
    });

    it("keeps vaults from different owners separate", async function () {
      const { owner, otherOwner, factory } = await deployFixture();
      await factory.connect(owner).createVault(PRESET.Balanced);
      await factory.connect(otherOwner).createVault(PRESET.Balanced);
      expect(await factory.vaultsByOwnerCount(owner.address)).to.equal(1n);
      expect(await factory.vaultsByOwnerCount(otherOwner.address)).to.equal(1n);
      expect(await factory.allVaultsCount()).to.equal(2n);
    });
  });

  describe("invalid preset", function () {
    it("reverts on an out-of-range preset value", async function () {
      const { owner, factory } = await deployFixture();
      // Preset is a 3-value enum (0-2). Solidity enum params are ABI-encoded as uint8, and
      // an out-of-range value fails ABI decoding with a panic before createVault's body
      // ever runs, this is Solidity's own type safety, not application logic, proven here
      // so a future refactor can't silently accept an invalid preset.
      await expect(factory.connect(owner).createVault(3)).to.be.reverted;
    });
  });
});
