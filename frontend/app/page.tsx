"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { GpsMap } from "@/components/GpsMap";
import { acknowledgeAction, createSavedLocation, getActiveIncident, getAuditLog, getHousehold, getSavedLocations, getTimeline, simulateEvent } from "@/lib/api";
import type {
  ActiveIncidentResponse,
  AlertAuditEntry,
  CameraSignal,
  HouseholdMember,
  HouseholdState,
  NotificationIntent,
  SavedLocation,
  SourceKind,
  TimelineEntry
} from "@/lib/types";

const sourceOptions: Array<{ value: SourceKind; label: string }> = [
  { value: "nws", label: "NWS replay" },
  { value: "ipaws", label: "FEMA IPAWS replay" },
  { value: "slo_county", label: "SLO County replay" },
  { value: "cal_poly", label: "Cal Poly replay" }
];

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

function routeLine(member: HouseholdMember, intents: NotificationIntent[]): string {
  const intent = intents.find((item) => item.member_id === member.id);
  if (!intent) {
    return "No alert route for current classification";
  }
  return `${intent.channel.toUpperCase()} • ${intent.reason}`;
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
  const [savedLocations, setSavedLocations] = useState<SavedLocation[]>([]);
  const [focusedMemberId, setFocusedMemberId] = useState<string | null>(null);
  const [source, setSource] = useState<SourceKind>("nws");
  const [live, setLive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [ackId, setAckId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const incident = active?.incident ?? null;
  const plan = active?.action_plan ?? null;
  const classification = active?.classification ?? plan?.classification ?? null;
  const cameraSignal = active?.camera_signal ?? plan?.camera_signal ?? null;
  const notificationIntents = plan?.notification_intents ?? [];

  async function refresh() {
    const [householdResponse, activeResponse, timelineResponse, auditLogResponse, savedLocationsResponse] = await Promise.all([
      getHousehold(),
      getActiveIncident(),
      getTimeline(),
      getAuditLog(),
      getSavedLocations().catch(() => [] as SavedLocation[]),
    ]);
    setHousehold(householdResponse);
    setActive(activeResponse);
    setTimeline(timelineResponse);
    setAuditLog(auditLogResponse);
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

  async function handleSimulate() {
    setError(null);
    setSimulating(true);
    try {
      const response = await simulateEvent(source, live);
      setActive(response);
      const [householdResponse, timelineResponse] = await Promise.all([getHousehold(), getTimeline()]);
      setHousehold(householdResponse);
      setTimeline(timelineResponse);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Simulation failed.");
    } finally {
      setSimulating(false);
    }
  }

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
          <div className="headline-wrap">
            <div className="headline-ticker-wrap" aria-live="polite">
              <p className="headline-ticker">
                {incident ? incident.title.toUpperCase() : "ACTIVE ALERT HEADLINER"}
              </p>
            </div>
            <div className="headline-controls">
              <select
                aria-label="Replay source"
                className="ops-select"
                value={source}
                onChange={(event) => setSource(event.target.value as SourceKind)}
              >
                {sourceOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <label className="ops-toggle">
                <input
                  checked={live}
                  onChange={(event) => setLive(event.target.checked)}
                  type="checkbox"
                />
                Live/official
              </label>
              <button className="ops-button" disabled={simulating} onClick={handleSimulate}>
                {simulating ? "Classifying..." : "Run alert"}
              </button>
              <Link className="ops-button" href="/cameras" style={{ textDecoration: "none" }}>
                Manage Cameras
              </Link>
            </div>
          </div>
        </section>

        <section className="ops-panel area-summary ops-summary">
          <h2>Alert classification</h2>
          <p className="summary-subtitle">
            {classification
              ? `${classification.classified_by} • ${Math.round(classification.confidence * 100)}% confidence`
              : "Hermes classifier / local fallback"}
          </p>
          {classification ? <p className="classification-level">{classification.level.replaceAll("_", " ")}</p> : null}
          <p>{plan?.rationale ?? incident?.description ?? "Replay an alert to populate the live analysis panel."}</p>
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

        <section className="ops-panel area-dispatch ops-dispatch">
          <h2>Hermes routing</h2>
          {notificationIntents.length > 0 ? (
            notificationIntents.map((intent) => (
              <button key={intent.id}>
                {intent.member_name} • {intent.channel}
              </button>
            ))
          ) : (
            <>
              <button>Telegram route pending</button>
              <button>Call route pending</button>
            </>
          )}
          <p>Hermes handles Telegram and outbound calls. Backend validates classification and logs each result.</p>
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
          <h2>Live chat with GuardClaw</h2>
          <div className="chat-window">
            <p className="chat-bubble">
              Telegram is the active communication surface. Use the GuardClaw Hermes profile for the real chat demo.
            </p>
            <p className="chat-bubble inbound">Dashboard chat composer placeholder.</p>
          </div>
          <div className="chat-input">Message input disabled for MVP</div>
        </section>
      </div>
    </main>
  );
}
