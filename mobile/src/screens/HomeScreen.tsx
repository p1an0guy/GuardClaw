import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Battery from 'expo-battery';
import * as Location from 'expo-location';
import { SafeAreaView } from 'react-native-safe-area-context';

import ChatDock from '../components/ChatDock';
import FamilyMap from '../components/FamilyMap';
import QuickActions from '../components/QuickActions';
import StatusDashboard from '../components/StatusDashboard';
import { mockMembers, mockMessages } from '../data/mockData';
import {
  isSupabaseConfigured,
  SUPABASE_FAMILY_ID,
  SUPABASE_MEMBER_ID,
  SUPABASE_MEMBER_NAME,
  supabase,
  type SupabaseLocationRow,
  type SupabaseMemberRow,
  type SupabaseMessageRow,
} from '../lib/supabase';
import { colors } from '../theme';
import { type Coordinate, type FamilyMember, type FamilyMessage, MEMBER_STATUSES, type MemberStatus, type QuickActionId } from '../types';

type LocationState = 'requesting' | 'live' | 'denied' | 'unavailable';

const statusPriority: Record<MemberStatus, number> = {
  'Needs Help': 0,
  Moving: 1,
  Safe: 2,
  Home: 3,
  Offline: 4,
};

const quickActionCopy: Record<
  QuickActionId,
  {
    includeLocation?: boolean;
    status?: MemberStatus;
    text: string;
  }
> = {
  safe: {
    status: 'Safe',
    text: "I'm safe and checked in.",
  },
  'check-in': {
    includeLocation: true,
    status: 'Safe',
    text: 'Checking in with my current location.',
  },
  help: {
    includeLocation: true,
    status: 'Needs Help',
    text: 'I need help. Please check my location.',
  },
  'share-location': {
    includeLocation: true,
    text: 'Shared my current location.',
  },
};

const normalizeStatus = (status: string | null | undefined): MemberStatus => {
  const matched = MEMBER_STATUSES.find(
    (memberStatus) => memberStatus.toLowerCase() === status?.toLowerCase(),
  );

  return matched ?? 'Offline';
};

const rowToMember = (row: SupabaseMemberRow): FamilyMember => ({
  id: row.id,
  family_id: row.family_id,
  name: row.name,
  role: row.role === 'child' ? 'child' : 'guardian',
  status: normalizeStatus(row.status),
  battery: row.battery,
  lat: row.lat,
  lng: row.lng,
  updated_at: row.updated_at,
});

const rowToMessage = (row: SupabaseMessageRow): FamilyMessage => ({
  id: row.id,
  family_id: row.family_id,
  sender_name: row.sender_name,
  text: row.text,
  created_at: row.created_at,
});

const sortMembers = (members: FamilyMember[]) =>
  [...members].sort((a, b) => {
    const priorityDelta = statusPriority[a.status] - statusPriority[b.status];

    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });

const upsertMember = (members: FamilyMember[], member: FamilyMember) => {
  const exists = members.some((existing) => existing.id === member.id);
  const nextMembers = exists
    ? members.map((existing) => (existing.id === member.id ? member : existing))
    : [member, ...members];

  return sortMembers(nextMembers);
};

const upsertMessage = (messages: FamilyMessage[], message: FamilyMessage) => {
  const exists = messages.some((existing) => existing.id === message.id);
  const nextMessages = exists
    ? messages.map((existing) => (existing.id === message.id ? message : existing))
    : [...messages, message];

  return nextMessages
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .slice(-60);
};

