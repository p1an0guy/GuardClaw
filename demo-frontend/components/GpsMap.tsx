"use client";

import { useEffect, useRef } from "react";
import type { LayerGroup, Map as LeafletMap } from "leaflet";

import type { HouseholdMember, SavedLocation } from "@/lib/types";

const CAL_POLY_CENTER: [number, number] = [35.3005, -120.6625];

function initialsFor(name: string): string {
  return name.split(" ").filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join("");
}

function statusColor(status: string): string {
  const map: Record<string, string> = {
    safe: "#34D399", home: "#60A5FA", away: "#60A5FA",
    moving: "#FBBF24", commuting: "#FBBF24", work: "#FBBF24",
    needs_help: "#F87171", offline: "#94A3B8",
  };
  return map[status.toLowerCase().replace(/\s+/g, "_")] ?? "#94A3B8";
}

function locationEmoji(label: string): string {
  const map: Record<string, string> = { home: "🏠", school: "🏫", work: "💼" };
  return map[label.toLowerCase()] ?? "📍";
}

function buildMemberPopup(
  member: HouseholdMember,
  onMarkLocation?: (memberId: string, label: string) => void,
): HTMLElement {
  const popup = document.createElement("div");
  popup.className = "gps-map-popup";

  const title = document.createElement("strong");
  title.textContent = member.name;
  popup.appendChild(title);

  const status = document.createElement("span");
  status.textContent = `${member.role} · ${member.status.replaceAll("_", " ")}`;
  popup.appendChild(status);

  if (member.location) {
    const source = document.createElement("span");
    source.textContent = `${member.location.label} · ${member.location.source.replaceAll("_", " ")}`;
    popup.appendChild(source);
  }

  if (onMarkLocation) {
    const row = document.createElement("div");
    row.className = "mark-location-menu";
    for (const label of ["home", "school", "work"]) {
      const btn = document.createElement("button");
      btn.textContent = `${locationEmoji(label)} ${label}`;
      btn.addEventListener("click", () => onMarkLocation(member.id, label));
      row.appendChild(btn);
    }
    popup.appendChild(row);
  }

  return popup;
}

interface GpsMapProps {
  members: HouseholdMember[];
  savedLocations?: SavedLocation[];
  focusedMemberId?: string | null;
  onMarkLocation?: (memberId: string, label: string) => void;
}

export function GpsMap({ members, savedLocations = [], focusedMemberId, onMarkLocation }: GpsMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerLayerRef = useRef<LayerGroup | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const initialFitDone = useRef(false);
  const locatedCount = members.filter((m) => m.location !== null).length;

  useEffect(() => {
    let cancelled = false;
    async function mountMap() {
      const L = await import("leaflet");
      if (cancelled || !mapContainerRef.current) return;
      leafletRef.current = L;
      const map = L.map(mapContainerRef.current, {
        attributionControl: true,
        scrollWheelZoom: false,
        zoomControl: false,
      }).setView(CAL_POLY_CENTER, 15);
      mapRef.current = map;
      L.control.zoom({ position: "bottomright" }).addTo(map);
      L.tileLayer("https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);
      markerLayerRef.current = L.layerGroup().addTo(map);
      window.setTimeout(() => map.invalidateSize(), 0);
    }
    mountMap();
    return () => {
      cancelled = true;
      markerLayerRef.current?.clearLayers();
      markerLayerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      leafletRef.current = null;
      initialFitDone.current = false;
    };
  }, []);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const markerLayer = markerLayerRef.current;
    if (!L || !map || !markerLayer) return;

    markerLayer.clearLayers();
    const bounds = L.latLngBounds([CAL_POLY_CENTER]);

    members.forEach((member) => {
      if (!member.location) return;
      const latLng: [number, number] = [member.location.latitude, member.location.longitude];
      bounds.extend(latLng);
      const color = statusColor(member.status);
      L.marker(latLng, {
        icon: L.divIcon({
          className: "member-avatar-marker-wrap",
          html: `<div class="member-avatar-marker" style="border-color:${color}"><span class="member-avatar-initials">${initialsFor(member.name) || "?"}</span><span class="member-avatar-status-dot" style="background:${color}"></span></div>`,
          iconSize: [42, 42],
          iconAnchor: [21, 21],
        }),
      })
        .bindPopup(buildMemberPopup(member, onMarkLocation))
        .addTo(markerLayer);
    });

    savedLocations.forEach((loc) => {
      const latLng: [number, number] = [loc.lat, loc.lng];
      bounds.extend(latLng);
      L.marker(latLng, {
        icon: L.divIcon({
          className: "saved-location-marker-wrap",
          html: `<div class="saved-location-marker">${locationEmoji(loc.label)}</div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        }),
      }).addTo(markerLayer);
      L.circle(latLng, {
        radius: 100,
        fillColor: "rgba(79, 209, 197, 0.1)",
        color: "rgba(79, 209, 197, 0.35)",
        weight: 1,
        fillOpacity: 1,
      }).addTo(markerLayer);
    });

    if ((locatedCount > 0 || savedLocations.length > 0) && !initialFitDone.current) {
      map.fitBounds(bounds.pad(0.22), { maxZoom: 15 });
      initialFitDone.current = true;
    }
  }, [members, savedLocations, locatedCount, onMarkLocation]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusedMemberId) return;
    const member = members.find((m) => m.id === focusedMemberId);
    if (member?.location) {
      map.flyTo([member.location.latitude, member.location.longitude], 16, { duration: 0.45 });
    }
  }, [focusedMemberId, members]);

  function handleRecenter() {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    const bounds = L.latLngBounds([CAL_POLY_CENTER]);
    members.forEach((m) => {
      if (m.location) bounds.extend([m.location.latitude, m.location.longitude]);
    });
    savedLocations.forEach((loc) => bounds.extend([loc.lat, loc.lng]));
    map.fitBounds(bounds.pad(0.22), { maxZoom: 15 });
  }

  return (
    <div className="gps-map">
      <div ref={mapContainerRef} aria-label="GPS map" className="gps-map-canvas" />
      <div className="gps-map-top-bar">
        <div className="gps-map-pill gps-map-pill-members">
          <span>👥</span>
          <span>{members.length} members</span>
        </div>
        <div className="gps-map-pill gps-map-pill-gps">
          <span className={`gps-map-pill-dot ${locatedCount > 0 ? "live" : ""}`} />
          <span>{locatedCount > 0 ? "Live GPS" : "Waiting"}</span>
        </div>
      </div>
      <button aria-label="Recenter map" className="gps-map-recenter" onClick={handleRecenter} type="button">◎</button>
    </div>
  );
}
