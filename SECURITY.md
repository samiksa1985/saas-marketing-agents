# Security Policy

## Scope

This repository is a collection of Markdown agent/skill definitions plus a few
helper shell scripts (`scripts/`). It ships no runtime service and processes no
user data. The realistic security surface is:

- The helper scripts in `scripts/` (`install.sh`, `convert.sh`, `lint-agents.sh`),
  which run on a contributor's or user's machine.
- Prompt content in the agent/skill Markdown files (e.g., instructions that could
  encourage unsafe actions if followed blindly).

## Reporting a Vulnerability

Please **do not** open a public issue for a security problem.

- Preferred: use GitHub's **private vulnerability reporting** on this repository
  (Security → *Report a vulnerability*).
- Alternatively, contact the maintainer through their
  [GitHub profile](https://github.com/shalintripathi).

Include a description, reproduction steps, and the affected file(s). We aim to
acknowledge reports within a few days and to address confirmed issues promptly.

## Using These Agents Safely

The agents produce marketing recommendations and drafts. Treat their output as a
first draft to review, not as verified fact — check claims, statistics, and legal
or compliance-sensitive statements before publishing. Never paste secrets (API
keys, passwords, customer PII) into a prompt.
