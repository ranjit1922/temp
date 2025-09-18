// markdown.js

/**
 * Parse limited markdown syntax into safe HTML.
 * Supported:
 * - **bold**
 * - *italic*
 * - ==highlight==
 * - [text](url)
 * - simple tables
 */
export function parseMarkdown(md = "") {
  if (!md || typeof md !== "string") return "";

  // Escape < and > to prevent HTML injection
  let html = md.replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Bold: **text**
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Italic: *text* (but not bold)
  html = html.replace(/(^|[^*])\*(?!\*)(.+?)\*(?!\*)/g, "$1<em>$2</em>");

  // Highlight: ==text==
  html = html.replace(/==(.*?)==/g, "<mark>$1</mark>");

  // Links: [text](http://...)
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)"]+)\)/g,
    (match, text, url) => {
      const safeText = text.replace(/"/g, "&quot;");
      const safeUrl = url.replace(/"/g, "%22");
      return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeText}</a>`;
    }
  );

  // Handle tables
  html = convertTables(html);

  return html;
}

/**
 * Detect simple markdown tables and convert to <table>.
 * Example:
 * | Col1 | Col2 |
 * | ---- | ---- |
 * | A    | B    |
 */
function convertTables(text) {
  const lines = text.split(/\r?\n/);
  const output = [];
  let buffer = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/^\s*\|.*\|\s*$/.test(line) && buffer.length === 0) {
      buffer.push(line);
    } else if (buffer.length > 0) {
      if (/^\s*\|.*\|\s*$/.test(line)) {
        buffer.push(line);
      } else {
        output.push(processTable(buffer));
        buffer = [];
        output.push(line);
      }
    } else {
      output.push(line);
    }
  }

  if (buffer.length > 0) {
    output.push(processTable(buffer));
  }

  return output.join("\n");
}

function processTable(buffer) {
  if (buffer.length < 2) return buffer.join("\n");

  const separatorLine = buffer[1];
  if (!/^\s*\|(\s*[-:]{3,}\s*\|)+\s*$/.test(separatorLine)) {
    return buffer.join("\n");
  }

  const headerCells = buffer[0]
    .split("|")
    .slice(1, -1)
    .map((c) => `<th>${c.trim()}</th>`)
    .join("");
  const header = `<thead><tr>${headerCells}</tr></thead>`;

  const dataRows = buffer
    .slice(2)
    .map((line) => {
      const cells = line
        .split("|")
        .slice(1, -1)
        .map((c) => `<td>${c.trim()}</td>`)
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
  const body = `<tbody>${dataRows}</tbody>`;

  return `<table>${header}${body}</table>`;
}