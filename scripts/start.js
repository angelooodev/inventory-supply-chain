const { spawn } = require("child_process");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const isWindows = process.platform === "win32";
const npmCommand = "npm";

function runService(name, cwd) {
  const child = spawn(npmCommand, ["run", "dev"], {
    cwd,
    stdio: "inherit",
    env: { ...process.env },
    shell: isWindows,
  });

  child.on("exit", (code) => {
    if (code && code !== 0) {
      process.exitCode = code;
    }
  });

  child.on("error", (error) => {
    console.error(`${name} failed to start:`, error.message);
    process.exitCode = 1;
  });

  return child;
}

const processes = [
  runService("backend", path.join(rootDir, "backend")),
  runService("frontend", path.join(rootDir, "frontend")),
];

function shutdown(signal) {
  for (const child of processes) {
    if (!child.killed) {
      child.kill(signal);
    }
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
