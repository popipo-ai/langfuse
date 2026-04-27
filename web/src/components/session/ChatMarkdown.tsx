import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

const mdComponents: Components = {
  code: ({ className, children, ...props }) => {
    const isInline = !className;
    if (isInline) {
      return (
        <code
          className="rounded bg-zinc-800 px-1 py-0.5 text-[12px] font-mono text-pink-400"
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <code
        className={`${className ?? ""} block bg-zinc-800 text-[12px] font-mono text-zinc-300 p-3 rounded-lg overflow-x-auto`}
        {...props}
      >
        {children}
      </code>
    );
  },
  pre: ({ children, ...props }) => (
    <pre className="my-2 p-0 bg-transparent overflow-x-auto" {...props}>
      {children}
    </pre>
  ),
  table: ({ children, ...props }) => (
    <table
      className="my-2 w-full border-collapse text-xs text-zinc-300"
      {...props}
    >
      {children}
    </table>
  ),
  th: ({ children, ...props }) => (
    <th
      className="border border-zinc-700 bg-zinc-800 px-2 py-1 text-left font-medium text-zinc-200"
      {...props}
    >
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td className="border border-zinc-700 px-2 py-1 text-zinc-400" {...props}>
      {children}
    </td>
  ),
  a: ({ children, href, ...props }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-400 hover:underline"
      {...props}
    >
      {children}
    </a>
  ),
  p: ({ children, ...props }) => (
    <p className="mb-2 last:mb-0" {...props}>
      {children}
    </p>
  ),
  ul: ({ children, ...props }) => (
    <ul className="pl-5 my-1 list-disc" {...props}>
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol className="pl-5 my-1 list-decimal" {...props}>
      {children}
    </ol>
  ),
  blockquote: ({ children, ...props }) => (
    <blockquote
      className="border-l-3 border-blue-500 pl-3 my-2 text-zinc-400"
      {...props}
    >
      {children}
    </blockquote>
  ),
  h1: ({ children, ...props }) => (
    <h1 className="text-lg font-semibold my-2" {...props}>
      {children}
    </h1>
  ),
  h2: ({ children, ...props }) => (
    <h2 className="text-base font-semibold my-2" {...props}>
      {children}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3 className="text-sm font-semibold my-2" {...props}>
      {children}
    </h3>
  ),
  strong: ({ children, ...props }) => (
    <strong className="font-semibold" {...props}>
      {children}
    </strong>
  ),
};

export function ChatMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
      {content}
    </ReactMarkdown>
  );
}
