import * as core from "@actions/core";
import * as github from "@actions/github";

import { postPrComment } from "./github/comments.js";
import { getPullRequestContext, pollMergeableState } from "./github/pr.js";
import { removeConflictBlocksInWorkingTree } from "./git/conflictScan.js";
import { commitAndPushChanges } from "./git/commitPush.js";

const VALID_COMMENT_MODES = new Set(["always", "only-on-conflict"]);

function normalizeCommentMode(value) {
  if (VALID_COMMENT_MODES.has(value)) {
    return value;
  }

  core.warning(
    `Invalid comment-mode "${value}". Falling back to "only-on-conflict".`,
  );
  return "only-on-conflict";
}

function isMergeable(result) {
  return result.mergeable === true || result.mergeable_state === "clean";
}

function isDirty(result) {
  return result.mergeable === false || result.mergeable_state === "dirty";
}

function formatDirtySummary({
  mergeableState,
  scanResult,
  commitResult,
  headRef,
  pushError,
}) {
  const lines = [
    `CyberSolve V0 detected merge conflicts (\`mergeable_state: ${mergeableState}\`).`,
    "",
    `Blocks removed: ${scanResult.totalBlocksRemoved}`,
    `Files modified: ${scanResult.filesModified.length}`,
  ];

  if (scanResult.details.length > 0) {
    lines.push("");
    lines.push("Modified files:");
    for (const item of scanResult.details) {
      const suffix = item.blocksRemoved === 1 ? "block" : "blocks";
      lines.push(`- \`${item.path}\` (${item.blocksRemoved} ${suffix})`);
    }
  }

  lines.push("");
  if (pushError) {
    lines.push(`Commit/push status: failed (${pushError})`);
  } else if (commitResult.committed && commitResult.pushed) {
    lines.push(`Commit pushed to \`${headRef}\` as \`${commitResult.commitSha}\`.`);
  } else {
    lines.push("No commit created (no file changes after scan).");
  }

  lines.push(
    "Placeholder inserted for each conflict block: `/* conflict removed by CyberSolve V0 */`.",
  );

  return lines.join("\n");
}

async function safeComment({ octokit, owner, repo, issueNumber, body }) {
  try {
    await postPrComment({ octokit, owner, repo, issueNumber, body });
  } catch (error) {
    core.warning(`Failed to post PR comment: ${error.message}`);
  }
}

async function run() {
  const token = core.getInput("github-token", { required: true });
  const commentMode = normalizeCommentMode(core.getInput("comment-mode") || "only-on-conflict");

  const octokit = github.getOctokit(token);
  const pr = getPullRequestContext(github.context);

  core.info(`CyberSolve V0 running on PR #${pr.pullNumber} (${pr.headRef} -> ${pr.baseRef})`);

  const mergeability = await pollMergeableState({
    octokit,
    owner: pr.owner,
    repo: pr.repo,
    pullNumber: pr.pullNumber,
    attempts: 6,
    delayMs: 2000,
    log: (message) => core.info(message),
  });

  if (isMergeable(mergeability)) {
    core.info("Mergeable; exiting.");

    if (commentMode === "always") {
      await safeComment({
        octokit,
        owner: pr.owner,
        repo: pr.repo,
        issueNumber: pr.pullNumber,
        body: `CyberSolve V0 checked this PR and found it mergeable (\`mergeable_state: ${mergeability.mergeable_state}\`). No action taken.`,
      });
    }

    return;
  }

  if (isDirty(mergeability)) {
    if (pr.isFork) {
      await safeComment({
        octokit,
        owner: pr.owner,
        repo: pr.repo,
        issueNumber: pr.pullNumber,
        body: "CyberSolve V0: conflicts detected; cannot auto-push to forks.",
      });
      return;
    }

    const scanResult = await removeConflictBlocksInWorkingTree();

    let commitResult = {
      committed: false,
      pushed: false,
      commitSha: null,
    };
    let pushError = null;

    try {
      commitResult = await commitAndPushChanges({
        branch: pr.headRef,
        commitMessage: "CyberSolve V0: remove conflict blocks",
      });
    } catch (error) {
      pushError = error.message;
      core.warning(`Commit/push step failed: ${pushError}`);
    }

    await safeComment({
      octokit,
      owner: pr.owner,
      repo: pr.repo,
      issueNumber: pr.pullNumber,
      body: formatDirtySummary({
        mergeableState: mergeability.mergeable_state,
        scanResult,
        commitResult,
        headRef: pr.headRef,
        pushError,
      }),
    });

    return;
  }

  await safeComment({
    octokit,
    owner: pr.owner,
    repo: pr.repo,
    issueNumber: pr.pullNumber,
    body: `CyberSolve V0 could not classify mergeability after polling (mergeable_state: \`${mergeability.mergeable_state}\`, mergeable: \`${String(mergeability.mergeable)}\`). No changes were pushed.`,
  });

  core.info(
    `Non-terminal mergeability state "${mergeability.mergeable_state}" after polling; exiting without failure.`,
  );
}

run().catch((error) => {
  core.error(`CyberSolve V0 encountered an unexpected error: ${error.message}`);
});
