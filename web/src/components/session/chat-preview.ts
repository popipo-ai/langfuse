export function openChatPreview({
  sessionId,
  projectId,
}: {
  sessionId: string;
  projectId: string;
}) {
  window.open(
    `/project/${projectId}/sessions/${encodeURIComponent(sessionId)}/chat-preview`,
    "_blank",
  );
}
