import Dispatcher from "../src/Model/Dispatcher";

async function buildBothModesInParallel() {
  const [main, holo] = await Promise.all([
    Dispatcher.build({ mode: "main", useLookupTables: false }),
    Dispatcher.build({ mode: "holo", useLookupTables: false }),
  ]);

  console.log("Dispatchers ready:", {
    main: {
      mode: main.runtimeMode,
      programId: main.sageGameHandler.asStatic().SAGE_PROGRAM_ID,
    },
    holo: {
      mode: holo.runtimeMode,
      programId: holo.sageGameHandler.asStatic().SAGE_PROGRAM_ID,
    },
  });
}

buildBothModesInParallel().catch((err) => {
  console.error("Failed to build dispatchers in parallel", err);
  process.exit(1);
});
