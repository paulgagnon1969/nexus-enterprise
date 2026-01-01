"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageCard } from "../ui-shell";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface MyOnboardingSession {
  id: string;
  email: string;
  status: string;
  createdAt: string;
  checklist: {
    profileComplete?: boolean;
    photoUploaded?: boolean;
    govIdUploaded?: boolean;
    skillsComplete?: boolean;
    [key: string]: any;
  };
  profile?: {
    firstName?: string | null;
    lastName?: string | null;
    city?: string | null;
    state?: string | null;
  } | null;
  documents?: {
    id: string;
    type: "PHOTO" | "GOV_ID" | "OTHER" | string;
    fileUrl: string;
    createdAt: string;
  }[];
  token: string;
}

function statusLabel(status: string): string {
  switch (status) {
    case "NOT_STARTED":
      return "Not started";
    case "IN_PROGRESS":
      return "In progress";
    case "SUBMITTED":
      return "Submitted";
    case "UNDER_REVIEW":
      return "Under review";
    case "APPROVED":
      return "Approved";
    case "REJECTED":
      return "Rejected";
    default:
      return status || "Unknown";
  }
}

export default function CandidateHomePage() {
  const [session, setSession] = useState<MyOnboardingSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missingProfile, setMissingProfile] = useState(false);
  const [creatingProfile, setCreatingProfile] = useState(false);
  const [lang, setLang] = useState<"en" | "es">("en");
  const router = useRouter();

  // Redirect all traffic from /candidate to the main portfolio manager page.
  useEffect(() => {
    router.replace("/settings/profile");
  }, [router]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const token = window.localStorage.getItem("accessToken");
    if (!token) {
      setError("Missing access token. Please log in again.");
      setLoading(false);
      return;
    }

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(`${API_BASE}/onboarding/my-session`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.status === 404) {
          // No Nexis profile yet for this user; show CTA to create one.
          setMissingProfile(true);
          setSession(null);
          return;
        }

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(text || `Failed to load your Nexis profile (${res.status}).`);
        }

        const json: MyOnboardingSession = await res.json();
        setSession(json);
        setMissingProfile(false);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load your Nexis profile.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  const photoUploaded = !!session?.documents?.some(d => d.type === "PHOTO");
  const govIdUploaded = !!session?.documents?.some(d => d.type === "GOV_ID");

  async function handleCreateProfile() {
    if (typeof window === "undefined") return;
    const token = window.localStorage.getItem("accessToken");
    if (!token) {
      setError("Missing access token. Please log in again.");
      return;
    }

    try {
      setCreatingProfile(true);
      setError(null);

      const res = await fetch(`${API_BASE}/onboarding/start-self`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Failed to create your Nexis profile (${res.status}).`);
      }

      const json: MyOnboardingSession = await res.json();
      setSession(json);
      setMissingProfile(false);
    } catch (e: any) {
      setError(e?.message ?? "Failed to create your Nexis profile.");
    } finally {
      setCreatingProfile(false);
    }
  }

  const displayName = session?.profile &&
    (`${session.profile.firstName ?? ""} ${session.profile.lastName ?? ""}`.trim() || null);
  const headerTitle = displayName ? `${displayName} (${session?.email ?? ""})` : session?.email ?? "";

  let profilePhotoUrl: string | null = null;
  const photoDoc = session?.documents?.find(d => d.type === "PHOTO");
  if (photoDoc?.fileUrl) {
    profilePhotoUrl = photoDoc.fileUrl.startsWith("/uploads/")
      ? `${API_BASE}${photoDoc.fileUrl}`
      : photoDoc.fileUrl;
  }
  const fallbackPhotoUrl = "/pg-pic-20250410-2.jpg";

  return (
    <PageCard>
      {session && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: 12,
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            backgroundColor: "#ffffff",
            marginBottom: 14,
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "9999px",
              overflow: "hidden",
              backgroundColor: "#e5e7eb",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <img
              src={profilePhotoUrl || fallbackPhotoUrl}
              alt={displayName ? `Profile photo of ${displayName}` : "Profile photo"}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#111827" }}>
              {headerTitle || "—"}
            </div>
            <div style={{ marginTop: 3, fontSize: 13, color: "#6b7280" }}>
              Your Nexis portfolio is visible to Nexus System and invited organizations. Additional
              HR-only details you provide are stored internally and are not shown on this page.
            </div>
          </div>
        </div>
      )}

      <h2 style={{ marginTop: 0, fontSize: 18 }}>Contractor Marketplace Portfolio</h2>
      <p style={{ fontSize: 13, color: "#6b7280" }}>
        This account is part of the national portfolio pool for Nexus System contractors. You can
        review your Nexis profile status and see what&apos;s completed versus what is still
        pending.
      </p>

      {loading ? (
        <p style={{ fontSize: 13, color: "#6b7280", marginTop: 12 }}>Loading your Nexis profile…</p>
      ) : error ? (
        <p style={{ fontSize: 13, color: "#b91c1c", marginTop: 12 }}>{error}</p>
      ) : missingProfile ? (
        <>
          <hr style={{ margin: "16px 0", borderColor: "#e5e7eb" }} />
          <section>
            <h3 style={{ fontSize: 15, margin: "0 0 6px" }}>Create your Nexis profile</h3>
            <p style={{ fontSize: 13, color: "#4b5563", marginTop: 0 }}>
              We couldn&apos;t find a Nexis profile for this account yet. Create one to
              start building your personal portfolio and checklist.
            </p>
            <button
              type="button"
              onClick={() => void handleCreateProfile()}
              disabled={creatingProfile}
              style={{
                marginTop: 8,
                padding: "8px 12px",
                borderRadius: 4,
                border: "1px solid #0f172a",
                backgroundColor: creatingProfile ? "#e5e7eb" : "#0f172a",
                color: creatingProfile ? "#4b5563" : "#f9fafb",
                fontSize: 13,
                cursor: creatingProfile ? "default" : "pointer",
              }}
            >
              {creatingProfile ? "Creating…" : "Create my Nexis profile"}
            </button>
          </section>
        </>
      ) : session ? (
        <>
          <hr style={{ margin: "16px 0", borderColor: "#e5e7eb" }} />

          <section>
            <h3 style={{ fontSize: 15, margin: "0 0 4px" }}>Nexis profile overview</h3>
            <p style={{ fontSize: 13, color: "#4b5563", marginTop: 0 }}>
              Status: <strong>{statusLabel(session.status)}</strong>
            </p>
            <p style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
              Submitted email: <strong>{session.email}</strong>
            </p>
            {session.profile && (
              <p style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                Name: <strong>{`${session.profile.firstName ?? ""} ${session.profile.lastName ?? ""}`.trim() || "(not set yet)"}</strong>
                {" · "}
                Location: <strong>{(session.profile.city || session.profile.state) ? `${session.profile.city ?? ""}${session.profile.city && session.profile.state ? ", " : ""}${session.profile.state ?? ""}` : "(not set yet)"}</strong>
              </p>
            )}
          </section>

          <section style={{ marginTop: 16 }}>
            <h3 style={{ fontSize: 15, margin: "0 0 6px" }}>Checklist</h3>
            <p style={{ fontSize: 12, color: "#6b7280", marginTop: 0 }}>
              Each item below shows whether it has been completed in your Nexis profile.
            </p>
            <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0" }}>
              <ChecklistItem
                label="Basic profile information"
                completed={!!session.checklist.profileComplete}
              />
              <ChecklistItem
                label="Profile photo uploaded"
                completed={photoUploaded || !!session.checklist.photoUploaded}
              />
              <ChecklistItem
                label="Government ID uploaded"
                completed={govIdUploaded || !!session.checklist.govIdUploaded}
              />
              <ChecklistItem
                label="Trade skills self-assessment"
                completed={!!session.checklist.skillsComplete}
              />
              <ChecklistItem
                label="Nexis profile submitted for review"
                completed={
                  session.status === "SUBMITTED" ||
                  session.status === "UNDER_REVIEW" ||
                  session.status === "APPROVED"
                }
              />
            </ul>
          </section>

          <section style={{ marginTop: 16 }}>
            <h3 style={{ fontSize: 15, margin: "0 0 6px" }}>Update or review your details</h3>
            <p style={{ fontSize: 12, color: "#6b7280", marginTop: 0 }}>
              You can continue your onboarding profile to review or update your information
              (where allowed) and see the full portfolio details stored for you.
            </p>
            <a
              href="/settings/profile"
              style={{
                display: "inline-block",
                marginTop: 6,
                padding: "6px 10px",
                borderRadius: 4,
                border: "1px solid #0f172a",
                backgroundColor: "#0f172a",
                color: "#f9fafb",
                fontSize: 12,
                textDecoration: "none",
              }}
            >
              Continue Onboarding profile...
            </a>
          </section>

          <section style={{ marginTop: 24 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
                marginBottom: 8,
              }}
            >
              <h3 style={{ fontSize: 15, margin: 0 }}>About your Nexis profile</h3>
      <div
                style={{
                  display: "inline-flex",
                  borderRadius: 999,
                  border: "1px solid #e5e7eb",
                  overflow: "hidden",
                }}
              >
                <button
                  type="button"
                  onClick={() => setLang("en")}
                  style={{
                    padding: "4px 10px",
                    fontSize: 12,
                    border: "none",
                    backgroundColor: lang === "en" ? "#0f172a" : "#ffffff",
                    color: lang === "en" ? "#f9fafb" : "#4b5563",
                    cursor: "pointer",
                  }}
                >
                  EN
                </button>
                <button
                  type="button"
                  onClick={() => setLang("es")}
                  style={{
                    padding: "4px 10px",
                    fontSize: 12,
                    border: "none",
                    borderLeft: "1px solid #e5e7eb",
                    backgroundColor: lang === "es" ? "#0f172a" : "#ffffff",
                    color: lang === "es" ? "#f9fafb" : "#4b5563",
                    cursor: "pointer",
                  }}
                >
                  ES
                </button>
              </div>
            </div>

            {lang === "en" ? <PortfolioEn /> : <PortfolioEs />}
          </section>
        </>
      ) : (
        <p style={{ fontSize: 13, color: "#6b7280", marginTop: 12 }}>
          We could not find an onboarding session linked to this account yet.
        </p>
      )}
    </PageCard>
  );
}

function ChecklistItem({
  label,
  completed,
}: {
  label: string;
  completed: boolean;
}) {
  return (
    <li
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 13,
        padding: "4px 0",
      }}
    >
      <span
        style={{
          width: 14,
          height: 14,
          borderRadius: 999,
          border: completed ? "none" : "1px solid #d1d5db",
          backgroundColor: completed ? "#16a34a" : "#ffffff",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 10,
          color: "#f9fafb",
        }}
      >
        {completed ? "✓" : ""}
      </span>
      <span style={{ color: completed ? "#111827" : "#4b5563" }}>{label}</span>
    </li>
  );
}

function PortfolioEn() {
  return (
    <div style={{ fontSize: 13, color: "#333" }}>
      <hr
        style={{
          margin: "5px 0",
          border: 0,
          height: 1,
          background: "#ccc",
        }}
      />
      <h2
        style={{
          margin: "8px 0 6px",
          textAlign: "center",
          fontSize: 16,
        }}
      >
        <span style={{ color: "#000080", fontWeight: 700 }}>
          Welcome to Your Nexus Contractor Connect Capability Portfolio
        </span>
      </h2>
      <hr
        style={{
          margin: "5px 0",
          border: 0,
          height: 1,
          background: "#ccc",
        }}
      />

      <p style={{ textAlign: "center", margin: "4px 0" }}>
        Join the Marketplace &amp; Try NCC Enterprise Application for Your Business:
      </p>
      <hr
        style={{
          margin: "5px 0",
          border: 0,
          height: 1,
          background: "#ccc",
        }}
      />

      <p style={{ margin: "4px 0" }}>
        <span style={{ color: "#000080", fontWeight: 700 }}>
          Advanced Estimating + Full Project Infrastructure
        </span>
      </p>
      <hr
        style={{
          margin: "5px 0",
          border: 0,
          height: 1,
          background: "#ccc",
        }}
      />

      <p style={{ margin: "4px 0" }}>
        Financials (estimating and billing), daily project management (task and personnel
        alignment), Asset management, learning and reference documentaiton, certifications
        and more
      </p>
      <hr
        style={{
          margin: "5px 0",
          border: 0,
          height: 1,
          background: "#ccc",
        }}
      />

      <p style={{ margin: "4px 0" }}>
        <span style={{ color: "#000080", fontWeight: 700 }}>Nexus Contractor Connect</span>
      </p>
      <hr
        style={{
          margin: "5px 0",
          border: 0,
          height: 1,
          background: "#ccc",
        }}
      />

      <p style={{ margin: "4px 0" }}>
        Our network is <strong>always looking</strong> for capable individuals, sole
        proprietors, specialty subcontractors, and organizations of any size to join our
        high-demand contractor marketplace. General Contractors, Project Managers, and
        project owners are actively searching for skilled professionals and reliable
        teams to deliver projects every day.
      </p>
      <hr
        style={{
          margin: "5px 0",
          border: 0,
          height: 1,
          background: "#ccc",
        }}
      />

      <p style={{ margin: "4px 0" }}>
        <span style={{ color: "#000080", fontWeight: 700 }}>
          Registering your Capability Portfolio gets you Discovered
        </span>
      </p>
      <hr
        style={{
          margin: "5px 0",
          border: 0,
          height: 1,
          background: "#ccc",
        }}
      />

      <p style={{ margin: "4px 0" }}>
        For contractors who want real business tools, thjis portfolio registration
        unlocks the <strong>Nexus Contractor Connect (NCC) App</strong> as your all-in-one
        operating system.
      </p>
      <p style={{ margin: "4px 0" }}>
        Start testing it immediately, especially our <strong>estimating engine</strong> &mdash;
        designed to scale from simple, fast bids to fully integrated, robust estimates
        that flow directly into your project timeline, schedules, and accounting (down to
        the room level if desired).
      </p>

      <ul style={{ margin: "6px 0", paddingLeft: 20 }}>
        <li style={{ marginBottom: 4 }}>
          <strong>For Individuals, Sole Proprietors &amp; Tradespeople:</strong> Create
          your <strong>free professional portfolio</strong> &mdash; upload your resume,
          showcase your skills, certifications, experience, and assets (tools, equipment,
          vehicles, availability). Get found by GCs and PMs for direct hires or
          subcontracting opportunities. <strong>Plus:</strong> As a registered
          contractor, instantly <strong>test the NCC App</strong> for your own jobs
          &mdash; start with simple, quick estimates to price your work, then grow into
          more detailed takeoffs. See how your estimates automatically feed into project
          schedules, daily logs, and basic accounting &mdash; all in one place. Perfect
          for sole proprietors who want professional tools without complexity.
        </li>
        <li style={{ marginBottom: 4 }}>
          <strong>
            For Companies, Subcontractors, Specialty Firms &amp; Larger Organizations:
          </strong>
          Showcase your full capabilities &mdash; crew sizes, equipment fleet, offices,
          service areas, bonding capacity, and availability. Advertise in the marketplace
          while discovering top talent. <strong>Best part:</strong> Upon registration,
          activate your own <strong>custom tenant</strong> and immediately start using the
          NCC App as your central business platform, featuring: &bull; <strong>
            Estimating
          </strong>{" "}
          &mdash; from basic line-item bids to advanced, integrated estimates
          (room-by-room detail, assemblies, labor/material breakdowns) &bull; Estimates
          that <strong>automatically flow</strong> into project timelines, Gantt-style
          schedules, resource allocation, and project accounting &bull; Daily logs,
          role-based project management, automated workflows, tagging, reports, invoicing
          prep &bull; <strong>Asset tracking</strong> for people, equipment, offices,
          vehicles, and more Test everything risk-free: run a real estimate, watch it
          populate your schedule and books, and see how it saves time and reduces errors
          &mdash; from first-time users to large-scale operations.
        </li>
      </ul>
      <hr
        style={{
          margin: "5px 0",
          border: 0,
          height: 1,
          background: "#ccc",
        }}
      />

      <p style={{ margin: "4px 0" }}>
        <span style={{ color: "#000080", fontWeight: 700 }}>
          Why Contractors Are Excited to Try NCC Estimating &amp; Operations:
        </span>
      </p>
      <hr
        style={{
          margin: "5px 0",
          border: 0,
          height: 1,
          background: "#ccc",
        }}
      />

      <ul style={{ margin: "6px 0", paddingLeft: 20 }}>
        <li style={{ marginBottom: 4 }}>
          Go from a simple bid to a fully connected and integrated project plan &mdash;
          estimates update schedules, trigger workflows, and feed accounting in real time
        </li>
        <li style={{ marginBottom: 4 }}>
          Room-level granularity when you need it (e.g., per-floor, per-space breakdowns
          for finish work, MEP coordination, etc.)
        </li>
        <li style={{ marginBottom: 4 }}>
          Sole proprietors get lightweight, powerful estimating without expensive
          software
        </li>
        <li style={{ marginBottom: 4 }}>
          Larger firms get scalable, multi-user tools with audit-ready data flow
        </li>
        <li style={{ marginBottom: 4 }}>
          The marketplace keeps bringing you opportunities while &mdash; GCs want
          contractors who can estimate accurately and execute efficiently
        </li>
      </ul>
      <hr
        style={{
          margin: "5px 0",
          border: 0,
          height: 1,
          background: "#ccc",
        }}
      />

      <p style={{ margin: "4px 0" }}>
        <span style={{ color: "#000080", fontWeight: 700 }}>
          Come and Joint the Nexus Contractor Connect network:
        </span>
      </p>
      <hr
        style={{
          margin: "5px 0",
          border: 0,
          height: 1,
          background: "#ccc",
        }}
      />

      <p style={{ margin: "4px 0" }}>
        The Nexus Contractor Connect network is ready for you &mdash; and the NCC App is
        ready to transform how you estimate and run projects.
      </p>

      <ul style={{ margin: "6px 0", paddingLeft: 20 }}>
        <li style={{ marginBottom: 4 }}>
          <strong>Individuals &amp; Sole Proprietors:</strong> Build your free
          portfolio and start testing simple-to-advanced estimating today.
        </li>
        <li style={{ marginBottom: 4 }}>
          <strong>Companies &amp; Larger Contractors:</strong> Register your
          capabilities, activate your tenant, and run a full estimate-to-schedule
          workflow right now.
        </li>
      </ul>
    </div>
  );
}

function PortfolioEs() {
  return (
    <div style={{ fontSize: 13, color: "#333" }}>
      <hr
        style={{
          margin: "5px 0",
          border: 0,
          height: 1,
          background: "#ccc",
        }}
      />
      <h2
        style={{
          margin: "8px 0 6px",
          textAlign: "center",
          fontSize: 16,
        }}
      >
        <span style={{ color: "#000080", fontWeight: 700 }}>
          Bienvenido a Tu Portafolio de Capacidades de Nexus Contractor Connect
        </span>
      </h2>
      <hr
        style={{
          margin: "5px 0",
          border: 0,
          height: 1,
          background: "#ccc",
        }}
      />

      <p style={{ textAlign: "center", margin: "4px 0" }}>
        &Uacute;nete al Mercado y Prueba la Aplicaci&oacute;n Empresarial NCC para Tu
        Negocio:
      </p>
      <hr
        style={{
          margin: "5px 0",
          border: 0,
          height: 1,
          background: "#ccc",
        }}
      />

      <p style={{ textAlign: "center", margin: "4px 0" }}>
        <span style={{ color: "#000080", fontWeight: 700 }}>
          Estimaci&oacute;n Avanzada + Infraestructura Completa de Proyectos
        </span>
      </p>
      <hr
        style={{
          margin: "5px 0",
          border: 0,
          height: 1,
          background: "#ccc",
        }}
      />

      <p style={{ textAlign: "center", margin: "4px 0" }}>
        Finanzas (estimaci&oacute;n y facturaci&oacute;n), gesti&oacute;n diaria de
        proyectos (alineaci&oacute;n de tareas y personal), administraci&oacute;n de
        activos, documentaci&oacute;n de aprendizaje y referencia, certificaciones y
        m&aacute;s
      </p>
      <hr
        style={{
          margin: "5px 0",
          border: 0,
          height: 1,
          background: "#ccc",
        }}
      />

      <p style={{ textAlign: "center", margin: "4px 0" }}>
        <span style={{ color: "#000080", fontWeight: 700 }}>Nexus Contractor Connect</span>
      </p>
      <hr
        style={{
          margin: "5px 0",
          border: 0,
          height: 1,
          background: "#ccc",
        }}
      />

      <p style={{ margin: "4px 0" }}>
        Nuestra red <strong>siempre est&aacute; buscando</strong> individuos capaces,
        propietarios &uacute;nicos, subcontratistas especializados y organizaciones de
        cualquier tama&ntilde;o para unirse a nuestro mercado de contratistas de alta
        demanda. Los Contratistas Generales, Gerentes de Proyecto y due&ntilde;os de
        proyectos est&aacute;n activamente buscando profesionales calificados y equipos
        confiables como t&uacute; para entregar proyectos todos los d&iacute;as.
      </p>
      <hr
        style={{
          margin: "5px 0",
          border: 0,
          height: 1,
          background: "#ccc",
        }}
      />

      <p style={{ margin: "4px 0" }}>
        <span style={{ color: "#000080", fontWeight: 700 }}>
          Registrar tu Portafolio de Capacidades te hace ser Descubierto
        </span>
      </p>
      <hr
        style={{
          margin: "5px 0",
          border: 0,
          height: 1,
          background: "#ccc",
        }}
      />

      <p style={{ margin: "4px 0" }}>
        Para los contratistas que quieren herramientas reales de negocio, este registro
        de portafolio desbloquea la <strong>Aplicaci&oacute;n Nexus Contractor Connect
        (NCC)</strong> como tu sistema operativo todo-en-uno.
      </p>
      <p style={{ margin: "4px 0" }}>
        Empieza a probarla de inmediato, especialmente nuestro <strong>
          motor de estimaci&oacute;n
        </strong>{" "}
        &mdash; dise&ntilde;ado para escalar desde ofertas r&aacute;pidas y simples hasta
        estimaciones robustas e integradas que fluyen directamente a tu cronograma de
        proyecto, programaci&oacute;n y contabilidad (hasta el nivel de habitaci&oacute;n
        si lo deseas).
      </p>

      <ul style={{ margin: "6px 0", paddingLeft: 20 }}>
        <li style={{ marginBottom: 4 }}>
          <strong>Para Individuos, Propietarios &Uacute;nicos y Oficios:</strong> Crea tu
          <strong> portafolio profesional gratuito</strong> &mdash; sube tu curr&iacute;culum,
          destaca tus habilidades, certificaciones, experiencia y activos (herramientas,
          equipo, veh&iacute;culos, disponibilidad). S&eacute; encontrado por CGs y
          Gerentes de Proyecto para contrataciones directas o subcontrataciones.
          <strong> Adem&aacute;s:</strong> Como contratista registrado, prueba al
          instante la <strong>App NCC</strong> para tus propios trabajos &mdash; comienza
          con estimaciones simples y r&aacute;pidas para cotizar tu trabajo, y crece
          hacia desgloses m&aacute;s detallados. Observa c&oacute;mo tus estimaciones se
          alimentan autom&aacute;ticamente a cronogramas, bit&aacute;coras diarias y
          contabilidad b&aacute;sica &mdash; todo en un solo lugar. Ideal para
          propietarios &uacute;nicos que quieren herramientas profesionales sin
          complicaciones.
        </li>
        <li style={{ marginBottom: 4 }}>
          <strong>
            Para Empresas, Subcontratistas, Firmas Especializadas y Organizaciones M&aacute;s
            Grandes:
          </strong>
          Muestra todas tus capacidades &mdash; tama&ntilde;o de cuadrillas, flota de
          equipo, oficinas, &aacute;reas de servicio, capacidad de fianza y
          disponibilidad. Public&iacute;tate en el mercado mientras descubres talento de
          primer nivel. <strong>Lo mejor:</strong> Al registrarte, activa tu propio
          <strong> tenant personalizado</strong> e inicia de inmediato el uso de la App
          NCC como la plataforma central de tu negocio, con:
          <ul style={{ margin: "6px 0", paddingLeft: 20 }}>
            <li style={{ marginBottom: 4 }}>
              <strong>Estimaci&oacute;n</strong> &mdash; desde ofertas b&aacute;sicas por
              rengl&oacute;n hasta estimaciones avanzadas e integradas (detalle habitaci&oacute;n
              por habitaci&oacute;n, ensambles, desglose de mano de obra/materiales)
            </li>
            <li style={{ marginBottom: 4 }}>
              Estimaciones que <strong>fluyen autom&aacute;ticamente</strong> a
              cronogramas del proyecto, programaci&oacute;n estilo Gantt, asignaci&oacute;n
              de recursos y contabilidad de proyecto
            </li>
            <li style={{ marginBottom: 4 }}>
              Bit&aacute;coras diarias, gesti&oacute;n de proyectos basada en roles,
              flujos de trabajo automatizados, etiquetado, reportes, preparaci&oacute;n de
              facturaci&oacute;n
            </li>
            <li style={{ marginBottom: 4 }}>
              <strong>Seguimiento de activos</strong> para personas, equipo, oficinas,
              veh&iacute;culos y m&aacute;s
            </li>
          </ul>
          Prueba todo sin riesgo: realiza una estimaci&oacute;n real, observa c&oacute;mo
          se llena tu cronograma y libros contables, y descubre c&oacute;mo ahorra
          tiempo y reduce errores &mdash; desde usuarios nuevos hasta operaciones a gran
          escala.
        </li>
      </ul>
      <hr
        style={{
          margin: "5px 0",
          border: 0,
          height: 1,
          background: "#ccc",
        }}
      />

      <p style={{ margin: "4px 0" }}>
        <span style={{ color: "#000080", fontWeight: 700 }}>
          Por Qu&eacute; los Contratistas Est&aacute;n Entusiasmados de Probar la
          Estimaci&oacute;n y Operaciones de NCC:
        </span>
      </p>
      <hr
        style={{
          margin: "5px 0",
          border: 0,
          height: 1,
          background: "#ccc",
        }}
      />

      <ul style={{ margin: "6px 0", paddingLeft: 20 }}>
        <li style={{ marginBottom: 4 }}>
          Pasa de una oferta simple a un plan de proyecto completamente conectado e
          integrado &mdash; las estimaciones actualizan cronogramas, activan flujos de
          trabajo y alimentan la contabilidad en tiempo real
        </li>
        <li style={{ marginBottom: 4 }}>
          Nivel de detalle por habitaci&oacute;n cuando lo necesites (ej. desgloses por
          piso o espacio para acabados, coordinaci&oacute;n MEP, etc.)
        </li>
        <li style={{ marginBottom: 4 }}>
          Propietarios &uacute;nicos obtienen estimaci&oacute;n ligera y poderosa sin
          software caro
        </li>
        <li style={{ marginBottom: 4 }}>
          Empresas grandes obtienen herramientas escalables multiusuario con flujo de datos
          auditable
        </li>
        <li style={{ marginBottom: 4 }}>
          El mercado sigue tray&eacute;ndote oportunidades &mdash; los CGs quieren
          contratistas que estimen con precisi&oacute;n y ejecuten eficientemente
        </li>
      </ul>
      <hr
        style={{
          margin: "5px 0",
          border: 0,
          height: 1,
          background: "#ccc",
        }}
      />

      <p style={{ textAlign: "center", margin: "4px 0" }}>
        <strong>
          <span style={{ color: "#000080" }}>
            &iexcl;Ven y &Uacute;nete a la Red Nexus Contractor Connect!
          </span>
        </strong>
      </p>
      <hr
        style={{
          margin: "5px 0",
          border: 0,
          height: 1,
          background: "#ccc",
        }}
      />

      <p style={{ margin: "4px 0" }}>
        La red Nexus Contractor Connect est&aacute; lista para ti &mdash; y la App NCC
        est&aacute; lista para transformar c&oacute;mo estimas y diriges tus proyectos.
      </p>

      <ul style={{ margin: "6px 0", paddingLeft: 20 }}>
        <li style={{ marginBottom: 4 }}>
          <strong>Individuos y Propietarios &Uacute;nicos:</strong> Crea tu portafolio
          gratuito y empieza a probar estimaciones de simple a avanzadas hoy mismo.
        </li>
        <li style={{ marginBottom: 4 }}>
          <strong>Empresas y Contratistas Grandes:</strong> Registra tus capacidades,
          activa tu tenant y ejecuta un flujo completo de estimaci&oacute;n a cronograma
          ahora mismo.
        </li>
      </ul>
    </div>
  );
}
