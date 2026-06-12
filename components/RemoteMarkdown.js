import React, { useContext, useMemo } from 'react';
import Markdoc from '@markdoc/markdoc';
import externalDocsContent from '../lib/external-docs-content.json';
import tags from '../markdoc/tags';
import { fence, heading, link } from '../markdoc/nodes';
import { Callout } from './Callout';
import { Columns } from './Columns';
import { Column } from './Column';
import { Figure } from './Figure';
import { Heading } from './Heading';
import { CardLink } from './CardLink';
import { CodeBlock } from './CodeBlock';
import { Link } from './Link';
import { DotPattern } from './DotPattern';
import { HeroBanner } from './HeroBanner';
import { CardGrid } from './CardGrid';
import { MermaidDiagram } from './MermaidDiagram';

const RemoteMarkdownContext = React.createContext(null);

const markdocConfig = {
  tags,
  nodes: { fence, heading, link },
};

/**
 * Remove optional YAML frontmatter before parsing remote Markdown with Markdoc.
 */
function stripFrontmatter(markdown) {
  if (!markdown.startsWith('---\n')) return markdown;

  const end = markdown.indexOf('\n---\n', 4);
  if (end === -1) return markdown;

  return markdown.slice(end + 5).trimStart();
}

/**
 * Resolve relative links in remotely-rendered docs back to the source GitHub repo.
 */
function resolveRemoteHref(href, source) {
  if (!href || href.startsWith('#') || href.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(href)) {
    return href;
  }

  const sourceDir = source.filePath.split('/').slice(0, -1).join('/');
  const basePath = `/${source.owner}/${source.repoName}/blob/${source.branch}/${sourceDir ? `${sourceDir}/` : ''}`;
  const resolved = new URL(href, `https://github.com${basePath}`);
  const [, owner, repo, , ref, ...repoPathParts] = resolved.pathname.split('/');
  const repoPath = repoPathParts.join('/');
  const lastSegment = repoPathParts[repoPathParts.length - 1] || '';
  const mode = /\.[a-z0-9]+$/i.test(lastSegment) ? 'blob' : 'tree';

  return `https://github.com/${owner}/${repo}/${mode}/${ref}/${repoPath}${resolved.hash}`;
}

function RemoteLink({ href, children, ...props }) {
  const source = useContext(RemoteMarkdownContext);
  const resolvedHref = source ? resolveRemoteHref(href, source) : href;

  return (
    <Link href={resolvedHref} {...props}>
      {children}
    </Link>
  );
}

const remoteMarkdocComponents = {
  Callout,
  Columns,
  Column,
  Figure,
  Heading,
  CardLink,
  CodeBlock,
  Fence: CodeBlock,
  Link: RemoteLink,
  DotPattern,
  HeroBanner,
  CardGrid,
  MermaidDiagram,
};

function transformMarkdown(markdown) {
  const ast = Markdoc.parse(stripFrontmatter(markdown));
  return Markdoc.transform(ast, markdocConfig);
}

function getBuildTimeEntry(source) {
  const id = externalDocsContent.sources?.[source] || source;
  const mappedId = externalDocsContent.bySourceUrl?.[source] || externalDocsContent.byRawUrl?.[source] || id;
  return externalDocsContent.entries?.[mappedId] || null;
}

/**
 * Build-time Markdoc renderer for Markdown files that live in registered source repos.
 * `npm run generate:external-docs` fetches the raw Markdown before `next build`, so static exports contain the rendered HTML and do not fetch GitHub in the browser.
 */
export function RemoteMarkdown({ source, children }) {
  const entry = getBuildTimeEntry(source);

  const renderedState = useMemo(() => {
    if (!entry?.markdown) {
      return {
        renderedContent: null,
        renderError: new Error(`No build-time Markdown was generated for remote docs source "${source}". Add it to docs-sources.yml or set rawUrl frontmatter, then run npm run generate:external-docs.`),
      };
    }

    try {
      const content = transformMarkdown(entry.markdown);
      return {
        renderedContent: Markdoc.renderers.react(content, React, {
          components: remoteMarkdocComponents,
        }),
        renderError: null,
      };
    } catch (err) {
      return { renderedContent: null, renderError: err };
    }
  }, [entry, source]);

  const { renderedContent, renderError } = renderedState;

  if (renderedContent) {
    return (
      <RemoteMarkdownContext.Provider value={entry}>
        {renderedContent}
      </RemoteMarkdownContext.Provider>
    );
  }

  return (
    <>
      <div className="remote-doc-status remote-doc-status--error" role="alert">
        <strong>Could not render the canonical docs.</strong>{' '}
        The static build did not include renderable Markdown for this source. Showing the local fallback below. Try rebuilding the site, or edit{' '}
        {entry?.sourceUrl ? (
          <a href={entry.sourceUrl} target="_blank" rel="noopener noreferrer">the source file</a>
        ) : (
          'the configured source URL'
        )}{' '}
        if the URL is wrong. Details: {renderError?.message || 'No renderable Markdown source was available.'}
      </div>
      {children}
    </>
  );
}
