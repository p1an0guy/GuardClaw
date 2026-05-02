import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, statusTheme } from '../theme';
import type { Coordinate, FamilyMember } from '../types';
import { distanceMiles, formatDistance, hasValidCoordinate } from '../utils/geo';
import { formatRelativeTime } from '../utils/time';

type Props = {
  currentLocation: Coordinate | null;
  loading?: boolean;
  members: FamilyMember[];
};

const initialsFor = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

export default function StatusDashboard({ currentLocation, loading, members }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Family Status</Text>
          <Text style={styles.subtitle}>{members.length ? `${members.length} members visible` : 'No members synced'}</Text>
        </View>
        {loading ? <ActivityIndicator color={colors.accent} size="small" /> : null}
      </View>

      <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        {members.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No family members yet</Text>
            <Text style={styles.emptyBody}>Add rows in Supabase or run in demo mode.</Text>
          </View>
        ) : (
          members.map((member) => {
            const theme = statusTheme[member.status];
            const hasLocation = hasValidCoordinate(member.lat, member.lng);
            const distance =
              currentLocation && hasLocation
                ? formatDistance(
                    distanceMiles(currentLocation, {
                      latitude: member.lat ?? 0,
                      longitude: member.lng ?? 0,
                    }),
                  )
                : 'location pending';

            return (
              <View key={member.id} style={styles.card}>
                <View style={[styles.avatar, { borderColor: theme.borderColor }]}>
                  <Text style={styles.avatarText}>{initialsFor(member.name) || '?'}</Text>
                </View>
                <View style={styles.memberInfo}>
                  <View style={styles.memberTopRow}>
                    <Text numberOfLines={1} style={styles.name}>
                      {member.name}
                    </Text>
                    <View
                      style={[
                        styles.statusBadge,
                        { backgroundColor: theme.backgroundColor, borderColor: theme.borderColor },
                      ]}
                    >
                      <View style={[styles.statusDot, { backgroundColor: theme.color }]} />
                      <Text style={[styles.statusText, { color: theme.color }]}>{member.status}</Text>
                    </View>
                  </View>
                  <View style={styles.metaRow}>
                    <View style={styles.metaItem}>
                      <Ionicons color={colors.textMuted} name="time-outline" size={13} />
                      <Text style={styles.metaText}>{formatRelativeTime(member.updated_at)}</Text>
                    </View>
                    <View style={styles.metaItem}>
                      <Ionicons color={colors.textMuted} name="battery-half-outline" size={14} />
                      <Text style={styles.metaText}>{member.battery}%</Text>
                    </View>
                    <View style={styles.metaItem}>
                      <Ionicons color={colors.textMuted} name="navigate-outline" size={13} />
                      <Text numberOfLines={1} style={styles.metaText}>
                        {distance}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.panel,
    borderColor: colors.borderSoft,
    borderRadius: 24,
    borderWidth: 1,
    flex: 0.78,
    minHeight: 164,
    padding: 14,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  listContent: {
    gap: 9,
    paddingBottom: 2,
  },
  card: {
    alignItems: 'center',
    backgroundColor: colors.panelSoft,
    borderColor: colors.borderSoft,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 11,
    minHeight: 72,
    padding: 10,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.panelRaised,
    borderRadius: 18,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  avatarText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  memberInfo: {
    flex: 1,
    minWidth: 0,
  },
  memberTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  name: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
  },
  statusBadge: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  statusDot: {
    borderRadius: 99,
    height: 6,
    width: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '900',
  },
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 8,
  },
  metaItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  metaText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  emptyState: {
    borderColor: colors.borderSoft,
    borderRadius: 18,
    borderStyle: 'dashed',
    borderWidth: 1,
    padding: 18,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptyBody: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
});
