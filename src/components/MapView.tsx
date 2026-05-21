import { useEffect } from 'react';
import L, { type LatLngExpression } from 'leaflet';
import {
  CircleMarker,
  MapContainer,
  Polyline,
  TileLayer,
  useMap,
} from 'react-leaflet';
import type { RoutePoint } from '../types';

type LatLng = { lat: number; lng: number };

type Props = {
  routePoints: RoutePoint[];
  livePosition: LatLng | null;
  recording: boolean;
};

const DEFAULT_CENTER: LatLngExpression = [41.7151, 44.8271]; // Tbilisi
const DEFAULT_ZOOM = 17;

function FollowController({ target }: { target: LatLng | null }) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    map.setView([target.lat, target.lng], map.getZoom(), { animate: true });
  }, [target?.lat, target?.lng, map]);
  return null;
}

export function MapView({ routePoints, livePosition, recording }: Props) {
  const center: LatLngExpression = livePosition
    ? [livePosition.lat, livePosition.lng]
    : DEFAULT_CENTER;

  const lineColor = recording ? '#b91c1c' : '#1d4ed8';
  const dotColor = '#15803d';

  return (
    <MapContainer
      center={center}
      zoom={DEFAULT_ZOOM}
      className="map"
      zoomControl={false}
      attributionControl={false}
    >
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
        attribution="&copy; OpenStreetMap"
      />

      {routePoints.length >= 2 && (
        <Polyline
          positions={routePoints.map(
            (p) => [p.lat, p.lng] as [number, number],
          )}
          pathOptions={{
            color: lineColor,
            weight: 6,
            opacity: 0.9,
            lineCap: 'round',
            lineJoin: 'round',
          }}
        />
      )}

      {livePosition && (
        <>
          <CircleMarker
            center={[livePosition.lat, livePosition.lng]}
            radius={16}
            pathOptions={{
              color: dotColor,
              weight: 3,
              fillColor: dotColor,
              fillOpacity: 0.3,
            }}
          />
          <CircleMarker
            center={[livePosition.lat, livePosition.lng]}
            radius={8}
            pathOptions={{
              color: '#ffffff',
              weight: 3,
              fillColor: dotColor,
              fillOpacity: 1,
            }}
          />
        </>
      )}

      <FollowController target={livePosition} />
    </MapContainer>
  );
}

// Workaround: react-leaflet doesn't pull in Leaflet's default icon assets
// when bundled. We don't use Marker here, but referencing L silences the
// "L is unused" lint complaint and keeps the import for future expansion.
void L;
