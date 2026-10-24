# @suptron/host-github

`RepoHost` on the GitHub CLI: the system uses the Commander's existing `gh` authentication and
never stores credentials. Every call is a `gh` subprocess run in the Checkout, so `gh` resolves the
repository from the working copy.

| Method                         | Command                                                                                      |
| ------------------------------ | -------------------------------------------------------------------------------------------- |
| `createDraftPullRequest`       | `gh pr create --draft --base … --head … --title … --body-file …` (+ `--label`, `--reviewer`) |
| `findPullRequest`              | `gh pr view <branch> --json number,url`                                                      |
| `getCiStatus`                  | `gh pr checks <number> --json name,state,bucket`                                             |
| `countUnresolvedReviewThreads` | `gh api graphql` on `pullRequest.reviewThreads`, paginated                                   |
| `healthCheck`                  | `gh auth status`                                                                             |

Unit tests use a captured `exec` and never call GitHub.

## Manual checklist for a live run

Use a scratch repository you own; nothing here deletes anything, but it does open a draft PR.

1. `gh auth status` succeeds and the scratch repository is cloned locally on a feature branch with
   at least one commit pushed.
2. `createDraftPullRequest` against that branch returns the URL of a new draft PR; the PR body
   equals the text you passed; labels and reviewers appear on it.
3. `findPullRequest` for the branch returns the same number; for a branch without a PR it returns
   `null`.
4. `getCiStatus` returns `none` on a repository without workflows, `pending` right after a push
   on one with workflows, and `success` or `failure` once they finish.
5. Leave one review comment unresolved: `countUnresolvedReviewThreads` returns `1`; resolve it:
   `0`.
6. Close the draft PR by hand afterwards; the system never does.
