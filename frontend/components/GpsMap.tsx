"use client";

import { useEffect, useRef } from "react";
import type { LayerGroup, Map as LeafletMap } from "leaflet";

import type { HouseholdMember } from "@/lib/types";

const CAL_POLY_CENTER: [number, number] = [35.3005, -120.6625];

function formatLocationSource(source: string): string {
  return source.replaceAll("_", " ");
}

function buildMemberPopup(member: HouseholdMember): HTMLElement {
  const popup = document.createElement("div");
  popup.className = "gps-map-popup";

  const title = document.createElement("strong");
  title.textContent = member.name;
  popup.appendChild(title);

  const status = document.createElement("span");
  status.textContent = `${member.role} - ${member.status}`;
  popup.appendChild(status);

  if (member.location) {
    const source = document.createElement("span");
    source.textContent = `${member.location.label} - ${formatLocationSource(member.location.source)}`;
    popup.appendChild(source);

    if (member.location.accuracy_meters !== null) {
      const accuracy = document.createElement("span");
      accuracy.textContent = `Accuracy: ${Math.round(member.location.accuracy_meters)}m`;
      popup.appendChild(accuracy);
    }
  }

  return popup;
}

interface GpsMapProps {
  members: HouseholdMember[];
}

export function GpsMap({ members }: GpsMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerLayerRef = useRef<LayerGroup | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const initialFitDone = useRef(false);
  const locatedCount = members.filter((member) => member.location !== null).length;

  // Mount map once
  useEffect(() => {
    let cancelled = false;

    async function mountMap() {
      const L = await import("leaflet");
      if (cancelled || !mapContainerRef.current) {
        return;
      }
      leafletRef.current = L;

      const map = L.map(mapContainerRef.current, {
        attributionControl: true,
        scrollWheelZoom: false,
        zoomControl: false
      }).setView(CAL_POLY_CENTER, 15);

      mapRef.current = map;
      L.control.zoom({ position: "bottomright" }).addTo(map);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
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

  // Update markers when members change (without remounting the map)
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
      L.marker(latLng, {
        icon: L.divIcon({
          className: "member-map-marker",
          html: `<span class="member-map-dot status-${member.status.toLowerCase().replace(/\s+/g, "-")}"></span>`,
          iconAnchor: [10, 10],
          iconSize: [20, 20]
        })
      })
        .bindPopup(buildMemberPopup(member))
        .addTo(markerLayer);
    });

    if (locatedCount > 0 && !initialFitDone.current) {
      map.fitBounds(bounds.pad(0.22), { maxZoom: 15 });
      initialFitDone.current = true;
    }
  }, [members, locatedCount]);

  return (
    <div className="gps-map">
      <div ref={mapContainerRef} aria-label="GPS map centered on Cal Poly campus" className="gps-map-canvas" />
      <div className="gps-map-overlay">
        <p>GPS map</p>
        <h2>Cal Poly campus</h2>
        <span>{locatedCount > 0 ? `${locatedCount} household location dots from API` : "Waiting for mobile locations"}</span>
      </div>
      <div className="gps-map-legend" aria-label="Map legend">
        <span><i className="legend-dot status-safe" /> Safe</span>
        <span><i className="legend-dot status-home" /> Home</span>
        <span><i className="legend-dot status-moving" /> Moving</span>
        <span><i className="legend-dot status-needs_help" /> Needs Help</span>
        <span><i className="legend-dot status-offline" /> Offline</span>
      </div>
    </div>
  );
}
