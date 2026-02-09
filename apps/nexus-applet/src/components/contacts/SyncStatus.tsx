interface SyncStatusProps {
  created: number;
  updated: number;
}

export function SyncStatus({ created, updated }: SyncStatusProps) {
  const total = created + updated;

  return (
    <div className="bg-green-50 border border-green-200 rounded-xl p-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
          <svg
            className="w-6 h-6 text-green-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <div>
          <p className="font-medium text-green-800">
            {total} contact{total === 1 ? "" : "s"} synced successfully
          </p>
          <p className="text-sm text-green-600">
            {created > 0 && `${created} new`}
            {created > 0 && updated > 0 && " • "}
            {updated > 0 && `${updated} updated`}
          </p>
        </div>
      </div>
    </div>
  );
}
