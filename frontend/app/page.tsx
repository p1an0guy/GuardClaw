"use client";

import { useEffect, useState } from "react";

import { GpsMap } from "@/components/GpsMap";
import { IncidentHistoryModal } from "@/components/IncidentHistoryModal";
import { acknowledgeAction, createSavedLocation, getActiveIncident, getAuditLog, getHousehold, getLatestIncident, getSavedLocations, getTimeline } from "@/lib/api";
import type {
  ActiveIncidentResponse,
  AlertAuditEntry,
  CameraSignal,
  HouseholdMember,
  HouseholdState,
  IncidentRecord,
  SavedLocation,
  TimelineEntry
} from "@/lib/types";

function formatTimestamp(value?: string | null): string {
  if (!value) {
    return "No incident timestamp";
  }
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric"
  }).format(new Date(value));
}

function memberStatusLine(member: HouseholdMember): string {
  const speed = member.location?.speed_mps != null ? ` • ${Math.round(member.location.speed_mps * 2.237)} mph` : "";
  const mobile = member.mobile_status ? ` • mobile: ${member.mobile_status}` : "";
  return `${member.name}: ${member.status.replaceAll("_", " ").toUpperCase()}${speed}${mobile}`;
}

function statusColorWeb(status: string): string {
  const map: Record<string, string> = {
    safe: "#34D399", home: "#60A5FA", away: "#60A5FA",
    moving: "#FBBF24", commuting: "#FBBF24", work: "#FBBF24",
    needs_help: "#F87171", offline: "#94A3B8",
  };
  return map[status.toLowerCase().replace(/\s+/g, "_")] ?? "#94A3B8";
}

function formatRelative(isoDate: string): string {
  const diff = Math.max(0, Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000));
  if (diff < 45) return "just now";
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function sourceFreshness(active: ActiveIncidentResponse | null): string {
  const incident = active?.incident;
  if (!incident) {
    return "No source selected";
  }
  const freshness = typeof incident.raw?.source_freshness === "string" ? incident.raw.source_freshness : null;
  if (incident.is_live) {
    return "Live public alert";
  }
  if (freshness === "archived_official_delayed") {
    return "Official archive • delayed";
  }
  return incident.is_simulated ? "Replay fixture" : "Official source";
}

function CctvHud({ camId, timestamp }: { camId: string; timestamp: string }) {
  return (
    <>
      <p className="cctv-label">
        <span className="cctv-rec">● REC</span> {camId}
      </p>
      <p className="cctv-timestamp">{timestamp}</p>
    </>
  );
}

function CctvPanel({
  label,
  videoSrc,
  signal,
  featured = false,
}: {
  label: string;
  videoSrc?: string;
  signal?: CameraSignal | null;
  featured?: boolean;
}) {
  const areaClass = "";
  const cameraNumber = label.replace("CCTV ", "");
  const feedSrc = videoSrc ?? `/cctv/cam${cameraNumber}.mp4`;
  const posterSrc = `/cctv/cam${cameraNumber}.png`;
  const [ts, setTs] = useState("");
  useEffect(() => {
    setTs(new Date().toLocaleString("en-US", {
      month: "2-digit", day: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    }));
  }, []);
  return (
    <section className={`ops-panel ${areaClass}`}>
      <video
        aria-label={`${label} feed`}
        autoPlay
        className="cctv-video"
        loop
        muted
        playsInline
        poster={posterSrc}
        preload="auto"
        src={feedSrc}
      />
      <div className="cctv-shade" />
      <CctvHud camId={label} timestamp={ts} />
      {featured && signal ? (
        <>
          <p className="cctv-status">{signal.occupancy_confirmed ? "OCCUPANCY CONFIRMED" : "NO OCCUPANCY"}</p>
          <p className="cctv-note">{Math.round(signal.confidence * 100)}% confidence • {signal.label}</p>
        </>
      ) : (
        <p className="cctv-note">CAM {label.replace("CCTV ", "")} • LIVE</p>
      )}
    </section>
  );
}

