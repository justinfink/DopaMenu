import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import type { InterventionCandidate } from '../models';
import { getWidgetIcon, getTimeBucketIcon, getTimeBucketLabel, EFFORT_LABELS } from './iconMap';
import type { WidgetMenuData } from './widgetDataService';

interface DopaMenuWidgetProps {
  data: WidgetMenuData | null;
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

  const clickAction = intervention.launchAppPackage
    ? 'OPEN_URI'
    : 'OPEN_APP';
  const clickActionData = intervention.launchAppPackage
    ? { uri: `intent://#Intent;package=${intervention.launchAppPackage};end` }
    : {};

  return (
    <FlexWidget
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: isPrimary ? '#E8E0F0' : '#FFFFFF',
        borderRadius: 12,
        padding: 10,
        ...(isPrimary
          ? { borderWidth: 1, borderColor: '#9B7BB8' }
          : {}),
      }}
      clickAction={clickAction}
      clickActionData={clickActionData}
    >
      <TextWidget
        text={icon}
        style={{ fontSize: isPrimary ? 20 : 16, width: 28 }}
      />
      <FlexWidget style={{ flex: 1, flexDirection: 'column', paddingLeft: 8 }}>
        <TextWidget
          text={intervention.label}
          maxLines={1}
          truncate="END"
          style={{
            fontSize: isPrimary ? 14 : 13,
            fontWeight: isPrimary ? '600' : '400',
            color: '#2D2D3A',
          }}
        />
        {isPrimary && intervention.description ? (
          <TextWidget
            text={intervention.description}
            maxLines={1}
            truncate="END"
            style={{ fontSize: 11, color: '#6B6B7B' }}
          />
        ) : null}
      </FlexWidget>
      <TextWidget
        text={effort}
        style={{ fontSize: 11, color: '#9B9BAB', paddingLeft: 4 }}
      />
      <TextWidget
        text="›"
        style={{ fontSize: 16, color: '#9B9BAB', paddingLeft: 4 }}
      />
    </FlexWidget>
  );
}

function EmptyState() {
  return (
    <FlexWidget
      style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 16,
      }}
      clickAction="OPEN_APP"
    >
      <TextWidget
        text="✨"
        style={{ fontSize: 28 }}
      />
      <TextWidget
        text="Open DopaMenu to get started"
        style={{
          fontSize: 14,
          color: '#6B6B7B',
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
        flexDirection: 'column',
        backgroundColor: '#F8F6FA',
        borderRadius: 16,
        padding: 12,
        width: 'match_parent',
        height: 'match_parent',
      }}
    >
      {/* Header */}
      <FlexWidget
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingBottom: 8,
          width: 'match_parent',
        }}
      >
        <FlexWidget
          style={{ flex: 1 }}
          clickAction="OPEN_APP"
        >
          <TextWidget
            text="DopaMenu"
            style={{
              fontSize: 15,
              fontWeight: 'bold',
              color: '#9B7BB8',
            }}
          />
        </FlexWidget>
        {data ? (
          <TextWidget
            text={`${getTimeBucketIcon(data.timeBucket)} ${getTimeBucketLabel(data.timeBucket)}`}
            style={{ fontSize: 12, color: '#6B6B7B' }}
          />
        ) : null}
        <TextWidget
          text="  ↻"
          style={{ fontSize: 16, color: '#9B7BB8', paddingLeft: 8 }}
          clickAction="REFRESH_WIDGET"
        />
      </FlexWidget>

      {/* Content */}
      {data ? (
        <FlexWidget
          style={{
            flexDirection: 'column',
            flexGap: 6,
            flex: 1,
            width: 'match_parent',
          }}
        >
          <InterventionRow intervention={data.primary} isPrimary />
          {data.alternatives.map((alt, i) => (
            <InterventionRow key={`alt-${i}`} intervention={alt} isPrimary={false} />
          ))}
        </FlexWidget>
      ) : (
        <EmptyState />
      )}
    </FlexWidget>
  );
}
