import React from 'react';

// Lightweight markdown-to-JSX renderer for message content
// Supports: code blocks, inline code, bold, italic, links, line breaks

interface CodeBlockProps {
  language?: string;
  code: string;
}

function CodeBlock({ language, code }: CodeBlockProps) {
  return (
    <div className="my-3 rounded-xl overflow-hidden border border-[#1e1e3a]">
      {language && (
        <div className="px-4 py-1.5 bg-[#0a0a0f] text-[#4a4a5e] text-xs font-medium border-b border-[#1e1e3a]">
          {language}
        </div>
      )}
      <pre className="p-4 bg-[#0f0f18] overflow-x-auto text-sm leading-relaxed">
        <code className="text-[#e0e0e8]">{code}</code>
      </pre>
    </div>
  );
}

// Split text into segments: code blocks, then inline formatting
function parseMarkdown(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Split by fenced code blocks
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    // Text before code block
    if (match.index > lastIndex) {
      nodes.push(...parseInline(text.slice(lastIndex, match.index), nodes.length));
    }
    // Code block
    nodes.push(
      <CodeBlock
        key={`cb-${nodes.length}`}
        language={match[1] || undefined}
        code={match[2].replace(/\n$/, '')}
      />
    );
    lastIndex = match.index + match[0].length;
  }

  // Remaining text after last code block
  if (lastIndex < text.length) {
    nodes.push(...parseInline(text.slice(lastIndex), nodes.length));
  }

  return nodes;
}

function parseInline(text: string, baseKey: number): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Split by inline code first
  const parts = text.split(/(`[^`]+`)/g);

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.startsWith('`') && part.endsWith('`')) {
      nodes.push(
        <code
          key={`ic-${baseKey}-${i}`}
          className="px-1.5 py-0.5 bg-[#1a1a2e] text-[#818cf8] rounded-md text-[0.85em] font-mono"
        >
          {part.slice(1, -1)}
        </code>
      );
    } else {
      // Process bold/italic/links in the remaining text
      nodes.push(...parseFormattedText(part, baseKey * 1000 + i));
    }
  }

  return nodes;
}

function parseFormattedText(text: string, baseKey: number): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Bold: **text**
  // Italic: *text* (but not **)
  // Links: [text](url)
  const regex = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(\[([^\]]+)\]\(([^)]+)\))/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(
        <span key={`t-${baseKey}-${lastIndex}`}>{text.slice(lastIndex, match.index)}</span>
      );
    }

    if (match[1]) {
      // Bold
      nodes.push(
        <strong key={`b-${baseKey}-${match.index}`} className="font-semibold text-white">
          {match[2]}
        </strong>
      );
    } else if (match[3]) {
      // Italic
      nodes.push(
        <em key={`i-${baseKey}-${match.index}`} className="italic">
          {match[4]}
        </em>
      );
    } else if (match[5]) {
      // Link
      nodes.push(
        <a
          key={`a-${baseKey}-${match.index}`}
          href={match[7]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#06b6d4] hover:underline"
        >
          {match[6]}
        </a>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(<span key={`t-${baseKey}-${lastIndex}`}>{text.slice(lastIndex)}</span>);
  }

  if (nodes.length === 0 && text) {
    nodes.push(<span key={`t-${baseKey}-only`}>{text}</span>);
  }

  return nodes;
}

export function MarkdownContent({ text }: { text: string }) {
  const nodes = parseMarkdown(text);
  return <div className="whitespace-pre-wrap break-words leading-relaxed">{nodes}</div>;
}
