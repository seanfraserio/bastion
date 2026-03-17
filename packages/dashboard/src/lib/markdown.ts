/**
 * Minimal markdown-to-HTML converter.
 * Handles: h1-h6, paragraphs, code blocks, inline code, bold, italic,
 * links, unordered/ordered lists, blockquotes, tables, horizontal rules.
 */
export function renderMarkdown(md: string): string {
  let html = md;

  // Horizontal rules (must come before list processing)
  html = html.replace(/^---+$/gm, "<hr />");

  // Code blocks (```lang\n...\n```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre class="md-code-block"><code class="lang-${lang}">${escapeHtml(code.trimEnd())}</code></pre>`;
  });

  // Inline code (must come after code blocks)
  html = html.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');

  // Headers (h6 down to h1 so ## doesn't match before ######)
  html = html.replace(/^###### (.+)$/gm, "<h6>$1</h6>");
  html = html.replace(/^##### (.+)$/gm, "<h5>$1</h5>");
  html = html.replace(/^#### (.+)$/gm, "<h4>$1</h4>");
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");

  // Bold and italic
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => {
    const safeUrl = /^(https?:\/\/|\/|#)/.test(url.trim()) ? url : "#";
    return `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(text)}</a>`;
  });

  // Blockquotes
  html = html.replace(/^> (.+)$/gm, (_, content) => `<blockquote>${content}</blockquote>`);

  // Ordered lists (lines starting with number.)
  html = html.replace(/^(\d+)\. (.+)$/gm, '<li class="md-ol-item">$2</li>');
  html = html.replace(
    /(<li class="md-ol-item">.*<\/li>\n?)+/g,
    "<ol>$&</ol>"
  );

  // Unordered lists (lines starting with -)
  html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>(?:(?!class="md-ol-item").).*<\/li>\n?)+/g, "<ul>$&</ul>");

  // Tables (basic: | col | col |)
  html = html.replace(/^\|(.+)\|$/gm, (match) => {
    const cells = match
      .split("|")
      .filter((c) => c.trim())
      .map((c) => c.trim());
    // Skip separator rows (|---|---|)
    if (cells.every((c) => /^[-:]+$/.test(c))) return "";
    return (
      "<tr>" + cells.map((c) => `<td>${escapeHtml(c)}</td>`).join("") + "</tr>"
    );
  });
  html = html.replace(/(<tr>.*<\/tr>\n?)+/g, "<table>$&</table>");

  // Paragraphs: wrap remaining non-empty, non-tag lines
  html = html.replace(/^(?!<[a-z/]|$)(.+)$/gm, "<p>$1</p>");

  // Clean up empty paragraphs and stray whitespace tags
  html = html.replace(/<p>\s*<\/p>/g, "");

  return html;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
