"use client";

import { useEffect, useState } from "react";
import { getIncidents } from "@/lib/api";
import type { IncidentRecord } from "@/lib/types";

function formatTs(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

export function IncidentHistoryModal({ onClose }: { onClose: () => void }) {
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getIncidents()
      .then(setIncidents)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Incident History</h2>
          <button className="mini-button" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {loading ? (
            <p className="muted-text">Loading incidents...</p>
          ) : incidents.length === 0 ? (
            <p className="muted-text">No incidents recorded yet.</p>
          ) : (
            incidents.map((inc) => (
              <article key={inc.id} className="incident-history-card">
                <div className="incident-history-meta">
                  <span className={`audit-severity sev-${inc.severity}`}>
                    {inc.severity.toUpperCase()}
                  </span>
                  <span className="incident-history-level">
                    {inc.classification_level.replaceAll("_", " ").toUpperCase()}
                  </span>
                  <span className="muted-text">{formatTs(inc.created_at)}</span>
                </div>
                <p className="incident-history-summary">{inc.summary}</p>
                <p className="muted-text">
                  {inc.location_label} • {inc.source_kind.toUpperCase()}
                  {inc.affected_members.length > 0
                    ? ` • ${inc.affected_members.map((m) => m.name).join(", ")}`
                    : ""}
                </p>
              </article>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
