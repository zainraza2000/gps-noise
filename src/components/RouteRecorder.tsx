import { useEffect, useRef, useState } from 'react';
import { MapView } from './MapView';
import { useGeolocation, type GeoPosition } from '../hooks/useGeolocation';
import { startMockDrive, type MockDriveHandle } from '../utils/mockDrive';
import { totalDistanceMeters } from '../utils/geo';
import * as GeoFixer from '../utils/geoFixer'
import type { RoutePoint } from '../types';

export function RouteRecorder() {
  const [mockOn, setMockOn] = useState(false);
  const [mockPosition, setMockPosition] = useState<GeoPosition | null>(null);
  const mockHandleRef = useRef<MockDriveHandle | null>(null);

  const [recording, setRecording] = useState(false);
  const [recordingPoints, setRecordingPoints] = useState<RoutePoint[]>([]);

  const { position: gpsPosition, error, supported } = useGeolocation(true);

  const position = mockOn ? mockPosition : gpsPosition;

  useEffect(() => {
    if (!mockOn) {
      mockHandleRef.current?.stop();
      mockHandleRef.current = null;
      setMockPosition(null);
      return;
    }
    if (mockHandleRef.current) return;
    const origin = gpsPosition;
    if (!origin) return;
    mockHandleRef.current = startMockDrive(
      { lat: origin.lat, lng: origin.lng },
      (pos) => setMockPosition(pos),
    );
    return () => {
      mockHandleRef.current?.stop();
      mockHandleRef.current = null;
    };
    // origin is captured at activation; do not restart on every GPS tick
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mockOn]);

  // Each new position is pushed onto the recording verbatim — this is the
  // raw GPS stream. The point of the challenge is to do something smarter
  // here (or later in a post-processing step) so the line follows the road.

  useEffect(() => {
    if (!recording || !position) return;
    const point: RoutePoint = {
      lat: position.lat,
      lng: position.lng,
      timestamp: position.timestamp,
      accuracy: position.accuracy,
      speed: position.speed,
    };

    if(point.accuracy&&point.accuracy>9){
      return;
    }

    void (async () => {
      const newPoints = await GeoFixer.fixPoints(recordingPoints, point);
      setRecordingPoints(newPoints);
    })();
  }, [recording, position]);

  const handleToggleRecord = () => {
    if (recording) {
      setRecording(false);
    } else {
      setRecordingPoints([]);
      setRecording(true);
    }
  };

  const distanceMeters = totalDistanceMeters(recordingPoints);

  return (
    <div className="screen">
      <MapView
        routePoints={recordingPoints}
        livePosition={position}
        recording={recording}
      />

      <div className="topbar">
        <span className="title">GPS Noise Challenge</span>
        {recording && (
          <span className="rec-indicator">
            <span className="rec-dot" /> recording
          </span>
        )}
      </div>

      {!supported && !mockOn && (
        <div className="banner banner--err">
          Geolocation is not supported in this browser.
        </div>
      )}
      {error && !mockOn && (
        <div className="banner banner--err">GPS error: {error}</div>
      )}
      {!error && supported && !position && !mockOn && (
        <div className="banner">Acquiring GPS…</div>
      )}
      {mockOn && (
        <div className="banner">
          Mock drive on — 50 km/h with realistic noise.
        </div>
      )}

      <div className="bottom">
        {recording && (
          <div className="stats">
            <div className="stat">
              <div className="stat__value">{recordingPoints.length}</div>
              <div className="stat__label">points</div>
            </div>
            <div className="stat">
              <div className="stat__value">{formatDistance(distanceMeters)}</div>
              <div className="stat__label">distance</div>
            </div>
          </div>
        )}

        <button
          className={`btn ${mockOn ? 'btn--secondary-active' : 'btn--secondary'}`}
          onClick={() => setMockOn((on) => !on)}
          disabled={!gpsPosition && !mockOn}
        >
          {mockOn ? 'Stop mock drive' : 'Start mock drive'}
        </button>

        <button
          className={`btn ${recording ? 'btn--stop' : 'btn--rec'}`}
          onClick={handleToggleRecord}
          disabled={!position}
        >
          {recording ? 'Stop recording' : 'Start recording'}
        </button>
      </div>
    </div>
  );
}

function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(2)} km`;
}
