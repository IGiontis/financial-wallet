// Starts the Auth and Firestore emulators for local development, keeping their
// data between runs in `.emulator-data/` (git-ignored).
//
// The CLI refuses `--import` when there is nothing exported yet, so the flag is
// only passed once a previous run has saved something. Needs the Firebase CLI
// (`npm i -g firebase-tools`) and Java.
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";

const DATA = ".emulator-data";
const args = ["emulators:start", "--project", "demo-myfiwallet", "--only", "auth,firestore", `--export-on-exit=${DATA}`];
if (existsSync(`${DATA}/firebase-export-metadata.json`)) args.push(`--import=${DATA}`);

const child = spawn("firebase", args, { stdio: "inherit", shell: process.platform === "win32" });
child.on("exit", (code) => process.exit(code ?? 0));
