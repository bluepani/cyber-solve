export async function postPrComment({ octokit, owner, repo, issueNumber, body }) {
  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body,
  });
}
