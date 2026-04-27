# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in this action, please report it
privately so we can address it before public disclosure.

**Preferred channel:** [Open a private vulnerability report](https://github.com/vaulted-fyi/share-secret/security/advisories/new)
via GitHub Security Advisories.

Please include:

- A description of the vulnerability and its impact
- Steps to reproduce, including affected versions
- Any proof-of-concept code or relevant logs

We will acknowledge receipt within 3 business days and aim to provide a
remediation plan within 14 days. Coordinated disclosure timelines are
case-by-case based on severity and complexity.

## Scope

This repository contains a GitHub Action that wraps client-side encryption
via [`@vaulted/crypto`](https://www.npmjs.com/package/@vaulted/crypto) and
talks to the [vaulted.fyi](https://vaulted.fyi) API. In-scope reports include:

- Vulnerabilities in this Action's source or build pipeline
- Workflow injection or secret-exfiltration paths in the Action itself

For issues in the underlying crypto library or the vaulted.fyi service,
please report through their respective security channels.

## Supported Versions

Only the latest major release receives security updates. Pin by major
version (`@v1`) or by commit SHA to receive fixes automatically.
