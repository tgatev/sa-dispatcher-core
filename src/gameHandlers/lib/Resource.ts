import { ResourceHardnessMap, SageResourcesMints } from "../../Common/GameHandler";
import { PublicKey } from "@solana/web3.js";

export enum Resource {
  arco = "arco",
  biomass = "biomass",
  carbon = "carbon",
  diamond = "diamond",
  hydrogen = "hydrogen",
  iron_ore = "iron_ore",
  copper_ore = "copper_ore",
  lumanite = "lumanite",
  rochinol = "rochinol",
  silica = "silica",
  nitrogen = "nitrogen",
  titanium_ore = "titanium_ore",
  // Additional R4
  fuel = "fuel",
  food = "food",
  ammunitions = "ammunitions",
  ammo = "ammunitions",
  toolkit = "toolkit",
  sdu = "sdu",
  // Components
  super_conductor = "super_conductor",
  strange_emitter = "strange_emitter",
  radiation_absorber = "radiation_absorber",
  power_source = "power_source",
  particle_accelerator = "particle_accelerator",
  framework = "framework",
  electromagnet = "electromagnet",
  energy_substrate = "energy_substrate",
  aerogel = "aerogel",
  // Compound Materials
  steel = "steel",
  polymer = "polymer",
  magnet = "magnet",
  iron = "iron",
  hydrocarbon = "hydrocarbon",
  graphene = "graphene",
  electronics = "electronics",
  copper = "copper",
  copper_wire = "copper_wire",
  crystal_lattice = "crystal_lattice",
  council_rfr = "council_rfr",
  field_stabilizer = "field_stabilizer",
  titanium = "titanium",
  // Contracts
  // mud
  mic = "mic", // https://play.staratlas.com/market/mic9ZayXBs7x3T6qgM2VskuaWFC8egCQBkTHcy8BoPM/?r=26a5rhrtgql58pmn
  mcgf = "mcgf", // https://play.staratlas.com/market/mic2AcEbMAjxoYGWaobvTMKzzNraSRVFaDaKEM2YrTD/?r=26a5rhrtgql58pmn
  // oni
  oic = "oic", // https://play.staratlas.com/market/oicT4ECU7nuPBZD2HUg8sb9nG4MDXWaE8vAnzwzXqcg/?r=26a5rhrtgql58pmn
  ocvr = "ocvr", // https://play.staratlas.com/market/oiC26XFt8HR1xzw3Y6WJ9wMTdtY1g9k1mthMqwRAn1X/?r=26a5rhrtgql58pmn
  // ustur
  uic = "uic", // https://play.staratlas.com/market/uicF2zhVoZguiFbr2KWp3kFBYwezs6HZqMzQfLbXw1A/?r=26a5rhrtgql58pmn
  ucor = "ucor", // https://play.staratlas.com/market/uiC2QNxpUxu1VqFefrbN6eDucaW2g9YnB4EZosMQeec/?r=26a5rhrtgql58pmn
}

export const resourceHardness: ResourceHardnessMap = {
  arco: 4,
  biomass: 1,
  carbon: 1,
  diamond: 4,
  hydrogen: 1,
  iron_ore: 2,
  copper_ore: 2,
  lumanite: 2.5,
  rochinol: 4,
  silica: 2,
  nitrogen: 1,
  titanium_ore: 5,
};

