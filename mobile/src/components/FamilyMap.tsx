import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActionSheetIOS, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, type LatLng, type Region } from 'react-native-maps';

import { colors, shadow, statusTheme } from '../theme';
import type { Coordinate, FamilyMember, LocationLabel, SavedLocation } from '../types';
import { hasValidCoordinate } from '../utils/geo';

const DEFAULT_REGION: Region = {
  latitude: 37.7793,
  longitude: -122.4192,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#17202C' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#CBD5E1' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0B1118' }] },
  {
    featureType: 'administrative',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#334155' }],
  },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#94A3B8' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#10251E' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#263445' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#111827' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#334155' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#1E293B' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0B253A' }] },
];

type Props = {
  currentLocation: Coordinate | null;
  focusedCoordinate?: Coordinate | null;
  focusedMemberId?: string | null;
  isGuardian?: boolean;
  locationState: 'requesting' | 'live' | 'denied' | 'unavailable';
  members: FamilyMember[];
  onMarkLocation?: (memberId: string, label: LocationLabel) => void;
  savedLocations?: SavedLocation[];
};

const LOCATION_ICONS: Record<LocationLabel, keyof typeof Ionicons.glyphMap> = {
  home: 'home',
  school: 'school',
  work: 'briefcase',
};

const initialsFor = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

const regionForCoordinates = (coordinates: LatLng[]): Region => {
  if (coordinates.length === 0) {
    return DEFAULT_REGION;
  }

  if (coordinates.length === 1) {
    return {
      latitude: coordinates[0].latitude,
      longitude: coordinates[0].longitude,
      latitudeDelta: 0.035,
      longitudeDelta: 0.035,
    };
  }

  const latitudes = coordinates.map((coordinate) => coordinate.latitude);
  const longitudes = coordinates.map((coordinate) => coordinate.longitude);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * 1.5, 0.035),
    longitudeDelta: Math.max((maxLng - minLng) * 1.5, 0.035),
  };
};

