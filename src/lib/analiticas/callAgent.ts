export function resolveCallAgentFromFile(f: { file_name: string; metadata?: unknown }) {
  const meta = f.metadata as Record<string, unknown> | null | undefined;
  return (
    (typeof meta?.agent === "string" && meta.agent ? String(meta.agent).replace(/@.*$/, "").trim() : undefined) ||
    (typeof meta?.agent_name === "string" ? meta.agent_name : undefined) ||
    (typeof meta?.user_name === "string" ? meta.user_name : undefined) ||
    (f.file_name?.includes("-") ? f.file_name.split("-")[0].trim() : "") ||
    "—"
  );
}
