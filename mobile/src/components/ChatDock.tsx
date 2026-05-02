import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { colors } from '../theme';
import type { FamilyMessage, QuickActionId } from '../types';
import { formatMessageTime } from '../utils/time';
import QuickActions from './QuickActions';

type Props = {
  currentSender: string;
  disabled?: boolean;
  loading?: boolean;
  messages: FamilyMessage[];
  onQuickAction: (action: QuickActionId) => void;
  onSendMessage: (message: string) => Promise<void>;
  sending?: boolean;
};

export default function ChatDock({
  currentSender,
  disabled,
  loading,
  messages,
  onQuickAction,
  onSendMessage,
  sending,
}: Props) {
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, [messages.length]);

  const handleSend = async () => {
    const text = draft.trim();

    if (!text || sending || disabled) {
      return;
    }

    setDraft('');
    await onSendMessage(text);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>GuardClaw Chat</Text>
          <Text style={styles.subtitle}>{messages.length ? `${messages.length} messages` : 'No messages yet'}</Text>
        </View>
        {loading ? <ActivityIndicator color={colors.accent} size="small" /> : null}
      </View>

      <QuickActions disabled={disabled || sending} onAction={onQuickAction} />

      <ScrollView
        contentContainerStyle={styles.messageContent}
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        style={styles.messages}
      >
        {messages.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Family chat is quiet.</Text>
          </View>
        ) : (
          messages.map((message) => {
            const mine = message.sender_name === currentSender;

            return (
              <View
                key={message.id}
                style={[styles.messageRow, mine ? styles.messageRowMine : styles.messageRowTheirs]}
              >
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  <View style={styles.bubbleMeta}>
                    <Text style={[styles.sender, mine && styles.senderMine]}>{message.sender_name}</Text>
                    <Text style={[styles.time, mine && styles.timeMine]}>
                      {formatMessageTime(message.created_at)}
                    </Text>
                  </View>
                  <Text style={[styles.messageText, mine && styles.messageTextMine]}>{message.text}</Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <View style={styles.inputRow}>
        <TextInput
          editable={!disabled && !sending}
          onChangeText={setDraft}
          onSubmitEditing={handleSend}
          placeholder="Message family"
          placeholderTextColor={colors.textMuted}
          returnKeyType="send"
          style={styles.input}
          value={draft}
        />
        <Pressable
          accessibilityRole="button"
          disabled={!draft.trim() || disabled || sending}
          onPress={handleSend}
          style={({ pressed }) => [
            styles.sendButton,
            pressed && styles.sendButtonPressed,
            (!draft.trim() || disabled || sending) && styles.sendButtonDisabled,
          ]}
        >
          {sending ? (
            <ActivityIndicator color={colors.black} size="small" />
          ) : (
            <Ionicons color={colors.black} name="send" size={18} />
          )}
        </Pressable>
      </View>
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
    gap: 10,
    minHeight: 260,
    padding: 14,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
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
  messages: {
    flex: 1,
    minHeight: 76,
  },
  messageContent: {
    gap: 8,
    paddingBottom: 2,
  },
  emptyState: {
    alignItems: 'center',
    borderColor: colors.borderSoft,
    borderRadius: 16,
    borderStyle: 'dashed',
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 72,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  messageRow: {
    flexDirection: 'row',
  },
  messageRowMine: {
    justifyContent: 'flex-end',
  },
  messageRowTheirs: {
    justifyContent: 'flex-start',
  },
  bubble: {
    borderRadius: 16,
    maxWidth: '86%',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  bubbleMine: {
    backgroundColor: colors.accent,
  },
  bubbleTheirs: {
    backgroundColor: colors.panelRaised,
    borderColor: colors.borderSoft,
    borderWidth: 1,
  },
  bubbleMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 3,
  },
  sender: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '800',
  },
  senderMine: {
    color: colors.black,
  },
  time: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  timeMine: {
    color: '#164E47',
  },
  messageText: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 18,
  },
  messageTextMine: {
    color: colors.black,
    fontWeight: '600',
  },
  inputRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  input: {
    backgroundColor: colors.panelRaised,
    borderColor: colors.borderSoft,
    borderRadius: 16,
    borderWidth: 1,
    color: colors.text,
    flex: 1,
    fontSize: 14,
    minHeight: 46,
    paddingHorizontal: 14,
  },
  sendButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: 16,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  sendButtonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  sendButtonDisabled: {
    opacity: 0.38,
  },
});
