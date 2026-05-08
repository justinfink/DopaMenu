import React from 'react';
import { Platform } from 'react-native';
import { requestWidgetUpdate } from 'react-native-android-widget';
import { DopaMenuWidget } from './DopaMenuWidget';
import { getLiveMenuData } from './liveMenuService';

export async function refreshWidget(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await requestWidgetUpdate({
      widgetName: 'DopaMenuWidget',
      renderWidget: async () => {
        const data = await getLiveMenuData();
        return <DopaMenuWidget data={data} />;
      },
    });
  } catch {
    // Widget not placed or library not available — safe to ignore.
  }
}
