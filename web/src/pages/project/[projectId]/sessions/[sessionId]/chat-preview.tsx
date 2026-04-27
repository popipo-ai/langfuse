import dynamic from "next/dynamic";
import { useRouter } from "next/router";

const ChatPreviewPage = dynamic(
  () =>
    import("@/src/components/session/ChatPreviewPage").then(
      (mod) => mod.ChatPreviewPage,
    ),
  { ssr: false },
);

export default function ChatPreview() {
  const router = useRouter();
  const sessionId = router.query.sessionId as string;
  const projectId = router.query.projectId as string;

  if (!sessionId || !projectId) return null;

  return <ChatPreviewPage sessionId={sessionId} projectId={projectId} />;
}
