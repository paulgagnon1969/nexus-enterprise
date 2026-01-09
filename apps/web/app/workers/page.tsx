export const dynamic = "force-dynamic";

// NOTE: This page previously queried the database directly via Prisma from the web
// bundle, which breaks Vercel builds (Prisma client is not available in the web
// workspace). For now we stub this page out in prod to unblock deployments.
// When we need this view again, we should reimplement it by calling the Nest API
// instead of importing `@repo/database` or `@prisma/client` from the web app.

export default function WorkersPage() {
  return (
    <main className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Workers admin</h1>
      <p className="text-sm text-gray-600">
        The Workers admin dashboard is temporarily disabled in this
        environment. Worker data is still available through the API and the
        Weekly Time Accounting view.
      </p>
    </main>
  );
}
