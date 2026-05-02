import React from 'react';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { DopaMenuWidget } from './DopaMenuWidget';
import { getWidgetMenuData } from './widgetDataService';

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED': {
      const data = await getWidgetMenuData();
      props.renderWidget(<DopaMenuWidget data={data} />);
      break;
    }
    case 'WIDGET_CLICK': {
      if (props.clickAction === 'REFRESH_WIDGET') {
        const data = await getWidgetMenuData();
        props.renderWidget(<DopaMenuWidget data={data} />);
      }
      break;
    }
    case 'WIDGET_DELETED':
      break;
  }
}