export default function HomeScreen() {
  const [members, setMembers] = useState<FamilyMember[]>(() => isSupabaseConfigured ? [] : sortMembers(mockMembers));
  const [messages, setMessages] = useState<FamilyMessage[]>(isSupabaseConfigured ? [] : mockMessages);
  const [currentLocation, setCurrentLocation] = useState<Coordinate | null>(null);
  const [locationState, setLocationState] = useState<LocationState>('requesting');
  const [loadingBackend, setLoadingBackend] = useState(isSupabaseConfigured);
  const [notice, setNotice] = useState<string | null>(
    isSupabaseConfigured ? null : 'Demo mode. Add Supabase env vars to sync live family data.',
  );
  const [sending, setSending] = useState(false);
  const currentMemberIdRef = useRef<string | null>(SUPABASE_MEMBER_ID || mockMembers[0]?.id || null);
  const lastLocationPushRef = useRef(0);
  const batteryRef = useRef<number>(100);
  const currentLocationRef = useRef<Coordinate | null>(null);
  const membersRef = useRef<FamilyMember[]>(members);

  const currentMember = useMemo(() => {
    if (SUPABASE_MEMBER_ID) {
      return members.find((member) => member.id === SUPABASE_MEMBER_ID) ?? null;
    }

    return (
      members.find((member) => member.name.toLowerCase() === SUPABASE_MEMBER_NAME.toLowerCase()) ??
      members[0] ??
      null
    );
  }, [members]);

  useEffect(() => {
    membersRef.current = members;
    currentMemberIdRef.current = SUPABASE_MEMBER_ID || currentMember?.id || members[0]?.id || null;
  }, [currentMember?.id, members]);

  useEffect(() => {
    let sub: Battery.Subscription | null = null;
    let interval: ReturnType<typeof setInterval> | null = null;
    const init = async () => {
      const level = await Battery.getBatteryLevelAsync();
      batteryRef.current = Math.round(level * 100);
      sub = Battery.addBatteryLevelListener(({ batteryLevel }) => {
        batteryRef.current = Math.round(batteryLevel * 100);
      });
      // Push battery to Supabase immediately on startup
      if (supabase && isSupabaseConfigured && SUPABASE_MEMBER_ID) {
        supabase
          .from('members')
          .update({ battery: batteryRef.current, updated_at: new Date().toISOString() })
          .eq('id', SUPABASE_MEMBER_ID)
          .then();
      }
    };
    init();
    // Push battery + location every 30s regardless of movement
    if (supabase && isSupabaseConfigured && SUPABASE_MEMBER_ID) {
      const client = supabase;
      interval = setInterval(() => {
        const loc = currentLocationRef.current;
        client
          .from('members')
          .update({
            battery: batteryRef.current,
            updated_at: new Date().toISOString(),
            ...(loc && { lat: loc.latitude, lng: loc.longitude }),
          })
          .eq('id', SUPABASE_MEMBER_ID)
          .then();
      }, 30_000);
    }
    return () => { sub?.remove(); if (interval) clearInterval(interval); };
  }, []);

  const updateCurrentMemberLocally = useCallback((patch: Partial<FamilyMember>) => {
    const now = new Date().toISOString();
    const targetId = currentMemberIdRef.current;

    setMembers((previousMembers) => {
      let changed = false;
      const nextMembers = previousMembers.map((member, index) => {
        const isTarget = targetId ? member.id === targetId : index === 0;

        if (!isTarget) {
          return member;
        }

        changed = true;
        return {
          ...member,
          ...patch,
          updated_at: patch.updated_at ?? now,
        };
      });

      if (changed) {
        return sortMembers(nextMembers);
      }

      const newMember: FamilyMember = {
        id: SUPABASE_MEMBER_ID || `local-${Date.now()}`,
        family_id: SUPABASE_FAMILY_ID || 'local-family',
        name: SUPABASE_MEMBER_NAME,
        role: 'guardian',
        status: patch.status ?? 'Moving',
        battery: patch.battery ?? batteryRef.current,
        lat: patch.lat ?? null,
        lng: patch.lng ?? null,
        updated_at: patch.updated_at ?? now,
      };

      currentMemberIdRef.current = newMember.id;
      return sortMembers([newMember, ...previousMembers]);
    });
  }, []);

  const persistCurrentMember = useCallback(
    async (patch: Partial<Pick<SupabaseMemberRow, 'battery' | 'lat' | 'lng' | 'status'>>) => {
      const now = new Date().toISOString();
      const current = membersRef.current.find((member) => member.id === currentMemberIdRef.current);

      updateCurrentMemberLocally({
        battery: patch.battery ?? current?.battery,
        lat: patch.lat ?? current?.lat ?? null,
        lng: patch.lng ?? current?.lng ?? null,
        status: patch.status ? normalizeStatus(patch.status) : current?.status,
        updated_at: now,
      });

      const client = supabase;

      if (!client || !isSupabaseConfigured || !SUPABASE_FAMILY_ID) {
        return;
      }

      const basePayload = {
        family_id: SUPABASE_FAMILY_ID,
        name: current?.name || SUPABASE_MEMBER_NAME,
        status: patch.status ?? current?.status ?? 'Moving',
        battery: patch.battery ?? current?.battery ?? batteryRef.current,
        lat: patch.lat ?? current?.lat ?? null,
        lng: patch.lng ?? current?.lng ?? null,
        updated_at: now,
      };

      const targetId = currentMemberIdRef.current;

      const request = SUPABASE_MEMBER_ID
        ? client.from('members').upsert({ id: SUPABASE_MEMBER_ID, ...basePayload }).select().single()
        : targetId
          ? client
              .from('members')
              .update(basePayload)
              .eq('id', targetId)
              .eq('family_id', SUPABASE_FAMILY_ID)
              .select()
              .single()
          : client.from('members').insert(basePayload).select().single();

      const { data, error } = await request;

      if (error) {
        throw error;
      }

      if (data) {
        currentMemberIdRef.current = data.id;
        setMembers((previousMembers) => upsertMember(previousMembers, rowToMember(data)));
      }
    },
    [updateCurrentMemberLocally],
  );

  const persistLocationSnapshot = useCallback(async (coords: Location.LocationObjectCoords) => {
    const client = supabase;
    const memberId = currentMemberIdRef.current;

    if (!client || !isSupabaseConfigured || !SUPABASE_FAMILY_ID || !memberId) {
      return;
    }

    const payload: Omit<SupabaseLocationRow, 'id'> = {
      family_id: SUPABASE_FAMILY_ID,
      member_id: memberId,
      lat: coords.latitude,
      lng: coords.longitude,
      accuracy_meters: coords.accuracy ?? null,
      speed_mps: coords.speed && coords.speed > 0 ? coords.speed : null,
      observed_at: new Date().toISOString(),
    };

    const { error } = await client.from('member_locations').insert(payload);

    if (error) {
      throw error;
    }
  }, []);

  const handleLocationUpdate = useCallback(
    (coords: Location.LocationObjectCoords) => {
      const nextLocation = {
        latitude: coords.latitude,
        longitude: coords.longitude,
      };

      setCurrentLocation(nextLocation);
      currentLocationRef.current = nextLocation;

      const derivedStatus: MemberStatus | undefined =
        coords.speed != null
          ? coords.speed > 0.5
            ? 'Moving'
            : 'Safe'
          : undefined;

      updateCurrentMemberLocally({
        lat: nextLocation.latitude,
        lng: nextLocation.longitude,
        ...(derivedStatus && { status: derivedStatus }),
      });

      if (!isSupabaseConfigured) {
        return;
      }

      const now = Date.now();

      if (now - lastLocationPushRef.current < 5_000) {
        return;
      }

      lastLocationPushRef.current = now;
      persistCurrentMember({
        lat: nextLocation.latitude,
        lng: nextLocation.longitude,
        ...(derivedStatus && { status: derivedStatus }),
        battery: batteryRef.current,
      }).catch((error: Error) => {
        setNotice(`Location sync failed: ${error.message}`);
      });
      persistLocationSnapshot(coords).catch((error: Error) => {
        setNotice(`Movement sync failed: ${error.message}`);
      });
    },
    [persistCurrentMember, persistLocationSnapshot, updateCurrentMemberLocally],
  );

  const getFreshLocation = useCallback(async () => {
    const permission = await Location.requestForegroundPermissionsAsync();

    if (permission.status !== Location.PermissionStatus.GRANTED) {
      setLocationState('denied');
      throw new Error('Location permission was not granted.');
    }

    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    handleLocationUpdate(location.coords);

    return {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    };
  }, [handleLocationUpdate]);

  useEffect(() => {
    let active = true;
    let subscription: Location.LocationSubscription | null = null;

    const startLocation = async () => {
      try {
        setLocationState('requesting');
        const permission = await Location.requestForegroundPermissionsAsync();

        if (!active) {
          return;
        }

        if (permission.status !== Location.PermissionStatus.GRANTED) {
          setLocationState('denied');
          setNotice('Location permission is off. GuardClaw is showing the latest family pins.');
          return;
        }

        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        if (!active) {
          return;
        }

        handleLocationUpdate(location.coords);
        setLocationState('live');

        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            distanceInterval: 15,
            timeInterval: 10_000,
          },
          (nextLocation) => {
            handleLocationUpdate(nextLocation.coords);
          },
        );
      } catch (error) {
        if (!active) {
          return;
        }

        setLocationState('unavailable');
        setNotice(error instanceof Error ? error.message : 'Location is unavailable.');
      }
    };

    startLocation();

    return () => {
      active = false;
      subscription?.remove();
    };
  }, [handleLocationUpdate]);

  useEffect(() => {
    const client = supabase;

    if (!client || !isSupabaseConfigured || !SUPABASE_FAMILY_ID) {
      return;
    }

    let active = true;

    const loadInitialData = async () => {
      setLoadingBackend(true);

      const [memberResponse, messageResponse] = await Promise.all([
        client
          .from('members')
          .select('*')
          .eq('family_id', SUPABASE_FAMILY_ID)
          .order('updated_at', { ascending: false }),
        client
          .from('messages')
          .select('*')
          .eq('family_id', SUPABASE_FAMILY_ID)
          .order('created_at', { ascending: false })
          .limit(60),
      ]);

      if (!active) {
        return;
      }

      if (memberResponse.error || messageResponse.error) {
        const message = memberResponse.error?.message ?? messageResponse.error?.message;
        setNotice(`Supabase load failed: ${message}`);
        setLoadingBackend(false);
        return;
      }

      setMembers(sortMembers((memberResponse.data ?? []).map(rowToMember)));
      setMessages(
        (messageResponse.data ?? [])
          .map(rowToMessage)
          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
      );
      setNotice(null);
      setLoadingBackend(false);
    };

    loadInitialData();

    const memberChannel = client
      .channel(`members:${SUPABASE_FAMILY_ID}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'members', filter: `family_id=eq.${SUPABASE_FAMILY_ID}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const oldRow = payload.old as Partial<SupabaseMemberRow>;
            setMembers((previousMembers) => previousMembers.filter((member) => member.id !== oldRow.id));
            return;
          }

          const row = payload.new as SupabaseMemberRow;
          setMembers((previousMembers) => upsertMember(previousMembers, rowToMember(row)));
        },
      )
      .subscribe();

    const messageChannel = client
      .channel(`messages:${SUPABASE_FAMILY_ID}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `family_id=eq.${SUPABASE_FAMILY_ID}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const oldRow = payload.old as Partial<SupabaseMessageRow>;
            setMessages((previousMessages) =>
              previousMessages.filter((message) => message.id !== oldRow.id),
            );
            return;
          }

          const row = payload.new as SupabaseMessageRow;
          setMessages((previousMessages) => upsertMessage(previousMessages, rowToMessage(row)));
        },
      )
      .subscribe();

    return () => {
      active = false;
      client.removeChannel(memberChannel);
      client.removeChannel(messageChannel);
    };
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();

    if (!trimmed) {
      return;
    }

    setSending(true);

    try {
      const client = supabase;

      if (!client || !isSupabaseConfigured || !SUPABASE_FAMILY_ID) {
        setMessages((previousMessages) =>
          upsertMessage(previousMessages, {
            id: `local-message-${Date.now()}`,
            family_id: 'local-family',
            sender_name: SUPABASE_MEMBER_NAME,
            text: trimmed,
            created_at: new Date().toISOString(),
          }),
        );
        return;
      }

      const { data, error } = await client
        .from('messages')
        .insert({
          family_id: SUPABASE_FAMILY_ID,
          sender_name: SUPABASE_MEMBER_NAME,
          text: trimmed,
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      if (data) {
        setMessages((previousMessages) => upsertMessage(previousMessages, rowToMessage(data)));
      }
    } catch (error) {
      setNotice(error instanceof Error ? `Message failed: ${error.message}` : 'Message failed.');
    } finally {
      setSending(false);
    }
  }, []);

  const handleQuickAction = useCallback(
    async (action: QuickActionId) => {
      const config = quickActionCopy[action];

      try {
        let actionLocation = currentLocation;

        if (config.includeLocation && !actionLocation) {
          actionLocation = await getFreshLocation();
        }

        await persistCurrentMember({
          status: config.status,
          lat: actionLocation?.latitude,
          lng: actionLocation?.longitude,
        });
        await sendMessage(config.text);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'Quick action failed.');
      }
    },
    [currentLocation, getFreshLocation, persistCurrentMember, sendMessage],
  );

  const connectionLabel = isSupabaseConfigured ? 'Supabase live' : 'Demo data';
  const [activeTab, setActiveTab] = useState<'home' | 'chat'>('home');
  const [focusedMemberId, setFocusedMemberId] = useState<string | null>(null);

  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={8}
        style={styles.keyboardView}
      >
        <View style={styles.header}>
          <View style={styles.logoMark}>
            <Text style={styles.logoText}>GC</Text>
          </View>
          <View style={styles.headerCopy}>
            <Text style={styles.appName}>GuardClaw</Text>
            <Text style={styles.tagline}>Family safety at a glance</Text>
          </View>
          <View style={styles.connectionBadge}>
            <View style={[styles.connectionDot, isSupabaseConfigured && styles.connectionDotLive]} />
            <Text style={styles.connectionText}>{connectionLabel}</Text>
          </View>
        </View>

        {notice ? (
          <View style={styles.notice}>
            <Text numberOfLines={2} style={styles.noticeText}>
              {notice}
            </Text>
          </View>
        ) : null}

        <View style={styles.content}>
          {activeTab === 'home' ? (
            <>
              <FamilyMap
                currentLocation={currentLocation}
                focusedMemberId={focusedMemberId}
                locationState={locationState}
                members={members}
              />
              <StatusDashboard currentLocation={currentLocation} loading={loadingBackend} members={members} onMemberPress={setFocusedMemberId} />
              <QuickActions disabled={loadingBackend || sending} onAction={handleQuickAction} />
            </>
          ) : (
            <ChatDock
              currentSender={SUPABASE_MEMBER_NAME}
              disabled={loadingBackend}
              loading={loadingBackend}
              messages={messages}
              onQuickAction={handleQuickAction}
              onSendMessage={sendMessage}
              sending={sending}
            />
          )}
        </View>

        <View style={styles.tabBar}>
          <Pressable
            accessibilityRole="tab"
            onPress={() => setActiveTab('home')}
            style={[styles.tab, activeTab === 'home' && styles.tabActive]}
          >
            <Ionicons color={activeTab === 'home' ? colors.accent : colors.textMuted} name="map" size={22} />
            <Text style={[styles.tabLabel, activeTab === 'home' && styles.tabLabelActive]}>Home</Text>
          </Pressable>
          <Pressable
            accessibilityRole="tab"
            onPress={() => setActiveTab('chat')}
            style={[styles.tab, activeTab === 'chat' && styles.tabActive]}
          >
            <Ionicons color={activeTab === 'chat' ? colors.accent : colors.textMuted} name="chatbubbles" size={22} />
            <Text style={[styles.tabLabel, activeTab === 'chat' && styles.tabLabelActive]}>Chat</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.background,
    flex: 1,
  },
  keyboardView: {
    flex: 1,
    paddingBottom: 12,
    paddingHorizontal: 14,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    paddingBottom: 10,
    paddingTop: 6,
  },
  logoMark: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: 17,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  logoText: {
    color: colors.black,
    fontSize: 14,
    fontWeight: '900',
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  appName: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 0,
  },
  tagline: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  connectionBadge: {
    alignItems: 'center',
    backgroundColor: colors.panel,
    borderColor: colors.borderSoft,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  connectionDot: {
    backgroundColor: colors.warning,
    borderRadius: 99,
    height: 7,
    width: 7,
  },
  connectionDotLive: {
    backgroundColor: colors.success,
  },
  connectionText: {
    color: colors.textSoft,
    fontSize: 11,
    fontWeight: '800',
  },
  notice: {
    backgroundColor: colors.panelSoft,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  noticeText: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  content: {
    flex: 1,
    gap: 12,
  },
  tabBar: {
    borderTopColor: colors.borderSoft,
    borderTopWidth: 1,
    flexDirection: 'row',
    paddingBottom: 12,
    paddingTop: 8,
  },
  tab: {
    alignItems: 'center',
    flex: 1,
    gap: 2,
    paddingVertical: 4,
  },
  tabActive: {},
  tabLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  tabLabelActive: {
    color: colors.accent,
  },
});
