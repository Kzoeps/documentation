# Runtime remote Markdown

Use the `{% remote-doc %}` Markdoc tag when a page should render canonical Markdown from a Hypercerts service repository without copying that Markdown into this documentation repo.

Register the source once in `docs-sources.yml`:

```yaml
sources:
  - id: epds
    title: ePDS
    rawUrl: https://raw.githubusercontent.com/hypercerts-org/ePDS/main/docs/tutorial.md
    sourceUrl: https://github.com/hypercerts-org/ePDS/blob/main/docs/tutorial.md
    routeBase: /architecture/epds
```

Then reference that registry id from the page:

```md
---
title: ePDS (extended PDS)
externalDoc: epds
---

{% remote-doc source="epds" %}

A short unavailable-state fallback goes here. Keep it brief so the documentation repo does not become a second source of truth.

{% /remote-doc %}
```

## How it works

- The site remains a static Next.js export.
- `npm run generate:external-docs` reads `docs-sources.yml`, fetches registered raw Markdown, writes `/external-docs.json`, and writes build-time content to `lib/external-docs-content.json`.
- `{% remote-doc source="epds" %}` resolves against that generated build-time content during `next build`.
- The exported page contains the rendered remote Markdown HTML; the browser does not fetch GitHub to display the docs.
- Build-time search and raw-page generation use `externalDoc` frontmatter, so search and `/raw` use the canonical Markdown instead of the local fallback.
- The generated Markdown is parsed with the same Markdoc tags and nodes used by local pages.
- Fenced `mermaid` diagrams render as SVGs in the browser through the Mermaid npm package.
- Relative links in the remote Markdown point back to the source GitHub repository.
- `Copy raw` and `View raw` use the page's registered `externalDoc` source when it is set.
- The wrapped local Markdown is the last-resort fallback content. Keep it to a short unavailable-state message, not a copy of the canonical docs.

## Scheduled refresh and deploys

`npm run docs:fingerprint` reads `docs-sources.yml`, fetches each registered `rawUrl`, hashes the content, and writes `public/docs-fingerprint.json` during the static build. Directory-style sources without `rawUrl` can still use `repo`, `branch`, and `docsPath` to fingerprint GitHub tree metadata. The generated file includes a stable `combinedFingerprint`; timestamps are ignored by the comparison script.

`.github/workflows/docs-refresh.yml` runs hourly and through `workflow_dispatch`:

1. Generate the current external-docs fingerprint.
2. Download the deployed fingerprint from `DOCS_FINGERPRINT_URL`, defaulting to `https://documentation-zeta-weld.vercel.app/docs-fingerprint.json`.
3. Compare only `combinedFingerprint`.
4. If it changed, `POST` to the configured Vercel Deploy Hook.

Manual `workflow_dispatch` runs default to `dry_run: true`, which compares fingerprints without calling the Vercel hook. Set `dry_run: false` when you want the manual run to deploy. GitHub only accepts `workflow_dispatch` and scheduled runs once the workflow file exists on the default branch. The workflow only treats a deployed-fingerprint `404` as missing first-run state; transient download failures fail the workflow instead of deploying on an unknown diff.

`.github/workflows/docs-refresh-pr-dry-run.yml` is a temporary PR-only check for this rollout. It runs the same manifest and fingerprint comparison on pull requests, writes a summary, and never calls the Vercel deploy hook.

Required GitHub Actions secret:

- `VERCEL_DEPLOY_HOOK_URL` — the Vercel Deploy Hook URL for the production docs branch.

Optional GitHub Actions variable:

- `DOCS_FINGERPRINT_URL` — the deployed site fingerprint URL. Forks and staging deployments should set this to their own Vercel URL, for example `https://your-test-docs.vercel.app/docs-fingerprint.json`.

Optional GitHub Actions secret:

- `DOCS_SOURCE_TOKEN` — a GitHub token with read access to source repos. Public repos can use the workflow `GITHUB_TOKEN`, but this avoids API rate limits and is required if a source repo becomes private.

## Constraints

- Sources must be in approved GitHub owners: `hypercerts-org` or `gainforest`.
- Registry ids must be lowercase, for example `epds` or `certified-group-service`.
- Prefer explicit `rawUrl` and `sourceUrl` values for page-level remote docs. A source only needs `entrypoint` when `docsPath` points at a directory and a page renders it through `{% remote-doc %}`.
- Registry-backed remote docs render during the static build. If generated build-time content is missing, the page shows the wrapped local fallback.
