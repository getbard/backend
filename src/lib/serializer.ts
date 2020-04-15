import escapeHtml from 'escape-html';
import { Node, Text } from 'slate';

export const serializeHtml = (node: Node): string => {
  if (Text.isText(node)) {
    if (node.bold) {
      return `<strong>${escapeHtml(node.text)}</strong>`;
    }
  
    if (node.italic) {
      return `<em>${escapeHtml(node.text)}</em>`;
    }
  
    if (node.underline) {
      return `<u>${escapeHtml(node.text)}</u>`;
    }
  
    if (node.code) {
      return `<code>${escapeHtml(node.text)}</code>`;
    }
  
    if (node.strikethrough) {
      return `<del>${escapeHtml(node.text)}</del>`;
    }

    return escapeHtml(node.text);
  }

  const children = node.children
    .map((n: Node) => serializeHtml(n))
    .join('');

  switch (node.type) {
    case 'quote':
      return `<blockquote><p>${children}</p></blockquote>`;
    case 'paragraph':
      return `<p>${children}</p>`;
    case 'link':
      return `<a href="${escapeHtml(node.url)}">${children}</a>`;
    case 'image':
      return `<img style="width:100%;" src="${escapeHtml(node.url)}" />`
    default:
      return children;
  }
}