export interface IceServersResponse {
  iceServers: RTCIceServer[];
  ttl: number;
}

export interface SessionInfo {
  id: string;
  sessionCode: string;
  status: string;
  mode: string;
  ticket: { id: string; subject: string };
  clientUser: { id: string; firstName: string; lastName: string; email: string } | null;
  agentUser: { id: string; firstName: string; lastName: string; email: string } | null;
}

/**
 * Lightweight HTTP client for the support REST API.
 */
export class SupportApiClient {
  constructor(
    private baseUrl: string,
    private token: string,
  ) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}/support${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
        ...init?.headers,
      },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || `HTTP ${res.status}`);
    }
    return res.json();
  }

  /** Fetch TURN/STUN ICE servers with time-limited credentials. */
  getIceServers(): Promise<IceServersResponse> {
    return this.request("/ice-servers");
  }

  /** Look up a session by its 6-char code. */
  getSession(code: string): Promise<SessionInfo> {
    return this.request(`/sessions/${code}`);
  }

  /** Create a new support ticket. */
  createTicket(subject: string, description?: string) {
    return this.request("/tickets", {
      method: "POST",
      body: JSON.stringify({ subject, description }),
    });
  }

  /** Create a session for a ticket. */
  createSession(ticketId: string) {
    return this.request(`/tickets/${ticketId}/session`, { method: "POST" });
  }

  /** End a session. */
  endSession(sessionId: string) {
    return this.request(`/sessions/${sessionId}`, { method: "DELETE" });
  }
}
