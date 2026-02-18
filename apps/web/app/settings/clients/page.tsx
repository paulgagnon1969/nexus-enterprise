"use client";

import { useEffect, useState, useRef } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface TenantClient {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  active: boolean;
  projectCount: number;
  hasPortalAccess: boolean;
  portalUserId: string | null;
}

interface ClientDetail extends TenantClient {
  notes: string | null;
  projects: Array<{
    id: string;
    name: string;
    status: string;
    addressLine1: string;
    city: string;
    state: string;
  }>;
  portalUser: {
    id: string;
    email: string;
    name: string;
  } | null;
}

export default function ClientsPage() {
  const [clients, setClients] = useState<TenantClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Client detail modal
  const [selectedClient, setSelectedClient] = useState<ClientDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Invite state
  const [inviting, setInviting] = useState<string | null>(null);
  const [inviteMessage, setInviteMessage] = useState<{ clientId: string; message: string; isError: boolean } | null>(null);

  // New client form state
  const [showNewClientForm, setShowNewClientForm] = useState(false);
  const [newClient, setNewClient] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    company: "",
    notes: "",
  });
  const [creatingClient, setCreatingClient] = useState(false);
  const [createMessage, setCreateMessage] = useState<{ message: string; isError: boolean } | null>(null);

  // Marketplace search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{
    id: string;
    maskedPhone: string;
    initials: string;
    isAlreadyMember: boolean;
    // Extended fields from person details
    emails?: Array<{ masked: string; full: string; isPrimary: boolean; verified: boolean }>;
    loaded?: boolean;
  }>>([]);
  const [searching, setSearching] = useState(false);
  const [searchPerformed, setSearchPerformed] = useState(false);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [loadingPerson, setLoadingPerson] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;

  useEffect(() => {
    loadClients();
  }, []);

  async function loadClients() {
    if (!token) {
      setError("Missing access token. Please log in again.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/clients`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error(`Failed to load clients (${res.status})`);
      }
      const data: TenantClient[] = await res.json();
      setClients(data);
    } catch (err: any) {
      setError(err.message || "Failed to load clients.");
    } finally {
      setLoading(false);
    }
  }

  async function loadClientDetail(clientId: string) {
    if (!token) return;

    setDetailLoading(true);
    try {
      const res = await fetch(`${API_BASE}/clients/${clientId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error(`Failed to load client details (${res.status})`);
      }
      const data: ClientDetail = await res.json();
      setSelectedClient(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDetailLoading(false);
    }
  }

  async function inviteToPortal(clientId: string) {
    if (!token) return;

    setInviting(clientId);
    setInviteMessage(null);

    try {
      const res = await fetch(`${API_BASE}/clients/${clientId}/invite`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ visibility: "LIMITED" }),
      });

      if (!res.ok) {
        const text = await res.text();
        let message = `Invite failed (${res.status})`;
        try {
          const json = JSON.parse(text);
          message = json.message || message;
        } catch {
          message = text || message;
        }
        setInviteMessage({ clientId, message, isError: true });
        return;
      }

      const result = await res.json();
      setInviteMessage({
        clientId,
        message: `Portal access granted! ${result.projectsGranted?.length || 0} project(s) shared.`,
        isError: false,
      });

      // Refresh the clients list
      await loadClients();

      // If we have the detail open, refresh it too
      if (selectedClient?.id === clientId) {
        await loadClientDetail(clientId);
      }
    } catch (err: any) {
      setInviteMessage({ clientId, message: err.message || "Invite failed.", isError: true });
    } finally {
      setInviting(null);
    }
  }

  // Search marketplace for existing Nexus users
  async function searchMarketplace(query: string) {
    if (!token) return;
    
    const cleaned = query.replace(/\D/g, ""); // Extract digits for phone search
    if (cleaned.length < 7 && !query.includes("@")) {
      setSearchResults([]);
      setSearchPerformed(false);
      return;
    }

    setSearching(true);
    setSearchPerformed(true);
    setSelectedPersonId(null);

    try {
      const params = new URLSearchParams();
      if (cleaned.length >= 7) {
        params.set("phone", cleaned);
      }
      if (query.includes("@")) {
        params.set("email", query.trim());
      }

      const res = await fetch(`${API_BASE}/onboarding/cross-tenant/search?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        const results = data.results || [];
        setSearchResults(results);
        
        // Auto-load full details for each result to get emails
        for (const result of results) {
          loadPersonDetailsIntoResults(result.id, cleaned || query);
        }
      } else {
        setSearchResults([]);
      }
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }

  // Load full details for a person and update the search results
  async function loadPersonDetailsIntoResults(personId: string, phone: string) {
    if (!token) return;

    try {
      const res = await fetch(
        `${API_BASE}/onboarding/cross-tenant/person/${personId}?phone=${encodeURIComponent(phone)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.ok) {
        const data = await res.json();
        // Update the search results with the full email data
        setSearchResults(prev => prev.map(r => 
          r.id === personId 
            ? { ...r, emails: data.emails, loaded: true }
            : r
        ));
      }
    } catch {
      // Ignore errors
    }
  }

  // Create client from existing Nexus user
  async function createClientFromUser(userId: string, email: string) {
    if (!token) return;

    setCreatingClient(true);
    setCreateMessage(null);

    try {
      const res = await fetch(`${API_BASE}/clients/from-user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId, email }),
      });

      if (!res.ok) {
        const text = await res.text();
        let message = `Failed to link client (${res.status})`;
        try {
          const json = JSON.parse(text);
          message = json.message || message;
        } catch {
          message = text || message;
        }
        setCreateMessage({ message, isError: true });
        return;
      }

      const result = await res.json();
      setCreateMessage({ 
        message: `Client linked successfully! ${result.hasPortalAccess ? "They already have portal access." : "You can now invite them to the portal."}`, 
        isError: false 
      });
      
      // Reset search state
      setSearchQuery("");
      setSearchResults([]);
      setSearchPerformed(false);
      setSelectedPersonId(null);
      setShowNewClientForm(false);
      
      await loadClients();
    } catch (err: any) {
      setCreateMessage({ message: err.message || "Failed to link client.", isError: true });
    } finally {
      setCreatingClient(false);
    }
  }

  async function createClient() {
    if (!token) return;
    if (!newClient.firstName.trim() || !newClient.lastName.trim()) {
      setCreateMessage({ message: "First name and last name are required.", isError: true });
      return;
    }

    setCreatingClient(true);
    setCreateMessage(null);

    try {
      const res = await fetch(`${API_BASE}/clients`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          firstName: newClient.firstName.trim(),
          lastName: newClient.lastName.trim(),
          email: newClient.email.trim() || null,
          phone: newClient.phone.trim() || null,
          company: newClient.company.trim() || null,
          notes: newClient.notes.trim() || null,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        let message = `Failed to create client (${res.status})`;
        try {
          const json = JSON.parse(text);
          message = json.message || message;
        } catch {
          message = text || message;
        }
        setCreateMessage({ message, isError: true });
        return;
      }

      setCreateMessage({ message: "Client created successfully!", isError: false });
      setNewClient({ firstName: "", lastName: "", email: "", phone: "", company: "", notes: "" });
      setShowNewClientForm(false);
      await loadClients();
    } catch (err: any) {
      setCreateMessage({ message: err.message || "Failed to create client.", isError: true });
    } finally {
      setCreatingClient(false);
    }
  }

  async function revokePortalAccess(clientId: string) {
    if (!token) return;
    if (!confirm("Are you sure you want to revoke this client's portal access?")) return;

    setInviting(clientId);
    setInviteMessage(null);

    try {
      const res = await fetch(`${API_BASE}/clients/${clientId}/portal-access`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const text = await res.text();
        setInviteMessage({ clientId, message: `Revoke failed: ${text}`, isError: true });
        return;
      }

      setInviteMessage({ clientId, message: "Portal access revoked.", isError: false });
      await loadClients();

      if (selectedClient?.id === clientId) {
        await loadClientDetail(clientId);
      }
    } catch (err: any) {
      setInviteMessage({ clientId, message: err.message, isError: true });
    } finally {
      setInviting(null);
    }
  }

  if (loading) {
    return (
      <div className="app-card">
        <p style={{ fontSize: 14, color: "#6b7280" }}>Loading clients…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-card">
        <h1 style={{ marginTop: 0, fontSize: 20 }}>Clients</h1>
        <p style={{ color: "#b91c1c" }}>{error}</p>
      </div>
    );
  }

  return (
    <div className="app-card">
      <h1 style={{ marginTop: 0, fontSize: 20 }}>Client Portal Management</h1>
      <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
        Manage client portal access. Clients with portal access can log in and view their projects.
      </p>

      {/* New Client Button/Form */}
      <div style={{ marginTop: 16 }}>
        {!showNewClientForm ? (
          <button
            onClick={() => {
              setShowNewClientForm(true);
              setCreateMessage(null);
              setSearchQuery("");
              setSearchResults([]);
              setSearchPerformed(false);
              setSelectedPersonId(null);
            }}
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              border: "none",
              backgroundColor: "#2563eb",
              color: "#fff",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            + New Client
          </button>
        ) : (
          <div
            style={{
              padding: 16,
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              backgroundColor: "#f9fafb",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Add New Client</h3>
              <button
                onClick={() => {
                  setShowNewClientForm(false);
                  setCreateMessage(null);
                  setSearchQuery("");
                  setSearchResults([]);
                  setSearchPerformed(false);
                  setSelectedPersonId(null);
                }}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: 18,
                  cursor: "pointer",
                  color: "#6b7280",
                }}
              >
                ×
              </button>
            </div>

            {/* Step 1: Marketplace Search */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                Search NEXUS Marketplace
              </label>
              <p style={{ fontSize: 11, color: "#6b7280", margin: "0 0 8px" }}>
                Enter a phone number or email to check if this person already has a NEXUS account.
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    // Debounced search
                    if (searchTimeoutRef.current) {
                      clearTimeout(searchTimeoutRef.current);
                    }
                    searchTimeoutRef.current = setTimeout(() => {
                      searchMarketplace(e.target.value);
                    }, 500);
                  }}
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    borderRadius: 4,
                    border: "1px solid #d1d5db",
                    fontSize: 13,
                  }}
                  placeholder="Phone number or email..."
                />
                <button
                  type="button"
                  onClick={() => searchMarketplace(searchQuery)}
                  disabled={searching}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 4,
                    border: "1px solid #2563eb",
                    backgroundColor: "#2563eb",
                    color: "#fff",
                    fontSize: 13,
                    cursor: searching ? "default" : "pointer",
                    opacity: searching ? 0.6 : 1,
                  }}
                >
                  {searching ? "Searching..." : "Search"}
                </button>
              </div>
            </div>

            {/* Search Results */}
            {searchPerformed && (
              <div style={{ marginBottom: 16 }}>
                {searchResults.length > 0 ? (
                  <div
                    style={{
                      border: "1px solid #10b981",
                      borderRadius: 6,
                      backgroundColor: "#ecfdf5",
                      padding: 12,
                    }}
                  >
                    <p style={{ fontSize: 12, fontWeight: 600, color: "#065f46", margin: "0 0 8px" }}>
                      Found {searchResults.length} match{searchResults.length > 1 ? "es" : ""} in NEXUS
                    </p>
                    <p style={{ fontSize: 11, color: "#047857", margin: "0 0 8px" }}>
                      Select the person to link them as a client. They&apos;ll get instant portal access.
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {searchResults.map((result) => {
                        const isSelected = selectedPersonId === result.id;
                        const primaryEmail = result.emails?.find(e => e.isPrimary)?.full || result.emails?.[0]?.full;
                        
                        return (
                          <div
                            key={result.id}
                            style={{
                              padding: "12px",
                              borderRadius: 6,
                              border: isSelected ? "2px solid #10b981" : "1px solid #d1d5db",
                              backgroundColor: isSelected ? "#d1fae5" : "#fff",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                              <div>
                                <div style={{ fontSize: 14, fontWeight: 600 }}>{result.initials}</div>
                                {result.loaded && primaryEmail ? (
                                  <div style={{ fontSize: 13, color: "#374151", marginTop: 2 }}>{primaryEmail}</div>
                                ) : (
                                  <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>Loading email...</div>
                                )}
                                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{result.maskedPhone}</div>
                                {result.isAlreadyMember && (
                                  <div style={{ fontSize: 10, color: "#f59e0b", marginTop: 4 }}>Already a team member</div>
                                )}
                              </div>
                              <div>
                                {!isSelected ? (
                                  <button
                                    type="button"
                                    onClick={() => setSelectedPersonId(result.id)}
                                    disabled={!result.loaded}
                                    style={{
                                      padding: "6px 12px",
                                      borderRadius: 4,
                                      border: "1px solid #2563eb",
                                      backgroundColor: "#2563eb",
                                      color: "#fff",
                                      fontSize: 12,
                                      cursor: result.loaded ? "pointer" : "default",
                                      opacity: result.loaded ? 1 : 0.5,
                                    }}
                                  >
                                    Select
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setSelectedPersonId(null)}
                                    style={{
                                      padding: "6px 12px",
                                      borderRadius: 4,
                                      border: "1px solid #6b7280",
                                      backgroundColor: "#fff",
                                      color: "#374151",
                                      fontSize: 12,
                                      cursor: "pointer",
                                    }}
                                  >
                                    Cancel
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Show email selection when selected */}
                            {isSelected && result.emails && result.emails.length > 0 && (
                              <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #e5e7eb" }}>
                                <p style={{ fontSize: 11, color: "#6b7280", margin: "0 0 8px" }}>
                                  {result.emails.length > 1 ? "Select an email to use:" : "Confirm email:"}
                                </p>
                                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                  {result.emails.map((email) => (
                                    <button
                                      key={email.full}
                                      type="button"
                                      onClick={() => createClientFromUser(result.id, email.full)}
                                      disabled={creatingClient}
                                      style={{
                                        padding: "8px 12px",
                                        borderRadius: 4,
                                        border: "1px solid #10b981",
                                        backgroundColor: "#ecfdf5",
                                        cursor: creatingClient ? "default" : "pointer",
                                        textAlign: "left",
                                        fontSize: 13,
                                      }}
                                    >
                                      {creatingClient ? "Linking..." : `Link as ${email.full}`}
                                      {email.isPrimary && (
                                        <span style={{ marginLeft: 8, fontSize: 10, color: "#065f46" }}>Primary</span>
                                      )}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      border: "1px solid #fbbf24",
                      borderRadius: 6,
                      backgroundColor: "#fffbeb",
                      padding: 12,
                    }}
                  >
                    <p style={{ fontSize: 12, fontWeight: 600, color: "#92400e", margin: 0 }}>
                      No matches found in NEXUS Marketplace
                    </p>
                    <p style={{ fontSize: 11, color: "#b45309", margin: "4px 0 0" }}>
                      Create a new client record below. They&apos;ll receive an invite to set up their account.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Divider */}
            {searchPerformed && searchResults.length === 0 && (
              <hr style={{ border: "none", borderTop: "1px solid #e5e7eb", margin: "16px 0" }} />
            )}

            {/* Manual Entry Form - only show if no matches found or not searched yet */}
            {(!searchPerformed || searchResults.length === 0) && (
              <>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                  <div style={{ flex: "1 1 180px", minWidth: 150 }}>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
                      First Name *
                    </label>
                    <input
                      type="text"
                      value={newClient.firstName}
                      onChange={(e) => setNewClient({ ...newClient, firstName: e.target.value })}
                      style={{
                        width: "100%",
                        padding: "6px 10px",
                        borderRadius: 4,
                        border: "1px solid #d1d5db",
                        fontSize: 13,
                      }}
                      placeholder="John"
                    />
                  </div>
                  <div style={{ flex: "1 1 180px", minWidth: 150 }}>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
                      Last Name *
                    </label>
                    <input
                      type="text"
                      value={newClient.lastName}
                      onChange={(e) => setNewClient({ ...newClient, lastName: e.target.value })}
                      style={{
                        width: "100%",
                        padding: "6px 10px",
                        borderRadius: 4,
                        border: "1px solid #d1d5db",
                        fontSize: 13,
                      }}
                      placeholder="Smith"
                    />
                  </div>
                  <div style={{ flex: "1 1 200px", minWidth: 180 }}>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
                      Email
                    </label>
                    <input
                      type="email"
                      value={newClient.email}
                      onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
                      style={{
                        width: "100%",
                        padding: "6px 10px",
                        borderRadius: 4,
                        border: "1px solid #d1d5db",
                        fontSize: 13,
                      }}
                      placeholder="john@clientco.com"
                    />
                  </div>
                  <div style={{ flex: "1 1 150px", minWidth: 130 }}>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
                      Phone
                    </label>
                    <input
                      type="tel"
                      value={newClient.phone}
                      onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })}
                      style={{
                        width: "100%",
                        padding: "6px 10px",
                        borderRadius: 4,
                        border: "1px solid #d1d5db",
                        fontSize: 13,
                      }}
                      placeholder="555-123-4567"
                    />
                  </div>
                  <div style={{ flex: "1 1 200px", minWidth: 180 }}>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
                      Company
                    </label>
                    <input
                      type="text"
                      value={newClient.company}
                      onChange={(e) => setNewClient({ ...newClient, company: e.target.value })}
                      style={{
                        width: "100%",
                        padding: "6px 10px",
                        borderRadius: 4,
                        border: "1px solid #d1d5db",
                        fontSize: 13,
                      }}
                      placeholder="Client Company Inc."
                    />
                  </div>
                </div>

                <div style={{ marginTop: 12 }}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
                    Notes
                  </label>
                  <textarea
                    value={newClient.notes}
                    onChange={(e) => setNewClient({ ...newClient, notes: e.target.value })}
                    rows={2}
                    style={{
                      width: "100%",
                      padding: "6px 10px",
                      borderRadius: 4,
                      border: "1px solid #d1d5db",
                      fontSize: 13,
                      resize: "vertical",
                    }}
                    placeholder="Optional notes about this client..."
                  />
                </div>

                {createMessage && (
                  <p
                    style={{
                      marginTop: 8,
                      fontSize: 12,
                      color: createMessage.isError ? "#dc2626" : "#166534",
                    }}
                  >
                    {createMessage.message}
                  </p>
                )}

                <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                  <button
                    onClick={createClient}
                    disabled={creatingClient}
                    style={{
                      padding: "8px 16px",
                      borderRadius: 6,
                      border: "none",
                      backgroundColor: "#2563eb",
                      color: "#fff",
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: creatingClient ? "default" : "pointer",
                      opacity: creatingClient ? 0.6 : 1,
                    }}
                  >
                    {creatingClient ? "Creating..." : "Create Client"}
                  </button>
                  <button
                    onClick={() => {
                      setShowNewClientForm(false);
                      setCreateMessage(null);
                      setSearchQuery("");
                      setSearchResults([]);
                      setSearchPerformed(false);
                      setSelectedPersonId(null);
                    }}
                    style={{
                      padding: "8px 16px",
                      borderRadius: 6,
                      border: "1px solid #d1d5db",
                      backgroundColor: "#fff",
                      color: "#374151",
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Clients table */}
      <div style={{ marginTop: 16 }}>
        {clients.length === 0 ? (
          <p style={{ fontSize: 13, color: "#6b7280" }}>
            No clients found. Link a client to a project to see them here.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 13,
              }}
            >
              <thead>
                <tr style={{ backgroundColor: "#f9fafb" }}>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Name</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Email</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Company</th>
                  <th style={{ textAlign: "center", padding: "6px 8px" }}>Projects</th>
                  <th style={{ textAlign: "center", padding: "6px 8px" }}>Portal Access</th>
                  <th style={{ textAlign: "center", padding: "6px 8px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr key={client.id}>
                    <td style={{ padding: "8px", borderTop: "1px solid #e5e7eb" }}>
                      <button
                        onClick={() => loadClientDetail(client.id)}
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          color: "#2563eb",
                          cursor: "pointer",
                          fontSize: 13,
                          textDecoration: "underline",
                        }}
                      >
                        {client.displayName}
                      </button>
                    </td>
                    <td style={{ padding: "8px", borderTop: "1px solid #e5e7eb" }}>
                      {client.email ? (
                        <a
                          href={`mailto:${client.email}`}
                          style={{ color: "#2563eb", textDecoration: "none" }}
                        >
                          {client.email}
                        </a>
                      ) : (
                        <span style={{ color: "#9ca3af" }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: "8px", borderTop: "1px solid #e5e7eb" }}>
                      {client.company || <span style={{ color: "#9ca3af" }}>—</span>}
                    </td>
                    <td style={{ padding: "8px", borderTop: "1px solid #e5e7eb", textAlign: "center" }}>
                      {client.projectCount}
                    </td>
                    <td style={{ padding: "8px", borderTop: "1px solid #e5e7eb", textAlign: "center" }}>
                      {client.hasPortalAccess ? (
                        <span
                          style={{
                            display: "inline-block",
                            padding: "2px 8px",
                            borderRadius: 12,
                            backgroundColor: "#dcfce7",
                            color: "#166534",
                            fontSize: 11,
                            fontWeight: 500,
                          }}
                        >
                          Active
                        </span>
                      ) : (
                        <span
                          style={{
                            display: "inline-block",
                            padding: "2px 8px",
                            borderRadius: 12,
                            backgroundColor: "#f3f4f6",
                            color: "#6b7280",
                            fontSize: 11,
                            fontWeight: 500,
                          }}
                        >
                          Not Invited
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "8px", borderTop: "1px solid #e5e7eb", textAlign: "center" }}>
                      {client.hasPortalAccess ? (
                        <button
                          onClick={() => revokePortalAccess(client.id)}
                          disabled={inviting === client.id}
                          style={{
                            padding: "4px 10px",
                            borderRadius: 4,
                            border: "1px solid #dc2626",
                            backgroundColor: "#fff",
                            color: "#dc2626",
                            fontSize: 12,
                            cursor: inviting === client.id ? "default" : "pointer",
                            opacity: inviting === client.id ? 0.6 : 1,
                          }}
                        >
                          {inviting === client.id ? "..." : "Revoke"}
                        </button>
                      ) : client.email ? (
                        <button
                          onClick={() => inviteToPortal(client.id)}
                          disabled={inviting === client.id}
                          style={{
                            padding: "4px 10px",
                            borderRadius: 4,
                            border: "1px solid #2563eb",
                            backgroundColor: "#2563eb",
                            color: "#fff",
                            fontSize: 12,
                            cursor: inviting === client.id ? "default" : "pointer",
                            opacity: inviting === client.id ? 0.6 : 1,
                          }}
                        >
                          {inviting === client.id ? "Inviting..." : "Invite to Portal"}
                        </button>
                      ) : (
                        <span style={{ color: "#9ca3af", fontSize: 11 }}>No email</span>
                      )}
                      {inviteMessage?.clientId === client.id && (
                        <p
                          style={{
                            marginTop: 4,
                            fontSize: 11,
                            color: inviteMessage.isError ? "#dc2626" : "#166534",
                          }}
                        >
                          {inviteMessage.message}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Client detail modal */}
      {selectedClient && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
          }}
          onClick={() => setSelectedClient(null)}
        >
          <div
            style={{
              backgroundColor: "#fff",
              borderRadius: 8,
              padding: 24,
              maxWidth: 600,
              width: "90%",
              maxHeight: "80vh",
              overflow: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18 }}>{selectedClient.displayName}</h2>
                {selectedClient.company && (
                  <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: 13 }}>
                    {selectedClient.company}
                  </p>
                )}
              </div>
              <button
                onClick={() => setSelectedClient(null)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: 20,
                  cursor: "pointer",
                  color: "#6b7280",
                }}
              >
                ×
              </button>
            </div>

            {/* Contact info */}
            <div style={{ marginTop: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Contact</h3>
              <p style={{ fontSize: 13, margin: "4px 0" }}>
                <strong>Email:</strong>{" "}
                {selectedClient.email ? (
                  <a href={`mailto:${selectedClient.email}`} style={{ color: "#2563eb" }}>
                    {selectedClient.email}
                  </a>
                ) : (
                  <span style={{ color: "#9ca3af" }}>Not provided</span>
                )}
              </p>
              <p style={{ fontSize: 13, margin: "4px 0" }}>
                <strong>Phone:</strong>{" "}
                {selectedClient.phone || <span style={{ color: "#9ca3af" }}>Not provided</span>}
              </p>
            </div>

            {/* Portal access */}
            <div style={{ marginTop: 16, padding: 12, backgroundColor: "#f9fafb", borderRadius: 6 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Portal Access</h3>
              {selectedClient.hasPortalAccess ? (
                <div>
                  <p style={{ fontSize: 13, margin: 0, color: "#166534" }}>
                    ✓ Client has portal access
                  </p>
                  {selectedClient.portalUser && (
                    <p style={{ fontSize: 12, margin: "4px 0 0", color: "#6b7280" }}>
                      Logged in as: {selectedClient.portalUser.email}
                    </p>
                  )}
                  <button
                    onClick={() => revokePortalAccess(selectedClient.id)}
                    disabled={inviting === selectedClient.id}
                    style={{
                      marginTop: 8,
                      padding: "6px 12px",
                      borderRadius: 4,
                      border: "1px solid #dc2626",
                      backgroundColor: "#fff",
                      color: "#dc2626",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    Revoke Access
                  </button>
                </div>
              ) : (
                <div>
                  <p style={{ fontSize: 13, margin: 0, color: "#6b7280" }}>
                    Client does not have portal access
                  </p>
                  {selectedClient.email ? (
                    <button
                      onClick={() => inviteToPortal(selectedClient.id)}
                      disabled={inviting === selectedClient.id}
                      style={{
                        marginTop: 8,
                        padding: "6px 12px",
                        borderRadius: 4,
                        border: "1px solid #2563eb",
                        backgroundColor: "#2563eb",
                        color: "#fff",
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                    >
                      {inviting === selectedClient.id ? "Inviting..." : "Invite to Portal"}
                    </button>
                  ) : (
                    <p style={{ fontSize: 12, margin: "8px 0 0", color: "#dc2626" }}>
                      Add an email address to invite this client
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Projects */}
            <div style={{ marginTop: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                Linked Projects ({selectedClient.projects.length})
              </h3>
              {selectedClient.projects.length === 0 ? (
                <p style={{ fontSize: 13, color: "#6b7280" }}>No projects linked to this client.</p>
              ) : (
                <div style={{ fontSize: 13 }}>
                  {selectedClient.projects.map((p) => (
                    <div
                      key={p.id}
                      style={{
                        padding: "8px 0",
                        borderBottom: "1px solid #e5e7eb",
                      }}
                    >
                      <a
                        href={`/projects/${p.id}`}
                        style={{ color: "#2563eb", textDecoration: "none", fontWeight: 500 }}
                      >
                        {p.name}
                      </a>
                      <p style={{ margin: "2px 0 0", color: "#6b7280", fontSize: 12 }}>
                        {p.addressLine1}, {p.city}, {p.state} · {p.status}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Notes */}
            {selectedClient.notes && (
              <div style={{ marginTop: 16 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Notes</h3>
                <p style={{ fontSize: 13, color: "#374151", whiteSpace: "pre-wrap" }}>
                  {selectedClient.notes}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
