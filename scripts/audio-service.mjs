import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const local =
  process.platform === "win32"
    ? ".venv/Scripts/python.exe"
    : ".venv/bin/python";
const python =
  process.env.ALLIUM_PYTHON ||
  (existsSync(local)
    ? local
    : process.platform === "win32"
      ? "python"
      : "python3");
const args = [...process.argv.slice(2), "--development"];
if (args.includes("--test-fixture")) {
  args.splice(args.indexOf("--test-fixture"), 1);
  args.push(
    "--fixture",
    "--config",
    join(tmpdir(), `allium-test-${process.pid}.json`),
  );
}
const child = spawn(python, ["-m", "audio_service.server", ...args], {
  stdio: "inherit",
});
child.on("error", (error) => {
  console.error(
    `Cannot launch Python: ${error.message}. See docs/audio-setup.md.`,
  );
  process.exitCode = 1;
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
