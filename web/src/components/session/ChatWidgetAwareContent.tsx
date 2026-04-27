import { ChatMarkdown } from "./ChatMarkdown";
import { ChatWidgetRenderer } from "./ChatWidgetRenderer";
import { parseAllShowWidgets } from "./chat-widget-parser";

interface ChatWidgetAwareContentProps {
  content: string;
}

export function ChatWidgetAwareContent({
  content,
}: ChatWidgetAwareContentProps) {
  const segments = parseAllShowWidgets(content);

  if (!segments) {
    return <ChatMarkdown content={content} />;
  }

  return (
    <>
      {segments.map((seg, i) =>
        seg.type === "text" ? (
          <ChatMarkdown key={`t-${i}`} content={seg.content} />
        ) : (
          <ChatWidgetRenderer
            key={`w-${i}`}
            code={seg.content}
            title={seg.title}
          />
        ),
      )}
    </>
  );
}
