/**
 * Markdoc tag for rendering canonical Markdown from a registered GitHub repo at browser runtime.
 * The source can be a docs-sources.yml id such as "epds" or a direct approved GitHub Markdown URL.
 */
module.exports = {
  render: 'RemoteMarkdown',
  attributes: {
    source: {
      type: String,
      required: true,
    },
  },
};
