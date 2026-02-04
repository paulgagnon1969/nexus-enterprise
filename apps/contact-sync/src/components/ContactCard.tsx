interface ContactCardProps {
  contact: {
    id: string;
    displayName: string | null;
    email: string | null;
    phone: string | null;
  };
  isSelected: boolean;
  isSynced: boolean;
  onToggle: () => void;
}

export function ContactCard({
  contact,
  isSelected,
  isSynced,
  onToggle,
}: ContactCardProps) {
  const initials = (contact.displayName || contact.email || "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      onClick={isSynced ? undefined : onToggle}
      className={`flex items-center gap-3 px-4 py-3 border-b border-slate-100 last:border-b-0 transition-colors ${
        isSynced
          ? "bg-slate-50 cursor-default"
          : isSelected
            ? "bg-nexus-50 cursor-pointer"
            : "hover:bg-slate-50 cursor-pointer"
      }`}
    >
      {/* Checkbox or synced indicator */}
      <div className="flex-shrink-0">
        {isSynced ? (
          <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center">
            <svg
              className="w-3 h-3 text-green-600"
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
        ) : (
          <div
            className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
              isSelected
                ? "bg-nexus-600 border-nexus-600"
                : "border-slate-300"
            }`}
          >
            {isSelected && (
              <svg
                className="w-3 h-3 text-white"
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
            )}
          </div>
        )}
      </div>

      {/* Avatar */}
      <div
        className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium ${
          isSynced
            ? "bg-slate-200 text-slate-500"
            : "bg-nexus-100 text-nexus-700"
        }`}
      >
        {initials}
      </div>

      {/* Contact info */}
      <div className="flex-1 min-w-0">
        <p
          className={`font-medium truncate ${
            isSynced ? "text-slate-500" : "text-slate-900"
          }`}
        >
          {contact.displayName || contact.email || contact.phone || "Unknown"}
        </p>
        <p className="text-sm text-slate-500 truncate">
          {contact.email && contact.phone
            ? `${contact.email} • ${contact.phone}`
            : contact.email || contact.phone || "No contact info"}
        </p>
      </div>

      {/* Synced badge */}
      {isSynced && (
        <span className="flex-shrink-0 text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">
          Synced
        </span>
      )}
    </div>
  );
}
