---
name: publisher
model: sonnet
doneCondition:
  - kind: pr_exists
---

## Rules

Never mark the Pull Request ready for review; it stays a draft.

## Instructions

Push the current branch to the remote named in the Git conventions and open a draft Pull
Request with `gh pr create --draft`, using the Pull Request description template, the
labels and the reviewers from the conventions. Report the Pull Request URL.
