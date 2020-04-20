import escapeHtml from 'escape-html';
import { Node, Text } from 'slate';

export const serializeText = (nodes: Node[]): string => {
  return nodes.map(n => Node.string(n)).join('\n');
}

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

const nodeIsEmpty = (node: Node): boolean => {
  return !node?.children?.length || (node?.children?.length === 1 && Text.isText(node.children[0]) && node.children[0].text === '');
}

// We want to eliminate consecutive line breaks from our contet
export const lineBreakEliminator = (nodes: Node[]): Node[] => {
  if (!nodes) {
    return [];
  }

  const nodesToRemove: number[] = [];

  for (let i = 0; i < nodes.length; i++) {
    const currNode = nodes[i];
    const prevNode = nodes[i - 1];

    if (!prevNode) {
      continue;
    }

    currNode.children = lineBreakEliminator(currNode.children);

    if (nodeIsEmpty(prevNode) && nodeIsEmpty(currNode)) {
      nodesToRemove.push(i);
    }
  }

  return nodes.filter((node: Node, index: number) => !nodesToRemove.includes(index));
}