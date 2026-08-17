import { rmSync } from "node:fs";
import { join } from "node:path";

const clientModels = join(process.cwd(), "dist", "client", "models", "characters");

// Character rigging studies live below public/ for local tooling, but they are
// ignored source workspaces rather than runtime assets. Keep them out of the
// deployable static bundle; final optimized GLBs remain beside each character.
for (const character of ["fox-tpose", "tiger-tpose"]) {
  for (const directory of ["temp", "temp1"]) {
    rmSync(join(clientModels, character, directory), { recursive: true, force: true });
  }
}