export default function FamilyMap({ currentLocation, focusedCoordinate, focusedMemberId, isGuardian, locationState, members, onMarkLocation, savedLocations = [] }: Props) {
  const mapRef = useRef<MapView | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const memberCoordinates = useMemo(
    () =>
      members
        .filter((member) => hasValidCoordinate(member.lat, member.lng))
        .map((member) => ({
          id: member.id,
          member,
          coordinate: {
            latitude: member.lat ?? 0,
            longitude: member.lng ?? 0,
          },
        })),
    [members],
  );

  const visibleCoordinates = useMemo<LatLng[]>(() => {
    const coordinates = memberCoordinates.map((entry) => entry.coordinate);

    if (currentLocation) {
      coordinates.push(currentLocation);
    }

    return coordinates;
  }, [currentLocation, memberCoordinates]);

  const initialRegion = useMemo(() => regionForCoordinates(visibleCoordinates), []);

  const recenter = useCallback(() => {
    if (!mapRef.current) {
      return;
    }

    if (visibleCoordinates.length > 1) {
      mapRef.current.fitToCoordinates(visibleCoordinates, {
        animated: true,
        edgePadding: { bottom: 56, left: 44, right: 44, top: 58 },
      });
      return;
    }

    mapRef.current.animateToRegion(regionForCoordinates(visibleCoordinates), 450);
  }, [visibleCoordinates]);

  useEffect(() => {
    if (!mapReady || visibleCoordinates.length === 0) {
      return;
    }

    const timeout = setTimeout(recenter, 250);
    return () => clearTimeout(timeout);
  }, [mapReady, recenter, visibleCoordinates.length]);

  useEffect(() => {
    if (!mapReady || !focusedMemberId || !mapRef.current) return;
    const entry = memberCoordinates.find((m) => m.id === focusedMemberId);
    if (entry) {
      mapRef.current.animateToRegion({
        latitude: entry.coordinate.latitude,
        longitude: entry.coordinate.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 450);
    }
  }, [focusedMemberId, mapReady, memberCoordinates]);

  useEffect(() => {
    if (!mapReady || !focusedCoordinate || !mapRef.current) return;
    mapRef.current.animateToRegion({
      latitude: focusedCoordinate.latitude,
      longitude: focusedCoordinate.longitude,
      latitudeDelta: 0.005,
      longitudeDelta: 0.005,
    }, 450);
  }, [focusedCoordinate, mapReady]);

  const liveLabel =
    locationState === 'live'
      ? 'Live GPS'
      : locationState === 'requesting'
        ? 'Locating'
        : locationState === 'denied'
          ? 'GPS off'
          : 'GPS unavailable';

  return (
    <View style={styles.container}>
      <MapView
        customMapStyle={darkMapStyle}
        initialRegion={initialRegion}
        onMapReady={() => setMapReady(true)}
        ref={mapRef}
        showsCompass={false}
        showsMyLocationButton={false}
        showsUserLocation={locationState === 'live'}
        style={styles.map}
      >
        {memberCoordinates.map(({ coordinate, member }) => {
          const theme = statusTheme[member.status];

          return (
            <Marker coordinate={coordinate} key={member.id} title={member.name}>
              <View style={[styles.marker, { borderColor: theme.color }]}>
                <Text style={styles.markerText}>{initialsFor(member.name) || '?'}</Text>
                <View style={[styles.markerStatus, { backgroundColor: theme.color }]} />
              </View>
            </Marker>
          );
        })}
        {savedLocations.map((loc) => (
          <Marker
            coordinate={{ latitude: loc.lat, longitude: loc.lng }}
            key={loc.id}
            title={loc.label.charAt(0).toUpperCase() + loc.label.slice(1)}
          >
            <View style={styles.flagMarker}>
              <Ionicons color={colors.accent} name={LOCATION_ICONS[loc.label as LocationLabel] ?? 'flag'} size={18} />
            </View>
          </Marker>
        ))}
      </MapView>

      <View style={styles.mapTopBar}>
        <View style={styles.mapTitlePill}>
          <Ionicons color={colors.accent} name="people" size={15} />
          <Text style={styles.mapTitleText}>{members.length} members</Text>
        </View>
        <View style={styles.gpsPill}>
          <View style={[styles.gpsDot, locationState === 'live' && styles.gpsDotLive]} />
          <Text style={styles.gpsText}>{liveLabel}</Text>
        </View>
      </View>

      {isGuardian && onMarkLocation ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            const memberNames = members.map((m) => m.name);
            ActionSheetIOS.showActionSheetWithOptions(
              { options: ['Cancel', ...memberNames], cancelButtonIndex: 0, title: 'Mark location for' },
              (memberIdx) => {
                if (memberIdx === 0) return;
                const selectedMember = members[memberIdx - 1];
                ActionSheetIOS.showActionSheetWithOptions(
                  { options: ['Cancel', 'Home', 'School', 'Work'], cancelButtonIndex: 0, title: `Label for ${selectedMember.name}` },
                  (labelIdx) => { if (labelIdx > 0) onMarkLocation(selectedMember.id, (['home', 'school', 'work'] as LocationLabel[])[labelIdx - 1]); },
                );
              },
            );
          }}
          style={({ pressed }) => [styles.markButton, pressed && styles.recenterButtonPressed]}
        >
          <Ionicons color={colors.black} name="pin" size={20} />
        </Pressable>
      ) : null}

      <Pressable accessibilityRole="button" onPress={recenter} style={({ pressed }) => [styles.recenterButton, pressed && styles.recenterButtonPressed]}>
        <Ionicons color={colors.black} name="locate" size={20} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.panel,
    borderColor: colors.borderSoft,
    borderRadius: 26,
    borderWidth: 1,
    flex: 1.1,
    minHeight: 230,
    overflow: 'hidden',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  mapTopBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: 14,
    position: 'absolute',
    right: 14,
    top: 14,
  },
  mapTitlePill: {
    alignItems: 'center',
    backgroundColor: 'rgba(8, 11, 16, 0.82)',
    borderColor: 'rgba(79, 209, 197, 0.28)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  mapTitleText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  gpsPill: {
    alignItems: 'center',
    backgroundColor: 'rgba(8, 11, 16, 0.82)',
    borderColor: 'rgba(148, 163, 184, 0.24)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  gpsDot: {
    backgroundColor: colors.textMuted,
    borderRadius: 999,
    height: 7,
    width: 7,
  },
  gpsDotLive: {
    backgroundColor: colors.success,
  },
  gpsText: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: '800',
  },
  recenterButton: {
    ...shadow,
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: 18,
    bottom: 16,
    height: 48,
    justifyContent: 'center',
    position: 'absolute',
    right: 16,
    width: 48,
  },
  recenterButtonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
  markButton: {
    ...shadow,
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: 18,
    bottom: 16,
    height: 48,
    justifyContent: 'center',
    left: 16,
    position: 'absolute',
    width: 48,
  },
  flagMarker: {
    ...shadow,
    alignItems: 'center',
    backgroundColor: 'rgba(8, 11, 16, 0.9)',
    borderColor: colors.accent,
    borderRadius: 12,
    borderWidth: 1.5,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  marker: {
    ...shadow,
    alignItems: 'center',
    backgroundColor: colors.black,
    borderRadius: 18,
    borderWidth: 2,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  markerText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  markerStatus: {
    borderColor: colors.black,
    borderRadius: 99,
    borderWidth: 2,
    bottom: -1,
    height: 12,
    position: 'absolute',
    right: -1,
    width: 12,
  },
});
