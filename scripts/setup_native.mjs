#!/usr/bin/env node
/**
 * Native setup helper.
 *
 * Why this exists:
 * - The repo ships with `.npmrc` setting `ignore-scripts=true` to reduce OOM kills
 *   during `npm install`.
 * - That means Electron's postinstall (binary download) won't run automatically.
 * - We then need to (1) fetch Electron and (2) rebuild native modules (better-sqlite3)
 *   against the Electron ABI.
 *
 * This wrapper adds:
 * - Clear progress output (so "Killed: 9" is attributable to a step)
 * - Basic prerequisite check on macOS (Xcode CLT path)
 * - Conservative parallelism defaults to reduce peak memory usage
 */

import { spawnSync } from "node:child_process";
import os from "node:os";
import process from "node:process";

function run(cmd, args, opts = {}) {
  const pretty = [cmd, ...(args || [])].join(" ");
  console.log(`\n[cowork] $ ${pretty}`);
  const res = spawnSync(cmd, args, {
    stdio: "inherit",
    env: opts.env || process.env,
    cwd: opts.cwd || process.cwd(),
  });
  return res;
}

function computeJobs() {
  // Users should be able to run README commands without tweaking env vars.
  // Default to 1 job on macOS for reliability (reduces peak memory).
  const raw = process.env.COWORK_SETUP_JOBS;
  if (raw != null && String(raw).trim() !== "") {
    const parsed = Number.parseInt(String(raw), 10);
    if (Number.isFinite(parsed) && parsed >= 1) return parsed;
  }

  if (process.platform === "darwin") return 1;

  const cpuCount = Math.max(1, os.cpus()?.length ?? 1);
  return Math.min(2, cpuCount);
}

function baseEnvWithJobs(jobs) {
  // These influence node-gyp/make parallelism on macOS/Linux.
  // Always set safe values so global MAKEFLAGS doesn't accidentally cause OOM.
  const env = { ...process.env };
  env.npm_config_jobs = String(jobs);
  env.MAKEFLAGS = `-j${jobs}`;
  return env;
}

function isKilledByOS(res) {
  // `Killed: 9` => SIGKILL. Some wrappers surface this as exit 137.
  return res.signal === "SIGKILL" || res.status === 137;
}

function fail(res, context) {
  const sig = res.signal ? ` (signal ${res.signal})` : "";
  const code =
    res.status == null ? "" : ` (exit ${String(res.status).trim()})`;
  console.error(`\n[cowork] ${context} failed${sig}${code}.`);
  if (isKilledByOS(res)) {
    console.error(
      "[cowork] macOS terminated the process (usually memory pressure). " +
        "This script already limits parallelism; if it still happens, " +
        "close other apps and re-run `npm run setup`."
    );
  }
  process.exit(res.status ?? 1);
}

function checkPrereqs() {
  if (process.platform === "darwin") {
    const res = spawnSync("xcode-select", ["-p"], { encoding: "utf8" });
    if (res.status !== 0) {
      console.error(
        "\n[cowork] Xcode Command Line Tools not found.\n" +
          "Install them with:\n" +
          "  xcode-select --install\n"
      );
      process.exit(1);
    }
  }
}

function main() {
  console.log(
    `[cowork] Native setup (${process.platform}/${process.arch}) using Node ${process.version}`
  );

  checkPrereqs();

  const userSpecifiedJobs =
    process.env.COWORK_SETUP_JOBS != null &&
    String(process.env.COWORK_SETUP_JOBS).trim() !== "";

  let jobs = computeJobs();
  console.log(
    `[cowork] Using jobs=${jobs} (set COWORK_SETUP_JOBS=N to override)`
  );

  const runElectronInstall = (env) =>
    run(process.execPath, ["node_modules/electron/install.js"], { env });

  const runRebuild = (env) =>
    run(
      process.execPath,
      [
        "node_modules/@electron/rebuild/lib/cli.js",
        "-f",
        "-w",
        "better-sqlite3",
        "--sequential",
      ],
      { env }
    );

  const attempt = (attemptJobs) => {
    const env = baseEnvWithJobs(attemptJobs);

    // 1) Download/unpack Electron binary (postinstall is often skipped due to ignore-scripts=true).
    const installRes = runElectronInstall(env);
    if (installRes.status !== 0) return installRes;

    // 2) Rebuild better-sqlite3 against Electron.
    // Call the CLI entrypoint directly to avoid platform-specific .bin shims.
    const rebuildRes = runRebuild(env);
    return rebuildRes;
  };

  let res = attempt(jobs);
  if (res.status !== 0 && isKilledByOS(res) && !userSpecifiedJobs && jobs > 1) {
    console.log(
      `\n[cowork] Detected SIGKILL; retrying once with jobs=1 to reduce memory...`
    );
    jobs = 1;
    res = attempt(jobs);
  }

  if (res.status !== 0) {
    // We don't know which sub-step failed at this point (install vs rebuild),
    // but the command output will show the last printed step.
    fail(res, "Native setup");
  }

  console.log("\n[cowork] Native setup complete.");
}

main();
