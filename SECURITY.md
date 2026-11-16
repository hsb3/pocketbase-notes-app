# Security policy

## Supported versions

Only the latest release and the current `main` branch receive security fixes.

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Report it privately through GitHub: open the repository's
[Security tab](https://github.com/hsb3/pocketbase-notes-app/security) and choose
**Report a vulnerability**, or go straight to the
[private report form](https://github.com/hsb3/pocketbase-notes-app/security/advisories/new).

Include what you can of:

- the affected version or commit, and how the app was deployed;
- steps to reproduce, or a proof of concept;
- what an attacker could read, change or break.

This is a single-maintainer project, so replies are best effort. Expect an
acknowledgement within about a week. Once a fix is released, the advisory is
published and you are credited unless you ask not to be.

## Scope

In scope: this repository's application code, PocketBase hooks and migrations, and
the Docker image and deployment configuration it ships.

Out of scope: vulnerabilities in PocketBase itself or in third-party dependencies
(report those upstream), and any deployment you do not operate yourself. Do not test
against someone else's running instance.
