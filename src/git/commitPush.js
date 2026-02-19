import { execFileSync } from "node:child_process";

function runGit(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function hasChanges() {
  const status = runGit(["status", "--porcelain"]);
  return status.length > 0;
}

export async function commitAndPushChanges({ branch, commitMessage }) {
  if (!hasChanges()) {
    return {
      committed: false,
      pushed: false,
      commitSha: null,
    };
  }

  runGit(["config", "user.name", "github-actions[bot]"]);
  runGit(["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"]);

  runGit(["add", "-A"]);
  runGit(["commit", "-m", commitMessage]);

  const commitSha = runGit(["rev-parse", "HEAD"]);
  runGit(["push", "origin", `HEAD:${branch}`]);

  return {
    committed: true,
    pushed: true,
    commitSha,
  };
}
