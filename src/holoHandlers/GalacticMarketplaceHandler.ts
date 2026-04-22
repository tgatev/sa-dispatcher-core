import { GetProgramAccountsFilter, PublicKey } from "@solana/web3.js";
import { AnchorTypes } from "@staratlas/data-source";
import { SageGameHandler } from "./GameHandler";
import { GalacticMarketplaceIDL } from "@staratlas/galactic-marketplace";

export type GalacticMarketplaceTypes = AnchorTypes<GalacticMarketplaceIDL>;
// Accounts
export type GalacticMarketplaceIDLAccounts = GalacticMarketplaceTypes["Accounts"];
export type MarketVarsAccount = GalacticMarketplaceIDLAccounts["marketVars"];
export type OpenOrdersCounterAccount = GalacticMarketplaceIDLAccounts["openOrdersCounter"];
export type OrderAccount = GalacticMarketplaceIDLAccounts["orderAccount"];
export type RegisteredCurrencyAccount = GalacticMarketplaceIDLAccounts["registeredCurrency"];
export type FeeReductionAccount = GalacticMarketplaceIDLAccounts["feeReduction"];
export type AtlasRateAccount = GalacticMarketplaceIDLAccounts["atlasRateAccount"];

export interface OrderAccountItem {
  publicKey: PublicKey;
  account: OrderAccount;
}

export class GalacticMarketplaceHandler {
  constructor(private _gameHandler: SageGameHandler) {}

  /**
   * Get an array of open orders applaing
   * @param connection
   * @param programId - Deployed program ID for GM program
   */
  async getOpenOrders(filters: { player?: PublicKey; currency?: PublicKey; asset?: PublicKey } = {}) {
    const filter: GetProgramAccountsFilter[] = [
      {
        dataSize: 201,
      },
    ];

    // Filter by player
    if (filters.player) {
      filter.push({
        memcmp: {
          offset: 8,
          bytes: filters.player.toBase58(),
        },
      });
    }

    // Filter by currency
    if (filters.currency) {
      filter.push({
        memcmp: {
          offset: 40,
          bytes: filters.currency.toBase58(),
        },
      });
    }

    // Filter by asset
    if (filters.asset) {
      filter.push({
        memcmp: {
          offset: 72,
          bytes: filters.asset.toBase58(),
        },
      });
    }
    const orderAccounts: OrderAccountItem[] = await this._gameHandler.marketplaceProgram.account.orderAccount.all(filter);

    return orderAccounts;
  }

  async convertValues(orderData: OrderAccountItem) {
    return {
      mint: orderData.account.assetMint.toBase58(),
      currencyMint: orderData.account.currencyMint.toBase58(),
      // Price: 1760773000000000 / 100000000 = 17607730 [A]
      price: BigInt(orderData.account.price),
      currentAmount: BigInt(orderData.account.orderRemainingQty),
      totalAmount: BigInt(orderData.account.orderOriginationQty),
      side: orderData.account.orderSide,
      timestamp: Number(orderData.account.createdAtTimestamp * 1000),
      date: new Date(Number(orderData.account.createdAtTimestamp * 1000)),
    };
  }
}
