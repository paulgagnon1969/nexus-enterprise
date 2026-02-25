/**
 * Minimal layout for the /call/* route group.
 * Guests joining via a shared link are NOT authenticated,
 * so this layout renders children without the AppShell sidebar/header.
 */
export default function CallLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100dvh", backgroundColor: "#111827" }}>
      {children}
    </div>
  );
}
