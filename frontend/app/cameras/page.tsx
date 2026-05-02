"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  createCamera,
  createCameraSchedule,
  deleteCamera,
  deleteCameraSchedule,
  getCameraSchedules,
  getCameras,
  updateCamera,
} from "@/lib/api";
import type { Camera, CameraAlertSchedule } from "@/lib/types";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function ScheduleRow({ schedule, onDelete }: { schedule: CameraAlertSchedule; onDelete: () => void }) {
  return (
    <tr className="border-t border-[var(--line)]">
      <td className="py-1 pr-4 text-[var(--muted)]">{DAYS[schedule.day_of_week]}</td>
      <td className="py-1 pr-4">{schedule.start_time}</td>
      <td className="py-1 pr-4">{schedule.end_time}</td>
      <td className="py-1">
        <button
          className="px-2 py-0.5 rounded text-xs bg-[var(--rust)] text-black"
          onClick={onDelete}
        >
          Remove
        </button>
      </td>
    </tr>
  );
}

function AddScheduleForm({ onAdd }: { onAdd: (data: { day_of_week: number; start_time: string; end_time: string }) => Promise<void> }) {
  const [day, setDay] = useState(0);
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("18:00");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onAdd({ day_of_week: day, start_time: start, end_time: end });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="flex gap-2 mt-2 flex-wrap" onSubmit={handleSubmit}>
      <select
        aria-label="Day of week"
        className="bg-[var(--paper-3)] border border-[var(--line)] rounded px-2 py-1 text-sm text-[var(--ink)]"
        value={day}
        onChange={(e) => setDay(Number(e.target.value))}
      >
        {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
      </select>
      <input
        aria-label="Start time"
        className="bg-[var(--paper-3)] border border-[var(--line)] rounded px-2 py-1 text-sm text-[var(--ink)] w-24"
        type="time"
        value={start}
        onChange={(e) => setStart(e.target.value)}
      />
      <input
        aria-label="End time"
        className="bg-[var(--paper-3)] border border-[var(--line)] rounded px-2 py-1 text-sm text-[var(--ink)] w-24"
        type="time"
        value={end}
        onChange={(e) => setEnd(e.target.value)}
      />
      <button
        className="px-3 py-1 rounded text-sm bg-[var(--olive)] text-black disabled:opacity-50"
        disabled={saving}
        type="submit"
      >
        {saving ? "Adding..." : "Add"}
      </button>
    </form>
  );
}

