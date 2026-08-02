# pr-image

## Language

Prose documentation — `CONTEXT.md`, ADRs, design notes — is written in Traditional Chinese.

Code is English: identifiers, comments, commit messages, CLI output, error messages. Glossary terms in `CONTEXT.md` keep their English names because they become identifiers; only their definitions are in Chinese.

`README.md` is English. `README.zh-TW.md` mirrors it in Traditional Chinese — when one changes, change the other in the same commit.

This file and everything under `docs/agents/` stay in English; they are instructions for tooling, not documentation for readers.

## Agent skills

### Issue tracker

Issues live in GitHub Issues on `yurenju/pr-image`, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, each label string equal to its name. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