export const SAGE_RESOURCES_MINTS: SageResourcesMints = {
  arco: new PublicKey("ARCoQ9dndpg6wE2rRexzfwgJR3NoWWhpcww3xQcQLukg"),
  biomass: new PublicKey("MASS9GqtJz6ABisAxcUn3FeR4phMqH1XfG6LPKJePog"),
  carbon: new PublicKey("CARBWKWvxEuMcq3MqCxYfi7UoFVpL9c4rsQS99tw6i4X"),
  diamond: new PublicKey("DMNDKqygEN3WXKVrAD4ofkYBc4CKNRhFUbXP4VK7a944"),
  hydrogen: new PublicKey("HYDR4EPHJcDPcaLYUcNCtrXUdt1PnaN4MvE655pevBYp"),
  iron_ore: new PublicKey("FeorejFjRRAfusN9Fg3WjEZ1dRCf74o6xwT5vDt3R34J"),
  copper_ore: new PublicKey("CUore1tNkiubxSwDEtLc3Ybs1xfWLs8uGjyydUYZ25xc"),
  lumanite: new PublicKey("LUMACqD5LaKjs1AeuJYToybasTXoYQ7YkxJEc4jowNj"),
  rochinol: new PublicKey("RCH1Zhg4zcSSQK8rw2s6rDMVsgBEWa4kiv1oLFndrN5"),
  silica: new PublicKey("SiLiCA4xKGkyymB5XteUVmUeLqE4JGQTyWBpKFESLgh"),
  nitrogen: new PublicKey("Nitro6idW5JCb2ysUPGUAvVqv3HmUR7NVH7NdybGJ4L"),
  titanium_ore: new PublicKey("tiorehR1rLfeATZ96YoByUkvNFsBfUUSQWgSH2mizXL"),
  // Additional R4
  fuel: new PublicKey("fueL3hBZjLLLJHiFH9cqZoozTG3XQZ53diwFPwbzNim"),
  food: new PublicKey("foodQJAztMzX1DKpLaiounNe2BDMds5RNuPC6jsNrDG"),
  ammunition: new PublicKey("ammoK8AkX2wnebQb35cDAZtTkvsXQbi82cGeTnUvvfK"),
  ammunitions: new PublicKey("ammoK8AkX2wnebQb35cDAZtTkvsXQbi82cGeTnUvvfK"), // alias
  ammo: new PublicKey("ammoK8AkX2wnebQb35cDAZtTkvsXQbi82cGeTnUvvfK"), // alias
  toolkit: new PublicKey("tooLsNYLiVqzg8o4m3L2Uetbn62mvMWRqkog6PQeYKL"),
  sdu: new PublicKey("SDUsgfSZaDhhZ76U3ZgvtFiXsfnHbf2VrzYxjBZ5YbM"),
  // Components
  super_conductor: new PublicKey("CoNDDRCNxXAMGscCdejioDzb6XKxSzonbWb36wzSgp5T"),
  strange_emitter: new PublicKey("EMiTWSLgjDVkBbLFaMcGU6QqFWzX9JX6kqs1UtUjsmJA"),
  radiation_absorber: new PublicKey("RABSXX6RcqJ1L5qsGY64j91pmbQVbsYRQuw1mmxhxFe"),
  power_source: new PublicKey("PoWRYJnw3YDSyXgNtN3mQ3TKUMoUSsLAbvE8Ejade3u"),
  particle_accelerator: new PublicKey("PTCLSWbwZ3mqZqHAporphY2ofio8acsastaHfoP87Dc"),
  framework: new PublicKey("FMWKb7YJA5upZHbu5FjVRRoxdDw2FYFAu284VqUGF9C2"),
  electromagnet: new PublicKey("EMAGoQSP89CJV5focVjrpEuE4CeqJ4k1DouQW7gUu7yX"),
  energy_substrate: new PublicKey("SUBSVX9LYiPrzHeg2bZrqFSDSKkrQkiCesr6SjtdHaX"),
  aerogel: new PublicKey("aeroBCMu6AX6bCLYd1VQtigqZh8NGSjn54H1YSczHeJ"),
  // Compound Materials
  steel: new PublicKey("STEELXLJ8nfJy3P4aNuGxyNRbWPohqHSwxY75NsJRGG"),
  polymer: new PublicKey("PoLYs2hbRt5iDibrkPT9e6xWuhSS45yZji5ChgJBvcB"),
  magnet: new PublicKey("MAGNMDeDJLvGAnriBvzWruZHfXNwWHhxnoNF75AQYM5"),
  iron: new PublicKey("ironxrUhTEaBiR9Pgp6hy4qWx6V2FirDoXhsFP25GFP"),
  hydrocarbon: new PublicKey("HYCBuSWCJ5ZEyANexU94y1BaBPtAX2kzBgGD2vES2t6M"),
  graphene: new PublicKey("GRAPHKGoKtXtdPBx17h6fWopdT5tLjfAP8cDJ1SvvDn4"),
  electronics: new PublicKey("ELECrjC8m9GxCqcm4XCNpFvkS8fHStAvymS6MJbe3XLZ"),
  copper: new PublicKey("CPPRam7wKuBkYzN5zCffgNU17RKaeMEns4ZD83BqBVNR"),
  copper_wire: new PublicKey("cwirGHLB2heKjCeTy4Mbp4M443fU4V7vy2JouvYbZna"),
  crystal_lattice: new PublicKey("CRYSNnUd7cZvVfrEVtVNKmXiCPYdZ1S5pM5qG2FDVZHF"),
  council_rfr: new PublicKey("CRYSNnUd7cZvVfrEVtVNKmXiCPYdZ1S5pM5qG2FDVZhf"),
  field_stabilizer: new PublicKey("FiELD9fGaCgiNMfzQKKZD78wxwnBHTwjiiJfsieb6VGb"),
  titanium: new PublicKey("TTNM1SMkM7VKtyPW6CNBZ4cg3An3zzQ8NVLS2HpMaWL"),
  // Mud Contracts
  mic: new PublicKey("mic9ZayXBs7x3T6qgM2VskuaWFC8egCQBkTHcy8BoPM"),
  mcgf: new PublicKey("mic2AcEbMAjxoYGWaobvTMKzzNraSRVFaDaKEM2YrTD"),

  // ONI Contracts
  oic: new PublicKey("oicT4ECU7nuPBZD2HUg8sb9nG4MDXWaE8vAnzwzXqcg"),
  ocvr: new PublicKey("oiC26XFt8HR1xzw3Y6WJ9wMTdtY1g9k1mthMqwRAn1X"),
  // USTUR Contracts
  uic: new PublicKey("uicF2zhVoZguiFbr2KWp3kFBYwezs6HZqMzQfLbXw1A"),
  ucor: new PublicKey("uiC2QNxpUxu1VqFefrbN6eDucaW2g9YnB4EZosMQeec"),

  // Common Contracts
  cqn: new PublicKey("ic3AfsMFGKjkftEkpZLLdCGHmSQX5RwH92zhXUZVNCW"),
  csc: new PublicKey("ic3BNHDBzoW8suW4q9a9qt5PkK7D38T4raGDc1gyuRh"),
};