function CameraCard({
  camera,
  onUpdate,
  onDelete,
}: {
  camera: Camera;
  onUpdate: (updated: Camera) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(camera.label);
  const [location, setLocation] = useState(camera.location_label);
  const [streamUrl, setStreamUrl] = useState(camera.stream_url ?? "");
  const [schedules, setSchedules] = useState<CameraAlertSchedule[]>([]);
  const [schedulesLoaded, setSchedulesLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadSchedules() {
    if (schedulesLoaded) return;
    const data = await getCameraSchedules(camera.id);
    setSchedules(data);
    setSchedulesLoaded(true);
  }

  async function handleExpand() {
    if (!expanded) await loadSchedules();
    setExpanded((v) => !v);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateCamera(camera.id, {
        label,
        location_label: location,
        stream_url: streamUrl || undefined,
      });
      onUpdate(updated);
      setEditing(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleEnabled() {
    const updated = await updateCamera(camera.id, { enabled: !camera.enabled });
    onUpdate(updated);
  }

  async function handleAddSchedule(data: { day_of_week: number; start_time: string; end_time: string }) {
    const schedule = await createCameraSchedule(camera.id, data);
    setSchedules((prev) => [...prev, schedule]);
  }

  async function handleDeleteSchedule(scheduleId: string) {
    await deleteCameraSchedule(camera.id, scheduleId);
    setSchedules((prev) => prev.filter((s) => s.id !== scheduleId));
  }

  return (
    <div className="bg-[var(--paper)] border border-[var(--line)] rounded-lg p-4 flex flex-col gap-3">
      {editing ? (
        <div className="flex flex-col gap-2">
          <input
            aria-label="Camera label"
            className="bg-[var(--paper-3)] border border-[var(--line)] rounded px-2 py-1 text-sm text-[var(--ink)]"
            placeholder="Label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <input
            aria-label="Location"
            className="bg-[var(--paper-3)] border border-[var(--line)] rounded px-2 py-1 text-sm text-[var(--ink)]"
            placeholder="Location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
          <input
            aria-label="Stream URL"
            className="bg-[var(--paper-3)] border border-[var(--line)] rounded px-2 py-1 text-sm text-[var(--ink)]"
            placeholder="Stream URL (optional)"
            value={streamUrl}
            onChange={(e) => setStreamUrl(e.target.value)}
          />
          {error ? <p className="text-[var(--rust)] text-xs">{error}</p> : null}
          <div className="flex gap-2">
            <button
              className="px-3 py-1 rounded text-sm bg-[var(--olive)] text-black disabled:opacity-50"
              disabled={saving}
              onClick={handleSave}
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              className="px-3 py-1 rounded text-sm bg-[var(--paper-2)] text-[var(--ink)]"
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold text-[var(--ink)]">{camera.label}</p>
            <p className="text-sm text-[var(--muted)]">{camera.location_label}</p>
            {camera.stream_url ? (
              <p className="text-xs text-[var(--muted)] truncate max-w-xs">{camera.stream_url}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              aria-label={camera.enabled ? "Disable camera" : "Enable camera"}
              className={`px-2 py-0.5 rounded text-xs font-medium ${camera.enabled ? "bg-[var(--olive)] text-black" : "bg-[var(--paper-2)] text-[var(--muted)]"}`}
              onClick={handleToggleEnabled}
            >
              {camera.enabled ? "Enabled" : "Disabled"}
            </button>
            <button
              className="px-2 py-0.5 rounded text-xs bg-[var(--paper-2)] text-[var(--ink)]"
              onClick={() => setEditing(true)}
            >
              Edit
            </button>
            <button
              className="px-2 py-0.5 rounded text-xs bg-[var(--rust)] text-black"
              onClick={onDelete}
            >
              Delete
            </button>
          </div>
        </div>
      )}

      <button
        className="text-xs text-[var(--blue)] text-left"
        onClick={handleExpand}
      >
        {expanded ? "▲ Hide schedules" : "▼ Alert schedules"}
      </button>

      {expanded ? (
        <div className="border-t border-[var(--line)] pt-3">
          {schedules.length > 0 ? (
            <table className="text-sm w-full">
              <thead>
                <tr className="text-[var(--muted)] text-xs">
                  <th className="text-left pb-1 pr-4">Day</th>
                  <th className="text-left pb-1 pr-4">Start</th>
                  <th className="text-left pb-1 pr-4">End</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {schedules.map((s) => (
                  <ScheduleRow
                    key={s.id}
                    schedule={s}
                    onDelete={() => handleDeleteSchedule(s.id)}
                  />
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-xs text-[var(--muted)]">No schedules yet.</p>
          )}
          <AddScheduleForm onAdd={handleAddSchedule} />
        </div>
      ) : null}
    </div>
  );
}

function AddCameraForm({ onAdd }: { onAdd: (camera: Camera) => void }) {
  const [label, setLabel] = useState("");
  const [location, setLocation] = useState("");
  const [streamUrl, setStreamUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!label || !location) return;
    setSaving(true);
    setError(null);
    try {
      const camera = await createCamera({ label, location_label: location, stream_url: streamUrl || undefined });
      onAdd(camera);
      setLabel("");
      setLocation("");
      setStreamUrl("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create camera");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="bg-[var(--paper)] border border-[var(--line)] rounded-lg p-4 flex flex-col gap-2" onSubmit={handleSubmit}>
      <p className="font-semibold text-[var(--ink)] mb-1">New Camera</p>
      <input
        aria-label="Camera label"
        className="bg-[var(--paper-3)] border border-[var(--line)] rounded px-2 py-1 text-sm text-[var(--ink)]"
        placeholder="Label *"
        required
        value={label}
        onChange={(e) => setLabel(e.target.value)}
      />
      <input
        aria-label="Location"
        className="bg-[var(--paper-3)] border border-[var(--line)] rounded px-2 py-1 text-sm text-[var(--ink)]"
        placeholder="Location *"
        required
        value={location}
        onChange={(e) => setLocation(e.target.value)}
      />
      <input
        aria-label="Stream URL"
        className="bg-[var(--paper-3)] border border-[var(--line)] rounded px-2 py-1 text-sm text-[var(--ink)]"
        placeholder="Stream URL (optional)"
        value={streamUrl}
        onChange={(e) => setStreamUrl(e.target.value)}
      />
      {error ? <p className="text-[var(--rust)] text-xs">{error}</p> : null}
      <button
        className="px-3 py-1 rounded text-sm bg-[var(--olive)] text-black disabled:opacity-50 self-start"
        disabled={saving}
        type="submit"
      >
        {saving ? "Adding..." : "Add Camera"}
      </button>
    </form>
  );
}

export default function CamerasPage() {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    getCameras()
      .then(setCameras)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load cameras"))
      .finally(() => setLoading(false));
  }, []);

  function handleUpdate(updated: Camera) {
    setCameras((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  }

  async function handleDelete(id: string) {
    await deleteCamera(id);
    setCameras((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--ink)] p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link className="text-sm text-[var(--blue)] hover:underline" href="/">
              ← Dashboard
            </Link>
            <h1 className="text-xl font-bold">CCTV Cameras</h1>
          </div>
          <button
            className="px-4 py-2 rounded bg-[var(--olive)] text-black text-sm font-medium"
            onClick={() => setShowAddForm((v) => !v)}
          >
            {showAddForm ? "Cancel" : "Add Camera"}
          </button>
        </div>

        {error ? <p className="text-[var(--rust)] mb-4">{error}</p> : null}

        {showAddForm ? (
          <div className="mb-6">
            <AddCameraForm
              onAdd={(camera) => {
                setCameras((prev) => [...prev, camera]);
                setShowAddForm(false);
              }}
            />
          </div>
        ) : null}

        {loading ? (
          <p className="text-[var(--muted)]">Loading cameras...</p>
        ) : cameras.length === 0 ? (
          <p className="text-[var(--muted)]">No cameras configured. Add one above.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {cameras.map((camera) => (
              <CameraCard
                key={camera.id}
                camera={camera}
                onDelete={() => handleDelete(camera.id)}
                onUpdate={handleUpdate}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
