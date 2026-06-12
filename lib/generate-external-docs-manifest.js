const crypto = require('crypto');
const {
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} = require('fs');
const { dirname, join, relative } = require('path');
const {
  loadExternalDocSources,
  parseMarkdownFrontmatter,
  parseRawGitHubMarkdownUrl,
  sourceToPublicManifestEntry,
} = require('./external-docs');

const MANIFEST_OUTPUT = join(__dirname, '..', 'public', 'external-docs.json');
const CONTENT_OUTPUT = join(__dirname, 'external-docs-content.json');
const PAGES_DIR = join(__dirname, '..', 'pages');

/**
 * Compute a short stable identifier for raw URL sources that are declared directly in page frontmatter.
 */
function hashId(value) {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 12);
}

function walkDir(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...walkDir(full));
    } else if (full.endsWith('.md')) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Fetch one Markdown source during the static build so pages can render without browser fetches.
 */
async function fetchMarkdown(rawUrl) {
  const headers = {
    'User-Agent': 'hypercerts-docs-build',
  };
  const token = process.env.DOCS_SOURCE_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(rawUrl, { headers, cache: 'no-store' });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`${rawUrl} returned ${response.status} ${response.statusText || ''}. Check docs-sources.yml, page rawUrl frontmatter, and DOCS_SOURCE_TOKEN. ${body}`.trim());
  }

  return response.text();
}

function entryFromRegistrySource(source) {
  return {
    id: source.id,
    registryId: source.id,
    title: source.title,
    repo: source.repo,
    owner: source.owner,
    repoName: source.repoName,
    branch: source.branch,
    docsPath: source.docsPath,
    entrypoint: source.entrypoint || undefined,
    routeBase: source.routeBase || undefined,
    sourceUrl: source.sourceUrl,
    rawUrl: source.rawUrl,
    filePath: source.entrypointPath || source.docsPath,
  };
}

function entryFromRawFrontmatter(file, frontmatter) {
  if (!frontmatter.rawUrl) return null;

  const rawInfo = parseRawGitHubMarkdownUrl(frontmatter.rawUrl, `${relative(PAGES_DIR, file)} rawUrl`);
  return {
    id: `raw:${hashId(rawInfo.rawUrl)}`,
    title: frontmatter.title ? String(frontmatter.title) : rawInfo.filePath,
    repo: rawInfo.repo,
    owner: rawInfo.owner,
    repoName: rawInfo.repoName,
    branch: rawInfo.branch,
    docsPath: rawInfo.filePath,
    routeBase: undefined,
    sourceUrl: rawInfo.sourceUrl,
    rawUrl: rawInfo.rawUrl,
    filePath: rawInfo.filePath,
  };
}

function addContentEntry(content, entry, sourceKey) {
  if (!entry?.rawUrl) return;

  const existingId = content.byRawUrl[entry.rawUrl];
  const id = existingId || entry.id;

  if (!content.entries[id]) {
    content.entries[id] = { ...entry, id };
    content.byRawUrl[entry.rawUrl] = id;
    content.bySourceUrl[entry.sourceUrl] = id;
  }

  if (sourceKey) {
    content.sources[sourceKey] = id;
  }
}

async function hydrateContentEntries(content) {
  for (const entry of Object.values(content.entries)) {
    entry.markdown = await fetchMarkdown(entry.rawUrl);
  }
}

/**
 * Generate the browser-readable manifest and build-time Markdown content used by remote docs pages.
 */
async function generateExternalDocs() {
  const sources = loadExternalDocSources();
  const manifest = {
    schemaVersion: 1,
    sources: Object.fromEntries(
      sources.map((source) => [source.id, sourceToPublicManifestEntry(source)])
    ),
  };

  const content = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    entries: {},
    sources: {},
    byRawUrl: {},
    bySourceUrl: {},
  };

  for (const source of sources) {
    addContentEntry(content, entryFromRegistrySource(source), source.id);
  }

  for (const file of walkDir(PAGES_DIR)) {
    const markdown = readFileSync(file, 'utf8');
    const frontmatter = parseMarkdownFrontmatter(markdown, relative(PAGES_DIR, file));
    addContentEntry(content, entryFromRawFrontmatter(file, frontmatter));
  }

  await hydrateContentEntries(content);

  mkdirSync(dirname(MANIFEST_OUTPUT), { recursive: true });
  writeFileSync(MANIFEST_OUTPUT, `${JSON.stringify(manifest, null, 2)}\n`);

  mkdirSync(dirname(CONTENT_OUTPUT), { recursive: true });
  writeFileSync(CONTENT_OUTPUT, `${JSON.stringify(content, null, 2)}\n`);

  console.log(`Generated external docs manifest for ${sources.length} source${sources.length === 1 ? '' : 's'}`);
  console.log(`Generated build-time external docs content for ${Object.keys(content.entries).length} Markdown source${Object.keys(content.entries).length === 1 ? '' : 's'}`);
}

generateExternalDocs().catch((error) => {
  console.error(error);
  process.exit(1);
});
