import React from 'react';
import { FlexWidget, ListWidget, TextWidget } from 'react-native-android-widget';
import type { InterventionCandidate } from '../models';
import { getWidgetIcon, getTimeBucketLabel, EFFORT_LABELS } from './iconMap';
import type { LiveMenuData } from './liveMenuService';

// Brand tokens — kept hard-coded here because the headless task runs in a
// fresh JS environment without the constants/theme module being guaranteed to
// hydrate. Mirroring src/constants/theme.ts keeps the widget visually in sync.
const COLOR_BG = '#F8F6FA';
const COLOR_SURFACE = '#FFFFFF';
const COLOR_PRIMARY = '#9B7BB8';
const COLOR_PRIMARY_FADED = '#E8E0F0';
const COLOR_TEXT_PRIMARY = '#2D2D3A';
const COLOR_TEXT_SECONDARY = '#6B6B7B';
const COLOR_TEXT_TERTIARY = '#9B9BAB';
const COLOR_BORDER_SOFT = '#EFEBF3';
const COLOR_ALT_BG = '#FBF9FC';

interface DopaMenuWidgetProps {
  data: LiveMenuData | null;
}

// All widget clicks route through this deep link so DopaMenu can resolve the
// intervention and use its shared launchOrShow() logic with the full
// intent/web/Play Store fallback chain. Avoids the OPEN_URI library bug where
// raw intent:// URIs don't resolve through Uri.parse + ACTION_VIEW.
function widgetLaunchUri(id: string, source: 'item' | 'header' = 'item'): string {
  return `dopamenu://widget-launch?id=${encodeURIComponent(id)}&source=${source}`;
}

function InterventionRow({
  intervention,
  isPrimary,
}: {
  intervention: InterventionCandidate;
  isPrimary: boolean;
}) {
  const icon = getWidgetIcon(intervention.icon);
  const effort = EFFORT_LABELS[intervention.requiredEffort] ?? '';

  return (
    <FlexWidget
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: isPrimary ? COLOR_PRIMARY_FADED : COLOR_ALT_BG,
        borderRadius: 16,
        borderWidth: isPrimary ? 1 : 0,
        borderColor: isPrimary ? COLOR_PRIMARY : COLOR_BORDER_SOFT,
        paddingHorizontal: 14,
        paddingVertical: 12,
        marginBottom: 8,
        width: 'match_parent',
      }}
      clickAction="OPEN_URI"
      clickActionData={{ uri: widgetLaunchUri(intervention.id) }}
    >
      <FlexWidget
        style={{
          width: isPrimary ? 40 : 36,
          height: isPrimary ? 40 : 36,
          borderRadius: 12,
          backgroundColor: isPrimary ? COLOR_SURFACE : COLOR_BG,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 12,
        }}
      >
        <TextWidget text={icon} style={{ fontSize: isPrimary ? 22 : 18 }} />
      </FlexWidget>
      <FlexWidget style={{ flex: 1, flexDirection: 'column' }}>
        <TextWidget
          text={intervention.label}
          maxLines={1}
          truncate="END"
          style={{
            fontSize: isPrimary ? 15 : 13,
            fontWeight: isPrimary ? '700' : '600',
            color: COLOR_TEXT_PRIMARY,
          }}
        />
        <TextWidget
          text={effort}
          maxLines={1}
          truncate="END"
          style={{
            fontSize: 11,
            color: isPrimary ? COLOR_TEXT_SECONDARY : COLOR_TEXT_TERTIARY,
            marginTop: 2,
          }}
        />
      </FlexWidget>
      <TextWidget
        text="›"
        style={{
          fontSize: 18,
          color: isPrimary ? COLOR_PRIMARY : COLOR_TEXT_TERTIARY,
          marginLeft: 8,
          fontWeight: '600',
        }}
      />
    </FlexWidget>
  );
}

function EmptyState() {
  return (
    <FlexWidget
      style={{
        flex: 1,
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 16,
        width: 'match_parent',
      }}
      clickAction="OPEN_APP"
    >
      <TextWidget text="✨" style={{ fontSize: 28, marginBottom: 4 }} />
      <TextWidget
        text="Open DopaMenu to get started"
        style={{
          fontSize: 13,
          color: COLOR_TEXT_SECONDARY,
          fontWeight: '500',
          textAlign: 'center',
        }}
      />
    </FlexWidget>
  );
}

export function DopaMenuWidget({ data }: DopaMenuWidgetProps) {
  return (
    <FlexWidget
      style={{
        flex: 1,
        flexDirection: 'column',
        backgroundColor: COLOR_BG,
        borderRadius: 22,
        padding: 14,
        width: 'match_parent',
        height: 'match_parent',
      }}
    >
      {/* Header: brand on the left, time bucket on the right. Whole row taps
          into the app so a header tap from anywhere opens DopaMenu. */}
      <FlexWidget
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 4,
          paddingBottom: 12,
          width: 'match_parent',
        }}
        clickAction="OPEN_APP"
      >
        <FlexWidget
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
        >
          <TextWidget
            text="DopaMenu"
            style={{
              fontSize: 14,
              fontWeight: 'bold',
              color: COLOR_PRIMARY,
              letterSpacing: 0.3,
            }}
          />
          <TextWidget
            text=" ›"
            style={{
              fontSize: 14,
              fontWeight: '600',
              color: COLOR_PRIMARY,
            }}
          />
        </FlexWidget>
        {data ? (
          <TextWidget
            text={getTimeBucketLabel(data.timeBucket)}
            style={{
              fontSize: 11,
              color: COLOR_TEXT_SECONDARY,
              fontWeight: '600',
            }}
          />
        ) : null}
      </FlexWidget>

      {/* Content */}
      {data ? (
        <FlexWidget
          style={{
            flex: 1,
            flexDirection: 'column',
            width: 'match_parent',
          }}
        >
          <ListWidget
            style={{
              width: 'match_parent',
              height: 'match_parent',
            }}
          >
            <InterventionRow intervention={data.primary} isPrimary />
            {data.alternatives.map((alt) => (
              <InterventionRow
                key={alt.id}
                intervention={alt}
                isPrimary={false}
              />
            ))}
          </ListWidget>
        </FlexWidget>
      ) : (
        <EmptyState />
      )}
    </FlexWidget>
  );
}
