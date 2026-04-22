import { createInterface } from "readline";

export const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

export const prompt = (questionText: string) =>
  new Promise<string>((resolve) => {
    if (!isCLI()) {
      resolve("");
      return;
    }
    rl.question(questionText, resolve);
  });

export function isCLI() {
  if (typeof process !== "undefined" && process.stdin.isTTY) {
    // CLI
    //   console.log("Running in CLI");
    return true;
  }
  console.error("Running in WEB CRON OR PIPE ");
  throw "DON'T CALL CLI READLINE IN WEB/CRON/PIPE";
  // Not a CLI (web, cron, or Pipe)
  //   console.log("Not running in CLI");
  return false;
}
