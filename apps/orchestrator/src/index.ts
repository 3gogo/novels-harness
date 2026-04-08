import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildApp } from "./app.js";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);
const projectEnvPath = path.join(projectRoot, ".env.local");

loadProjectEnv();

async function main() {
  const app = buildApp();
  const port = Number(process.env.PORT ?? "4000");

  try {
    await app.listen({
      host: "127.0.0.1",
      port,
    });
  } catch (error) {
    app.log.error(error);
    process.exitCode = 1;
  }
}

void main();

function loadProjectEnv() {
  try {
    process.loadEnvFile(projectEnvPath);
  } catch (error) {
    if (isMissingFileError(error)) {
      return;
    }

    throw error;
  }
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
