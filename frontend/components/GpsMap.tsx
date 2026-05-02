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
  const locatedCount = members.filter((member) => member.location !== null).length;

  useEffect(() => {
    let cancelled = false;

    async function mountMap() {
      const L = await import("leaflet");
      if (cancelled || !mapContainerRef.current) {
        return;
      }

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

      L.circle(CAL_POLY_CENTER, {
        radius: 320,
        color: "#497b8f",
        fillColor: "#7db8c5",
        fillOpacity: 0.08,
        opacity: 0.45,
        weight: 2
      }).addTo(map);

      L.marker(CAL_POLY_CENTER, {
        icon: L.divIcon({
          className: "campus-map-marker",
          html: '<span class="campus-map-dot"></span>',
          iconAnchor: [10, 10],
          iconSize: [20, 20]
        })
      })
        .bindTooltip("Cal Poly campus center", { direction: "top", offset: [0, -8] })
        .addTo(map);

      const markerLayer = L.layerGroup().addTo(map);
      const bounds = L.latLngBounds([CAL_POLY_CENTER]);
      members.forEach((member) => {
        if (!member.location) {
          return;
        }

        const latLng: [number, number] = [member.location.latitude, member.location.longitude];
        bounds.extend(latLng);
        L.marker(latLng, {
          icon: L.divIcon({
            className: "member-map-marker",
            html: `<span class="member-map-dot ${member.role === "child" ? "child" : "guardian"}"></span>`,
            iconAnchor: [10, 10],
            iconSize: [20, 20]
          })
        })
          .bindPopup(buildMemberPopup(member))
          .addTo(markerLayer);
      });
      markerLayerRef.current = markerLayer;

      if (locatedCount > 0) {
        map.fitBounds(bounds.pad(0.22), { maxZoom: 15 });
      }

      window.setTimeout(() => map.invalidateSize(), 0);
    }

    mountMap();

    return () => {
      cancelled = true;
      markerLayerRef.current?.clearLayers();
      markerLayerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [locatedCount, members]);

  return (
    <div className="gps-map">
      <div ref={mapContainerRef} aria-label="GPS map centered on Cal Poly campus" className="gps-map-canvas" />
      <div className="gps-map-overlay">
        <p>GPS map</p>
        <h2>Cal Poly campus</h2>
        <span>{locatedCount > 0 ? `${locatedCount} household location dots from API` : "Waiting for mobile locations"}</span>
      </div>
      <div className="gps-map-legend" aria-label="Map legend">
        <span><i className="legend-dot child" /> Child</span>
        <span><i className="legend-dot guardian" /> Guardian</span>
        <span><i className="legend-dot campus" /> Campus</span>
      </div>
    </div>
  );
}
