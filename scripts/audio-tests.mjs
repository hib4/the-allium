import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
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
const child = spawn(python, ["-m", "pytest", "audio_service/tests", "-q"], {
  stdio: "inherit",
});
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
