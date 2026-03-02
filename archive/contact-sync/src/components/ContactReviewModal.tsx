import { useState } from "react";

interface DeviceContact {
  id: string;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  allEmails: string[];
  allPhones: string[];
}

interface ContactReviewModalProps {
  contacts: DeviceContact[];
  onClose: () => void;
  onConfirm: (updates: Map<string, { email: string | null; phone: string | null }>) => void;
}

export function ContactReviewModal({
  contacts,
  onClose,
  onConfirm,
}: ContactReviewModalProps) {
  // Track selected primary email/phone for each contact
  const [selections, setSelections] = useState<
    Map<string, { email: string | null; phone: string | null }>
  >(() => {
    const initial = new Map();
    contacts.forEach((c) => {
      initial.set(c.id, { email: c.email, phone: c.phone });
    });
    return initial;
  });

  const updateSelection = (
    contactId: string,
    field: "email" | "phone",
    value: string | null
  ) => {
    setSelections((prev) => {
      const next = new Map(prev);
      const current = next.get(contactId) || { email: null, phone: null };
      next.set(contactId, { ...current, [field]: value });
      return next;
    });
  };

  const handleConfirm = () => {
    onConfirm(selections);
    onClose();
  };

  // Filter to only show contacts with multiple emails or phones
  const contactsToReview = contacts.filter(
    (c) => c.allEmails.length > 1 || c.allPhones.length > 1
  );

  if (contactsToReview.length === 0) {
    // No contacts need review
    onConfirm(selections);
    onClose();
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">
            Review Contact Details
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Some contacts have multiple emails or phone numbers. Select which
            one to use for invites.
          </p>
        </div>

        {/* Contact list */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {contactsToReview.map((contact) => {
            const selection = selections.get(contact.id) || {
              email: contact.email,
              phone: contact.phone,
            };

            return (
              <div
                key={contact.id}
                className="bg-slate-50 rounded-lg p-4 space-y-3"
              >
                <div className="font-medium text-slate-900">
                  {contact.displayName ||
                    contact.email ||
                    contact.phone ||
                    "Unknown"}
                </div>

                {/* Emails */}
                {contact.allEmails.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Email for invites
                    </label>
                    <div className="space-y-1">
                      {contact.allEmails.map((email) => (
                        <label
                          key={email}
                          className="flex items-center gap-2 p-2 rounded hover:bg-white cursor-pointer"
                        >
                          <input
                            type="radio"
                            name={`email-${contact.id}`}
                            checked={selection.email === email}
                            onChange={() =>
                              updateSelection(contact.id, "email", email)
                            }
                            className="text-nexus-600 focus:ring-nexus-500"
                          />
                          <span className="text-sm text-slate-700">{email}</span>
                          {email === contact.email && (
                            <span className="text-xs text-slate-400">
                              (original)
                            </span>
                          )}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Phones */}
                {contact.allPhones.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Phone for invites
                    </label>
                    <div className="space-y-1">
                      {contact.allPhones.map((phone) => (
                        <label
                          key={phone}
                          className="flex items-center gap-2 p-2 rounded hover:bg-white cursor-pointer"
                        >
                          <input
                            type="radio"
                            name={`phone-${contact.id}`}
                            checked={selection.phone === phone}
                            onChange={() =>
                              updateSelection(contact.id, "phone", phone)
                            }
                            className="text-nexus-600 focus:ring-nexus-500"
                          />
                          <span className="text-sm text-slate-700">{phone}</span>
                          {phone === contact.phone && (
                            <span className="text-xs text-slate-400">
                              (original)
                            </span>
                          )}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-nexus-600 hover:bg-nexus-700 rounded-lg transition-colors"
          >
            Confirm & Sync
          </button>
        </div>
      </div>
    </div>
  );
}
