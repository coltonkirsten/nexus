import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

const components: Components = {
  h1: ({ children }) => (
    <h1 className="text-xl font-bold text-[#e0e0e8] mt-6 mb-3">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-lg font-semibold text-[#e0e0e8] mt-5 mb-2">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-base font-semibold text-[#e0e0e8] mt-4 mb-2">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-sm font-semibold text-[#e0e0e8] mt-3 mb-1">{children}</h4>
  ),
  p: ({ children }) => (
    <p className="text-[#c0c0d0] leading-relaxed mb-3">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="list-disc list-inside text-[#c0c0d0] mb-3 space-y-1 pl-2">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal list-inside text-[#c0c0d0] mb-3 space-y-1 pl-2">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="text-[#c0c0d0]">{children}</li>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-indigo-500 pl-4 my-3 text-[#7a7a8e] italic">
      {children}
    </blockquote>
  ),
  code: ({ className, children }) => {
    const isBlock = className?.startsWith('language-');
    if (isBlock) {
      const lang = className?.replace('language-', '') || '';
      return (
        <div className="my-3 rounded-xl overflow-hidden border border-[#1e1e3a]">
          {lang && (
            <div className="px-4 py-1.5 bg-[#0a0a0f] text-[#4a4a5e] text-xs font-medium border-b border-[#1e1e3a]">
              {lang}
            </div>
          )}
          <pre className="p-4 bg-[#0f0f18] overflow-x-auto text-sm leading-relaxed">
            <code className="text-[#e0e0e8]">{children}</code>
          </pre>
        </div>
      );
    }
    return (
      <code className="px-1.5 py-0.5 bg-[#1a1a2e] text-[#818cf8] rounded-md text-[0.85em] font-mono">
        {children}
      </code>
    );
  },
  pre: ({ children }) => <>{children}</>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-indigo-400 hover:text-indigo-300 hover:underline"
    >
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto my-3">
      <table className="w-full border-collapse border border-[#1e1e3a] text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-[#12121a]">{children}</thead>
  ),
  th: ({ children }) => (
    <th className="px-3 py-2 text-left text-[#7a7a8e] font-medium border border-[#1e1e3a]">{children}</th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-2 text-[#c0c0d0] border border-[#1e1e3a]">{children}</td>
  ),
  hr: () => <hr className="border-[#1e1e3a] my-4" />,
  strong: ({ children }) => (
    <strong className="font-semibold text-white">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="italic">{children}</em>
  ),
};

export function MarkdownContent({ text }: { text: string }) {
  return (
    <div className="break-words leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
