import { BottomSheet, FieldHeader, SegmentedControl } from '../components/ui'

/**
 * Map/Field archetype — full-bleed map + bottom sheet + optional segmented nav.
 * Sets data-archetype="field" for high-contrast field tokens.
 */
export default function FieldMapLayout({
  title,
  subtitle,
  onBack,
  headerAction,
  map,
  sheetSnap = 'peek',
  onSheetSnapChange,
  sheetPeekHeight,
  sheetHeader,
  sheet,
  segmentOptions,
  segmentValue,
  onSegmentChange,
  segmentFixedBottom = true,
  mapOverlay,
  sheetBodyClassName = '',
  className = '',
}) {
  return (
    <div className={`layout-field-map ${className}`} data-archetype="field">
      {(title || onBack || headerAction) && (
        <div className="layout-field-map__header-slot">
          <FieldHeader
            title={title}
            subtitle={subtitle}
            onBack={onBack}
            action={headerAction}
          />
        </div>
      )}

      <div className="layout-field-map__map">
        {map}
        {mapOverlay}
      </div>

      {sheet != null && (
        <BottomSheet
          snap={sheetSnap}
          onSnapChange={onSheetSnapChange}
          peekHeight={sheetPeekHeight}
          header={sheetHeader}
          bodyClassName={sheetBodyClassName}
        >
          {sheet}
        </BottomSheet>
      )}

      {segmentOptions?.length > 0 && (
        <div className="layout-field-map__segment-slot">
          <SegmentedControl
            options={segmentOptions}
            value={segmentValue}
            onChange={onSegmentChange}
            fixedBottom={segmentFixedBottom}
          />
        </div>
      )}
    </div>
  )
}
