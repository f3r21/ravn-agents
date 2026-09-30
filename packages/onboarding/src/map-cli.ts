import { MapError } from "./build.js";
import { run } from "./cli.js";

try {
  process.exitCode = run(process.argv.slice(2));
} catch (error) {
  if (error instanceof MapError) {
    process.stderr.write(`map-cli: ${error.message}\n`);
    process.exitCode = 2;
  } else {
    throw error;
  }
}
