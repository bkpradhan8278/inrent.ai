import { processIo } from "./io";
import { run } from "./program";

run(process.argv.slice(2), { io: processIo(), env: process.env })
  .then((code) => {
    process.exitCode = code;
  })
  .catch((e: unknown) => {
    process.stderr.write(`Unexpected error: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  });
