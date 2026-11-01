import { afterEach, describe, expect, it, vi } from "vitest";
import { Connection, Keypair } from "@solana/web3.js";
import { verifySolanaTransaction } from "./verify";

afterEach(() => vi.restoreAllMocks());

describe("verifySolanaTransaction", () => {
  it("fetches and verifies a v0 parsed token transfer", async () => {
    const merchant = Keypair.generate().publicKey;
    const sender = Keypair.generate().publicKey;
    const mint = Keypair.generate().publicKey;
    const sourceTokenAccount = Keypair.generate().publicKey;
    const destinationTokenAccount = Keypair.generate().publicKey;
    const merchantAddress = merchant.toBase58();
    const senderAddress = sender.toBase58();
    const mintAddress = mint.toBase58();
    const sourceAddress = sourceTokenAccount.toBase58();
    const destinationAddress = destinationTokenAccount.toBase58();

    const parsedV0Transaction = {
      version: 0,
      slot: 123,
      blockTime: 456,
      meta: {
        err: null,
        fee: 5000,
        preBalances: [],
        postBalances: [],
        preTokenBalances: [
          { accountIndex: 2, mint: mintAddress, owner: senderAddress, uiTokenAmount: { amount: "1000000" } },
          { accountIndex: 3, mint: mintAddress, owner: merchantAddress, uiTokenAmount: { amount: "0" } },
        ],
        postTokenBalances: [
          { accountIndex: 2, mint: mintAddress, owner: senderAddress, uiTokenAmount: { amount: "0" } },
          { accountIndex: 3, mint: mintAddress, owner: merchantAddress, uiTokenAmount: { amount: "1000000" } },
        ],
      },
      transaction: {
        message: {
          accountKeys: [merchant, sender, sourceTokenAccount, destinationTokenAccount].map((pubkey) => ({ pubkey })),
          instructions: [{
            program: "spl-token",
            parsed: {
              type: "transferChecked",
              info: {
                source: sourceAddress,
                destination: destinationAddress,
                mint: mintAddress,
                tokenAmount: { amount: "1000000", decimals: 6 },
              },
            },
          }],
        },
      },
    };
    const getParsedTransaction = vi.spyOn(Connection.prototype, "getParsedTransaction")
      .mockResolvedValue(parsedV0Transaction as any);

    const result = await verifySolanaTransaction({
      signature: "versioned-signature",
      expectedMerchantWallet: merchantAddress,
      expectedSender: senderAddress,
      expectedAmount: 1,
      expectedTokenMint: mintAddress,
      expectedTokenDecimals: 6,
      rpcUrl: "http://127.0.0.1:8899",
    });

    expect(result).toMatchObject({ verified: true, status: "success", actualTransferredBaseUnits: 1_000_000n });
    expect(getParsedTransaction).toHaveBeenCalledWith("versioned-signature", {
      maxSupportedTransactionVersion: 0,
      commitment: "finalized",
    });
  });
});