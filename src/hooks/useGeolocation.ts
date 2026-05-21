import { useEffect, useRef, useState } from 'react';

export type GeoPosition = {
  lat: number;
  lng: number;
  accuracy: number;
  speed: number | null;
  heading: number | null;
  timestamp: number;
};

export type GeoState = {
  position: GeoPosition | null;
  error: string | null;
  supported: boolean;
};

const GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 1000,
  timeout: 15000,
};

export function useGeolocation(active: boolean): GeoState {
  const [position, setPosition] = useState<GeoPosition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);

  const supported =
    typeof navigator !== 'undefined' && 'geolocation' in navigator;

  useEffect(() => {
    if (!active || !supported) return;

    setError(null);
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          speed: pos.coords.speed,
          heading: pos.coords.heading,
          timestamp: pos.timestamp,
        });
      },
      (err) => {
        setError(err.message || 'Geolocation error');
      },
      GEO_OPTIONS,
    );
    watchIdRef.current = id;

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [active, supported]);

  return { position, error, supported };
}