export default function DashboardPage() {
  const [household, setHousehold] = useState<HouseholdState | null>(null);
  const [active, setActive] = useState<ActiveIncidentResponse | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [auditLog, setAuditLog] = useState<AlertAuditEntry[]>([]);
  const [latestIncident, setLatestIncident] = useState<IncidentRecord | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [savedLocations, setSavedLocations] = useState<SavedLocation[]>([]);
  const [focusedMemberId, setFocusedMemberId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [ackId, setAckId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [chatMessages, setChatMessages] = useState<Array<{role: string; content: string}>>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);

  const incident = active?.incident ?? null;
  const plan = active?.action_plan ?? null;
  const classification = active?.classification ?? plan?.classification ?? null;
  const cameraSignal = active?.camera_signal ?? plan?.camera_signal ?? null;

  async function refresh() {
    const [householdResponse, activeResponse, timelineResponse, auditLogResponse, incidentResponse, savedLocationsResponse] = await Promise.all([
      getHousehold(),
      getActiveIncident(),
      getTimeline(),
      getAuditLog(),
      getLatestIncident(),
      getSavedLocations().catch(() => [] as SavedLocation[]),
    ]);
    setHousehold(householdResponse);
    setActive(activeResponse);
    setTimeline(timelineResponse);
    setAuditLog(auditLogResponse);
    setLatestIncident(incidentResponse);
    setSavedLocations(savedLocationsResponse);
  }

  useEffect(() => {
    refresh()
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Unable to load GuardClaw data.");
      })
      .finally(() => setLoading(false));

    const interval = setInterval(() => {
      getAuditLog().then(setAuditLog).catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  async function handleAcknowledge(id: string) {
    setAckId(id);
    try {
      await acknowledgeAction(id);
      setTimeline(await getTimeline());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Acknowledgement failed.");
    } finally {
      setAckId(null);
    }
  }

  async function handleMarkLocation(memberId: string, label: string) {
    try {
      await createSavedLocation(memberId, label);
      setSavedLocations(await getSavedLocations().catch(() => [] as SavedLocation[]));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save location.");
    }
  }

  async function handleChatSend(e: React.FormEvent) {
    e.preventDefault();
    const msg = chatInput.trim();
    if (!msg) return;
    const updated = [...chatMessages, { role: "user", content: msg }];
    setChatMessages(updated);
    setChatInput("");
    setChatSending(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, history: updated.slice(0, -1) }),
      });
      const data = await res.json();
      setChatMessages([...updated, { role: "assistant", content: data.reply }]);
    } catch {
      setChatMessages([...updated, { role: "assistant", content: "Failed to reach GuardClaw. Please try again." }]);
    } finally {
      setChatSending(false);
    }
  }

  return (
    <main className="ops-shell">
      {error ? <div className="ops-error">{error}</div> : null}

      <div className="ops-grid">
        <section className="ops-panel area-alert ops-headline-panel">
          <div className="incident-pill">
            {incident
              ? `${sourceFreshness(active)} • ${classification?.level.replaceAll("_", " ").toUpperCase() ?? incident.severity.toUpperCase()} • ${formatTimestamp(incident.issued_at)}`
              : `DEMO MODE • ${loading ? "LOADING" : "NO ACTIVE INCIDENT"}`}
          </div>
          <div className="headline-wrap" onClick={() => setShowHistory(true)} style={{ cursor: "pointer" }} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") setShowHistory(true); }}>
            <div className="headline-ticker-wrap" aria-live="polite">
              <p className="headline-ticker">
                {incident ? incident.title.toUpperCase() : "ACTIVE ALERT HEADLINER"}
              </p>
            </div>
          </div>
        </section>

        <section className="ops-panel area-summary ops-summary">
          <h2>Incident summary</h2>
          {latestIncident ? (
            <>
              <div className="incident-history-meta" style={{ marginBottom: "0.5rem" }}>
                <span className={`audit-severity sev-${latestIncident.severity}`}>
                  {latestIncident.severity.toUpperCase()}
                </span>
                <span className="incident-history-level">
                  {latestIncident.classification_level.replaceAll("_", " ").toUpperCase()}
                </span>
                <span className="muted-text">{latestIncident.location_label}</span>
              </div>
              <p>{latestIncident.summary}</p>
              {latestIncident.affected_members.length > 0 && (
                <p className="muted-text" style={{ marginTop: "0.5rem" }}>
                  Affected: {latestIncident.affected_members.map((m) => m.name).join(", ")}
                </p>
              )}
            </>
          ) : (
            <>
              <p className="summary-subtitle">
                {classification
                  ? `${classification.classified_by} • ${Math.round(classification.confidence * 100)}% confidence`
                  : "Hermes classifier / local fallback"}
              </p>
              {classification ? <p className="classification-level">{classification.level.replaceAll("_", " ")}</p> : null}
              <p>{active?.summary ?? plan?.rationale ?? incident?.description ?? "Replay an alert to populate the incident summary."}</p>
            </>
          )}
        </section>

        <section className="ops-panel area-timeline ops-timeline">
          <h2>Action timeline/log</h2>
          <div className="timeline-list">
            {timeline.length === 0 ? (
              <p className="muted-text">No timeline entries yet.</p>
            ) : (
              timeline.map((entry) => (
                <article key={entry.id} className="timeline-entry">
                  <div>
                    <p className="timeline-kind">{entry.kind.replaceAll("_", " ")}</p>
                    <h3>{entry.title}</h3>
                    <p>{entry.detail}</p>
                  </div>
                  {entry.kind !== "acknowledgement" && !entry.acknowledged_at ? (
                    <button
                      className="mini-button"
                      disabled={ackId === entry.id}
                      onClick={() => handleAcknowledge(entry.id)}
                    >
                      {ackId === entry.id ? "Ack..." : "Ack"}
                    </button>
                  ) : (
                    <span className="ack-label">ACK</span>
                  )}
                </article>
              ))
            )}
          </div>
        </section>

        <section className="ops-panel area-map ops-map">
          <GpsMap focusedMemberId={focusedMemberId} members={household?.members ?? []} savedLocations={savedLocations} onMarkLocation={handleMarkLocation} />
        </section>

        <section className="ops-panel area-members ops-members">
          <h2>Family Status</h2>
          <p className="summary-subtitle">{household ? `${household.members.length} members visible` : "No members synced"}</p>
          <div className="member-cards">
            {household?.members.map((member) => {
              const color = statusColorWeb(member.status);
              return (
                <div key={member.id} className="member-card" onClick={() => setFocusedMemberId(member.id)}>
                  <div className="member-card-avatar" style={{ borderColor: color }}>
                    <span>{member.name.split(" ").filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join("") || "?"}</span>
                  </div>
                  <div className="member-card-info">
                    <div className="member-card-top">
                      <span className="member-card-name">{member.name}</span>
                      <span className={`member-card-role ${member.role}`}>
                        {member.role === "guardian" ? "🛡 Guardian" : "👤 Child"}
                      </span>
                      <span className="member-card-status" style={{ background: `${color}20`, borderColor: `${color}48`, color }}>
                        <i style={{ background: color }} />
                        {member.status.replaceAll("_", " ")}
                      </span>
                    </div>
                    <div className="member-card-meta">
                      {member.location ? (
                        <>
                          <span>🕐 {formatRelative(member.location.observed_at)}</span>
                          <span>📍 {member.location.source.replaceAll("_", " ")}</span>
                        </>
                      ) : (
                        <span>📍 location pending</span>
                      )}
                      {member.mobile_status ? <span>📱 {member.mobile_status}</span> : null}
                    </div>
                  </div>
                </div>
              );
            }) ?? <p className="muted-text">Loading household members...</p>}
          </div>
        </section>

        <section className="ops-panel area-audit">
          <h2>Alert audit log</h2>
          <div className="audit-list">
            {auditLog.length === 0 ? (
              <p className="muted-text">No alerts ingested yet.</p>
            ) : (
              auditLog.map((entry) => (
                <article key={entry.id} className="audit-entry">
                  <span className="audit-source">{entry.source_kind.toUpperCase()}</span>
                  <span className={`audit-severity sev-${entry.severity}`}>{entry.severity.toUpperCase()}</span>
                  <p className="audit-title">{entry.title}</p>
                  <p className="audit-meta">
                    {entry.event_type} •{" "}
                    {new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", month: "short", day: "numeric" }).format(new Date(entry.ingested_at))}
                    {entry.pipeline_triggered ? " • pipeline triggered" : ""}
                  </p>
                </article>
              ))
            )}
          </div>
        </section>

        <CctvPanel featured label="CCTV 1" signal={cameraSignal} />
        <CctvPanel label="CCTV 2" />
        <CctvPanel label="CCTV 3" />
        <CctvPanel label="CCTV 4" />

        <section className="ops-panel area-chat ops-chat">
          <h2>Chat with GuardClaw</h2>
          <div className="chat-window">
            {chatMessages.length === 0 ? (
              <p className="chat-bubble">Ask me about active alerts, family status, or what to do next.</p>
            ) : (
              chatMessages.map((msg, i) => (
                <p key={i} className={`chat-bubble ${msg.role === "user" ? "outbound" : "inbound"}`}>
                  {msg.content}
                </p>
              ))
            )}
          </div>
          <form className="chat-input-form" onSubmit={handleChatSend}>
            <input
              className="chat-input-field"
              placeholder="Type a message..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              disabled={chatSending}
            />
            <button className="ops-button" type="submit" disabled={chatSending || !chatInput.trim()}>
              {chatSending ? "..." : "Send"}
            </button>
          </form>
        </section>
      </div>

      {showHistory && <IncidentHistoryModal onClose={() => setShowHistory(false)} />}
    </main>
  );
}
