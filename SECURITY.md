# Security Policy

## Supported versions

Before 1.0, only the latest published minor release receives security fixes. The 1.0 release will
restate this policy.

| Version                                 | Supported |
| --------------------------------------- | --------- |
| Latest minor (newest `0.x` on npm)      | Yes       |
| Older minors                            | No        |

## Reporting a vulnerability

Do not open a public issue, discussion or pull request for a security problem.

Report it privately through GitHub's private vulnerability reporting: open the repository's
**Security** tab and choose **Report a vulnerability**, or go directly to
<https://github.com/AsenaJs/Asena/security/advisories/new>.

Please include:

- the affected `@asenajs/asena` version, the adapter (and its version) and the Bun version;
- a description of the problem and its impact;
- the steps or a minimal project that reproduces it;
- any known workaround.

## What happens next

Every report is acknowledged in the advisory thread. A confirmed vulnerability is fixed in a patch
release of the latest minor and disclosed through a GitHub security advisory, crediting the reporter
unless they ask otherwise.
