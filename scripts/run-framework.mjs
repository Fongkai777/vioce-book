import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readExecutionProfile } from "./execution-profile.mjs";
import { projectRoot } from "./sites-env.mjs";

const [command, ...args] = process.argv.slice(2);
if (!["dev", "build"].includes(command)) throw new Error("Expected dev or build.");
const managedLinux = readExecutionProfile() === "managed-linux";

// Keep PDF.js' worker at a stable same-origin URL. Bundling it through
// import.meta.url can produce a file:/// URL in the hosted Vinext build.
mkdirSync(path.join(projectRoot, "public"), { recursive: true });
cpSync(
  path.join(projectRoot, "node_modules/pdfjs-dist/build/pdf.worker.min.mjs"),
  path.join(projectRoot, "public/pdf.worker.min.mjs"),
);

if (managedLinux && command === "build") {
  const result = spawnSync("bash", [
    fileURLToPath(new URL("./build-verified.sh", import.meta.url)), ...args,
  ], { stdio: "inherit" });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

// Import in this process so the preview owner retains its PID and signals.
const cli = new URL(managedLinux
  ? "../node_modules/vite/bin/vite.js"
  : "../node_modules/vinext/dist/cli.js", import.meta.url);
process.argv = [process.execPath, fileURLToPath(cli), command,
  ...(!managedLinux && command === "dev" ? ["--port", "5173"] : []), ...args];
await import(cli.href);
