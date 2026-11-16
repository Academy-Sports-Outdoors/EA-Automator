# Expert Advice article importer

This repository builds an Academy Expert Advice article from one Google Doc and writes it to Contentstack. The Doc supplies the article URL, asset folder, article type, category, SEO fields, related articles, and body. The Action asks only for the Google Doc ID and what to do with the build.

The article is saved as an `expertAdvicePage` whose body is one `richText` entry. Shared Expert Advice styles and scripts stay attached and are not edited. Images, GIFs, and videos must already be in the Contentstack folder named in the Doc.

Preview Only is the default. It writes `out/preview.html`, `out/payload.json`, and `out/report.json` and does not create or publish entries. Save Draft writes Contentstack drafts. Publish writes those drafts and then publishes them.

## Prepare the Doc

Follow [docs/AUTHORING.md](docs/AUTHORING.md). Share the Doc with the service account email in `GOOGLE_SERVICE_ACCOUNT_JSON`.

## Run it locally

Use Node.js 22 or newer. This package has no runtime dependencies.

```bash
npm ci
npm test
node scripts/import.js --doc 'GOOGLE_DOC_ID'
```

A Doc URL is accepted and reduced to its ID. Review the preview, then save a draft:

```bash
node scripts/import.js --doc 'GOOGLE_DOC_ID' --apply
```

Publish to one or more of `development`, `production`, `prod2`, and `uat5`:

```bash
node scripts/import.js --doc 'GOOGLE_DOC_ID' --apply --publish --environment development,production,prod2
```

Assets that are already published to the selected environments are left alone. The importer then publishes the article rich text and the page. `uat5` is not part of the default set.

For a preview from a saved Docs API response:

```bash
node scripts/import.js --doc-json test/fixtures/sample-doc.json --dry-run
```

| Variable | Purpose |
| --- | --- |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Service account JSON, or a path to that file. Required for `--doc`. |
| `CS_API_KEY` | Academy Contentstack stack API key. Required to resolve entries and to save. |
| `CS_AUTHTOKEN` | Contentstack session token, sent as a cookie. |
| `CS_STACK_UID` | Optional edit-link override. |
| `CS_CMA_BASE_URL` | Optional CMA base URL. Defaults to `https://app.contentstack.com/api/v3`. |

## GitHub Actions

Run **Import Expert Advice Article** from the Actions tab.

| Input | Purpose |
| --- | --- |
| Doc ID | The Google Doc ID. A full Doc URL is accepted. |
| Preference | Preview Only, Save Draft, or Publish. |
| Contentstack environments | Used only for Publish. Defaults to `development,production,prod2`. |

The workflow uses the same secret layout as `web-builder` and `aso-botpc-automation`. `CS_API_KEY` and `GOOGLE_SERVICE_ACCOUNT_JSON` are repository secrets. `CS_AUTHTOKEN` is a secret on the GitHub Environment named for the person running the workflow. The job runs the tests, writes the preview files, and adds Contentstack edit links to the job summary.

An existing page is matched by the Doc's expert-advice URL. The importer rewrites that page's article rich text and fills in the shared style entries used by the current Expert Advice layout. Header, footer, author, and flags that the Doc does not mention stay as they are. A missing required label stops the run before any Contentstack write.
