import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme';
import type { QuickActionId } from '../types';

type IconName = ComponentProps<typeof Ionicons>['name'];

type Action = {
  id: QuickActionId;
  label: string;
  icon: IconName;
  color: string;
};

const actions: Action[] = [
  { id: 'safe', label: "I'm Safe", icon: 'shield-checkmark', color: colors.success },
  { id: 'help', label: 'Need Help', icon: 'alert-circle', color: colors.danger },
];

type Props = {
  disabled?: boolean;
  onAction: (action: QuickActionId) => void;
};

export default function QuickActions({ disabled, onAction }: Props) {
  return (
    <View style={styles.row}>
      {actions.map((action) => (
        <Pressable
          accessibilityRole="button"
          disabled={disabled}
          key={action.id}
          onPress={() => onAction(action.id)}
          style={({ pressed }) => [
            styles.button,
            { borderColor: `${action.color}55` },
            pressed && styles.buttonPressed,
            disabled && styles.buttonDisabled,
          ]}
        >
          <Ionicons color={action.color} name={action.icon} size={18} />
          <Text numberOfLines={1} style={styles.label}>
            {action.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  button: {
    alignItems: 'center',
    backgroundColor: colors.panelRaised,
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    gap: 4,
    minHeight: 58,
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  buttonPressed: {
    opacity: 0.76,
    transform: [{ scale: 0.98 }],
  },
  buttonDisabled: {
    opacity: 0.54,
  },
  label: {
    color: colors.textSoft,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
});
