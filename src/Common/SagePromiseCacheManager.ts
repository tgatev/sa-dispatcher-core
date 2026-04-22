import { PublicKey } from "@solana/web3.js";

type CacheKey = "getStarbaseAccount" | "getPlayerProfileAddress" | "getCargoTypeAddress" | "getStarbasePlayerAccount";

class CacheManager {
  private cache = new Map<string, any>();

  async getFromCache<T>(key: CacheKey, input: any[], fetcher: () => Promise<T>): Promise<T> {
    const cacheKey = `${key}:${k.toBase58()}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey) as T;
    }
    const data = await fetcher();
    this.cache.set(cacheKey, data);
    return data;
  }

  setToCache<T>(key: string, data: T) {
    this.cache.set(key, data);
  }
}

/** 
 ** Example Usage 
const cache = new CacheManager();

// getStarbaseAccount
const starbase = await cache.getFromCache<Starbase>("getStarbaseAccount", starbasePubkey, () => this.getStarbaseAccount(starbasePubkey));

// getPlayerProfileAddress
const profile = await cache.getFromCache<AccountInfo<Buffer>>("getPlayerProfileAddress", playerPubkey, () =>
  this.getPlayerProfileAddress(playerPubkey)
);

// getCargoTypeAddress
const cargoType = await cache.getFromCache<PublicKey>("getCargoTypeAddress", mint, () => this.getCargoTypeAddress(mint));

// getStarbasePlayerAccount
const starbasePlayer = await cache.getFromCache<StarbasePlayer>("getStarbasePlayerAccount", playerProfile, () =>
  this.getStarbasePlayerAccount(playerProfile, starbasePubkey)
);

// setToCache
cache.setToCache("customKey", somePromiseResult);

 */
