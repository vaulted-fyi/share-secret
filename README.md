# Vaulted Share Secret

[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-Vaulted%20Share%20Secret-purple?logo=github)](https://github.com/marketplace/actions/vaulted-share-secret)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/vaulted-fyi/share-secret/badge)](https://scorecard.dev/viewer/?uri=github.com/vaulted-fyi/share-secret)

Create and retrieve **end-to-end encrypted, self-destructing** secret links in GitHub Actions via [vaulted.fyi](https://vaulted.fyi).

Zero-knowledge encryption — your secret never touches the server in plaintext.

## Create a secret

```yaml
- name: Share deploy credentials
  uses: vaulted-fyi/share-secret@v1
  id: share
  with:
    secret: ${{ secrets.STAGING_API_KEY }}
    views: 1
    expires: 24h

- run: echo "Credentials at ${{ steps.share.outputs.url }}"
```

## Retrieve a secret

```yaml
- name: Fetch credentials
  uses: vaulted-fyi/share-secret/get@v1
  id: fetch
  with:
    url: ${{ secrets.CREDS_URL }}

# Always use env bindings for safety
- run: deploy --api-key "$CREDS"
  env:
    CREDS: ${{ steps.fetch.outputs.secret }}
```

## Create inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `secret` | yes | — | The secret to encrypt |
| `views` | no | `1` | Max views before auto-delete (1, 3, 5, 10) |
| `expires` | no | `24h` | Expiration (1h, 24h, 7d, 30d) |
| `passphrase` | no | — | Optional passphrase protection |

## Create outputs

| Output | Description |
|--------|-------------|
| `url` | The encrypted secret link |
| `id` | The secret ID |

## Get inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `url` | yes | — | Vaulted URL to decrypt |
| `passphrase` | no | — | Passphrase if the secret is protected |

## Get outputs

| Output | Description |
|--------|-------------|
| `secret` | The decrypted value (masked in logs) |

## Security

- **End-to-end encrypted** — encryption happens in the action runner, not on the server
- **Zero-knowledge** — the decryption key lives only in the URL fragment, never sent to the server
- **Log masking** — decrypted secrets are registered with GitHub's log masking before being set as outputs
- **Multi-line safe** — each line of multi-line secrets is masked individually

### Important: Use env bindings

Always access the secret output via `env:` bindings, not inline expansion:

```yaml
# Safe
- run: my-tool --token "$SECRET"
  env:
    SECRET: ${{ steps.fetch.outputs.secret }}

# Avoid — inline expansion may leak in edge cases
- run: my-tool --token "${{ steps.fetch.outputs.secret }}"
```

### Same-job only

Masked outputs cannot cross job boundaries — GitHub strips them. The `secret` output is only usable within the same job.

## Examples

### Post secret link as PR comment

```yaml
- uses: vaulted-fyi/share-secret@v1
  id: share
  with:
    secret: ${{ secrets.REVIEW_CREDENTIALS }}
    views: 1
    expires: 1h

- uses: actions/github-script@v7
  with:
    script: |
      github.rest.issues.createComment({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: context.issue.number,
        body: `Review credentials (1 view, expires in 1h): ${{ steps.share.outputs.url }}`
      })
```

### Send to Slack

```yaml
- uses: vaulted-fyi/share-secret@v1
  id: share
  with:
    secret: ${{ secrets.DEPLOY_KEY }}

- uses: slackapi/slack-github-action@v2
  with:
    webhook: ${{ secrets.SLACK_WEBHOOK }}
    payload: |
      {"text": "Deploy key: ${{ steps.share.outputs.url }}"}
```

### Passphrase-protected

```yaml
- uses: vaulted-fyi/share-secret@v1
  with:
    secret: ${{ secrets.DATABASE_URL }}
    passphrase: ${{ secrets.SHARE_PASSPHRASE }}
    views: 1
    expires: 1h
```

## How it works

1. **Create**: Generates an AES-256 key, encrypts your secret client-side, sends only the ciphertext to vaulted.fyi, and returns a link with the key in the URL fragment
2. **Get**: Fetches the ciphertext from vaulted.fyi, decrypts it client-side using the key from the URL fragment, and masks the result in GitHub logs

The server never sees your plaintext. [Learn more](https://vaulted.fyi/security).

## Also available as

- **Web app**: [vaulted.fyi](https://vaulted.fyi)
- **CLI**: `npx vaulted-cli "my-secret"` — [npm package](https://www.npmjs.com/package/vaulted-cli)

## License

MIT
