const DEFAULT_ATTEMPTS = 6;
const DEFAULT_DELAY_MS = 2000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getPullRequestContext(context) {
  const pullRequest = context.payload.pull_request;

  if (!pullRequest) {
    throw new Error("This action only supports pull_request events.");
  }

  return {
    owner: context.repo.owner,
    repo: context.repo.repo,
    pullNumber: pullRequest.number,
    baseRef: pullRequest.base.ref,
    headRef: pullRequest.head.ref,
    isFork: Boolean(pullRequest.head.repo?.fork),
    headRepoFullName: pullRequest.head.repo?.full_name ?? "",
  };
}

export async function pollMergeableState({
  octokit,
  owner,
  repo,
  pullNumber,
  attempts = DEFAULT_ATTEMPTS,
  delayMs = DEFAULT_DELAY_MS,
  log = () => {},
}) {
  let latest = {
    mergeable_state: "unknown",
    mergeable: null,
    attempt: 0,
  };

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: pullNumber,
    });

    latest = {
      mergeable_state: response.data.mergeable_state ?? "unknown",
      mergeable: response.data.mergeable,
      attempt,
    };

    log(
      `Poll ${attempt}/${attempts}: mergeable_state=${latest.mergeable_state}, mergeable=${String(latest.mergeable)}`,
    );

    const shouldRetry = latest.mergeable_state === "unknown";

    if (!shouldRetry || attempt === attempts) {
      return latest;
    }

    await sleep(delayMs);
  }

  return latest;
}
