import React from 'react';
import { Platform } from 'react-native';
import { requestWidgetUpdate } from 'react-native-android-widget';
import { DopaMenuWidget } from './DopaMenuWidget';
import { getLiveMenuData, writeIosWidgetData } from './liveMenuService';

export async function refreshWidget(): Promise<void> {
  if (Platform.OS === 'android') {
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
    return;
  }
  if (Platform.OS === 'ios') {
    // iOS WidgetKit extension reads from App Group UserDefaults — JS
    // serializes the live menu there, then asks the native bridge to
    // reload the widget's timeline so the new data renders immediately.
    await writeIosWidgetData();
    return;
  }
}
