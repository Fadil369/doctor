/**
 * BrainSAIT Health App - Root Entry Point
 *
 * Initializes:
 * - i18n (bilingual EN/AR)
 * - Navigation (tab-based)
 * - Global providers
 */

import '../src/i18n';
import React from 'react';
import { StatusBar, I18nManager } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useTranslation } from 'react-i18next';

import DashboardScreen from '../src/screens/DashboardScreen';
import SettingsScreen from '../src/screens/SettingsScreen';
import { Colors, Typography } from '../src/theme';

const Tab = createBottomTabNavigator();

function TabNavigator() {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';

  // Update global RTL layout when language changes
  React.useEffect(() => {
    I18nManager.allowRTL(true);
    if (isRTL && !I18nManager.isRTL) {
      I18nManager.forceRTL(true);
    } else if (!isRTL && I18nManager.isRTL) {
      I18nManager.forceRTL(false);
    }
  }, [isRTL]);

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarStyle: {
          backgroundColor: Colors.gradientStart,
          borderTopColor: Colors.glassBorder,
          height: 60,
        },
        tabBarActiveTintColor: Colors.accentTeal,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: {
          fontSize: Typography.fontSize.xs,
          fontWeight: Typography.fontWeight.medium,
        },
        headerStyle: {
          backgroundColor: Colors.gradientStart,
          borderBottomColor: Colors.glassBorder,
        },
        headerTintColor: Colors.textPrimary,
        headerTitleStyle: {
          fontWeight: Typography.fontWeight.semibold,
        },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          title: t('nav.dashboard'),
          tabBarIcon: ({ color, size }) => (
            <TabIcon emoji="🏠" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: t('settings.title'),
          tabBarIcon: ({ color, size }) => (
            <TabIcon emoji="⚙️" color={color} size={size} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

// Simple emoji icon component
function TabIcon({ emoji, size }: { emoji: string; color: string; size: number }) {
  const { Text } = require('react-native');
  return <Text style={{ fontSize: size - 4 }}>{emoji}</Text>;
}

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar barStyle="light-content" backgroundColor={Colors.gradientStart} />
      <TabNavigator />
    </NavigationContainer>
  );
}
