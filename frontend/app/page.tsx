"use client";

import { useEffect, useState } from "react";

import { GpsMap } from "@/components/GpsMap";
import { acknowledgeAction, getActiveIncident, getHousehold, getTimeline, simulateEvent } from "@/lib/api";
import type {
  ActiveIncidentResponse,
  CameraSignal,
  HouseholdMember,
  HouseholdState,
  NotificationIntent,
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
  imageSrc,
  signal,
  featured = false,
}: {
  label: string;
  imageSrc: string;
  signal?: CameraSignal | null;
  featured?: boolean;
}) {
  const areaClass = label.toLowerCase().replace(" ", "");
  const ts = new Date().toLocaleString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return (
    <section className={`ops-panel ${areaClass}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageSrc} alt={`${label} feed`} className="cctv-video" />
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
    const [householdResponse, activeResponse, timelineResponse] = await Promise.all([
      getHousehold(),
      getActiveIncident(),
      getTimeline()
    ]);
    setHousehold(householdResponse);
    setActive(activeResponse);
    setTimeline(timelineResponse);
  }

  useEffect(() => {
    refresh()
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Unable to load GuardClaw data.");
      })
      .finally(() => setLoading(false));
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
            <p className="ops-kicker">GuardClaw household safety coordinator</p>
            <h1>{incident ? incident.title.toUpperCase() : "ACTIVE ALERT HEADLINER"}</h1>
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
          <GpsMap members={household?.members ?? []} />
        </section>

        <section className="ops-panel area-members ops-members">
          <h2>Member status</h2>
          <div className="member-lines">
            {household?.members.map((member, index) => (
              <p key={member.id}>
                <strong>Member {index + 1}: {memberStatusLine(member)}</strong>
                <span>{routeLine(member, notificationIntents)}</span>
              </p>
            )) ?? <p className="muted-text">Loading household members...</p>}
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

        <CctvPanel featured label="CCTV 1" imageSrc="/cctv/cam1.png" signal={cameraSignal} />
        <CctvPanel label="CCTV 2" imageSrc="/cctv/cam2.png" />
        <CctvPanel label="CCTV 3" imageSrc="/cctv/cam3.png" />
        <CctvPanel label="CCTV 4" imageSrc="/cctv/cam4.png" />

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
