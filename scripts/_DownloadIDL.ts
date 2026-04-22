import { AnchorProvider, Program, Wallet } from "@project-serum/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import * as fs from "fs";
const rpc_url = process.env["SOLANA_RPC_URL"];
console.log(`RPC URL: ${rpc_url}`);
const connection = new Connection(rpc_url || "http://localhost:8899", "confirmed");
const provider = new AnchorProvider(connection, new Wallet(Keypair.generate()) as any, AnchorProvider.defaultOptions());

// const HOLOSIM_PROGRAMS = {
//   SAGE_PROGRAM_ID: "SAgeTraQfBMdvGVDJYoEvjnbq5szW7RJPi6obDTDQUF",
//   PLAYER_PROFILE_PROGRAM_ID: "PprofUW1pURCnMW2si88GWPXEEK3Bvh9Tksy8WtnoYJ",
//   PROFILE_FACTION_PROGRAM_ID: "pFACSRuobDmvfMKq1bAzwj27t6d2GJhSCHb1VcfnRmq",

//   CARGO_PROGRAM_ID: "Cargo2VNTPPTi9c1vq1Jw5d3BWUNr18MjRtSupAghKEk",
//   POINTS_PROGRAM_ID: "Point2iBvz7j5TMVef8nEgpmz4pDr7tU7v3RjAfkQbM",
//   POINTS_STORE_PROGRAM_ID: "PsToRxhEPScGt1Bxpm7zNDRzaMk31t8Aox7fyewoVse",
// };
console.log("RPC URL:", rpc_url);
const HOLOSIM_PROGRAMS = {
  SAGE_PROGRAM_ID: "SAgEeT8u14TE69JXtanGSgNkEdoPUcLabeyZD2uw8x9",
  PLAYER_PROFILE_PROGRAM_ID: "PprofUW1pURCnMW2si88GWPXEEK3Bvh9Tksy8WtnoYJ",
  PROFILE_FACTION_PROGRAM_ID: "pFACzkX2eSpAjDyEohD6i3VRJvREtH9ynbtM1DwVFsj", //! No IDL DOWNLOAD

  CARGO_PROGRAM_ID: "CArGoi989iv3VL3xArrJXmYYDNhjwCX5ey5sY5KKwMG", // wd
  POINTS_PROGRAM_ID: "PointJfvuHi8DgGsPCy97EaZkQ6NvpghAAVkuquLf3w", // wd
  POINTS_STORE_PROGRAM_ID: "PsToRxhEPScGt1Bxpm7zNDRzaMk31t8Aox7fyewoVse",
};
const downloadIdl = async (label: string, publicKey: string) => {
  const programId = new PublicKey(publicKey);

  const idl = await Program.fetchIdl(programId, provider);
  if (!idl) {
    throw "IDL не е намерен за тази програма.";
    // process.exit(1);
  }
  let outputFile = "_" + label + ".idl.json";
  fs.writeFileSync(outputFile, JSON.stringify(idl, null, 2));
  console.log(`IDL wrote in file: ${outputFile}`);
};

for (const [key, value] of Object.entries(HOLOSIM_PROGRAMS)) {
  await downloadIdl(key, value).catch((error) => {
    console.error(`Error downloading IDL for ${key}:`, error);
  });
}
