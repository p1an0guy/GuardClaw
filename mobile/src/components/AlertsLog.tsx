import { Ionicons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme';
import type { AppNotification } from '../types';
import { formatRelativeTime } from '../utils/time';

type Props = {
  notifications: AppNotification[];
};

export default function AlertsLog({ notifications }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Alerts</Text>
        <Text style={styles.subtitle}>
          {notifications.length ? `${notifications.length} notifications` : 'No alerts yet'}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false} style={styles.scroll}>
        {notifications.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons color={colors.textMuted} name="notifications-off-outline" size={32} />
            <Text style={styles.emptyText}>No alerts received yet.</Text>
          </View>
        ) : (
          notifications.map((n) => (
            <View key={n.id} style={styles.card}>
              <View style={styles.iconWrap}>
                <Ionicons
                  color={n.target_role === 'guardian' ? colors.danger : colors.warning}
                  name={n.target_role === 'guardian' ? 'alert-circle' : 'warning'}
                  size={20}
                />
              </View>
              <View style={styles.cardContent}>
                <Text style={styles.cardTitle}>{n.title}</Text>
                <Text numberOfLines={3} style={styles.cardBody}>{n.body}</Text>
                <Text style={styles.cardTime}>{formatRelativeTime(n.created_at)}</Text>
              </View>
            </View>
          ))
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
    flex: 1,
    padding: 14,
  },
  header: {
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
  scroll: {
    flex: 1,
  },
  listContent: {
    gap: 9,
    paddingBottom: 10,
  },
  emptyState: {
    alignItems: 'center',
    borderColor: colors.borderSoft,
    borderRadius: 18,
    borderStyle: 'dashed',
    borderWidth: 1,
    gap: 8,
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  card: {
    backgroundColor: colors.panelSoft,
    borderColor: colors.borderSoft,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 12,
  },
  iconWrap: {
    marginTop: 2,
  },
  cardContent: {
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  cardBody: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  cardTime: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 5,
  },
});
