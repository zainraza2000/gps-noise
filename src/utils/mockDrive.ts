import type { GeoPosition } from '../hooks/useGeolocation';
import { bearingDeg, haversineMeters } from './geo';

type LatLng = { lat: number; lng: number };

const HOP_DISTANCE_M = 900;
const REFILL_THRESHOLD_M = 250;

export type MockDriveHandle = {
  stop: () => void;
};

// Drives at a constant 50 km/h along OSRM-generated road geometry, then
// layers realistic GPS noise on top of the true position before emitting.
//
//   - Constant cruise at 50 km/h (~13.9 m/s) after a brief ramp-up.
//   - Gaussian position noise (σ ≈ 4 m, accuracy ≈ 7 m) on most fixes
//     plus ~5% urban-canyon outliers (σ = 16 m, accuracy = 30 m).
//   - ~1 Hz emit cadence with ±15% jitter — matches mobile watchPosition.
//
// The noise here is the whole point of the challenge: when you record the
// emitted stream as-is, the resulting polyline zigzags off the road. Your
// job is to clean it up.
const REAL_TICK_MS = 1000;
const REAL_TICK_JITTER_FRAC = 0.15;

const CRUISE_SPEED_MPS = 50_000 / 3600;
const ACCEL_MPS2 = 4;

const BASE_ACCURACY_M = 7;
const ACCURACY_JITTER_M = 4;
const BASE_NOISE_STDDEV_M = 4;

const OUTLIER_PROB = 0.05;
const OUTLIER_ACCURACY_M = 30;
const OUTLIER_NOISE_STDDEV_M = 16;

// Each new OSRM leg's destination is picked within ±FORWARD_CONE_DEG of
// the current heading, and legs that start with a U-turn are rejected.
// Keeps the simulated drive moving forward.
const FORWARD_CONE_DEG = 60;
const U_TURN_REJECT_DEG = 120;

export function startMockDrive(
  origin: LatLng,
  onTick: (pos: GeoPosition) => void,
): MockDriveHandle {
  let stopped = false;
  let path: LatLng[] = [{ lat: origin.lat, lng: origin.lng }];
  let cursor = 0;
  let segmentProgressM = 0;
  let fetching = false;
  let timer: number | null = null;

  let currentSpeed = 0;
  let lastTickAt = Date.now();

  const ensurePathAhead = async () => {
    if (fetching) return;
    const remaining = remainingDistance(path, cursor, segmentProgressM);
    if (cursor < path.length - 1 && remaining > REFILL_THRESHOLD_M) return;

    fetching = true;
    try {
      const here = path[path.length - 1];
      let bearing: number;
      if (path.length >= 2) {
        const prev = path[path.length - 2];
        const heading = bearingDeg(prev, here);
        bearing = heading + (Math.random() - 0.5) * 2 * FORWARD_CONE_DEG;
      } else {
        bearing = Math.random() * 360;
      }
      const dest = pointAt(here, HOP_DISTANCE_M, bearing);
      const leg = await fetchRoadPath(here, dest);
      if (stopped) return;
      if (leg.length >= 2) {
        const tail = leg.slice(1);
        if (path.length >= 2) {
          const prev = path[path.length - 2];
          const incoming = bearingDeg(prev, here);
          const outgoing = bearingDeg(here, tail[0]);
          let diff = Math.abs(outgoing - incoming);
          if (diff > 180) diff = 360 - diff;
          if (diff > U_TURN_REJECT_DEG) return;
        }
        path = path.concat(tail);
      }
    } catch {
      // swallow; will retry on next tick
    } finally {
      fetching = false;
    }
  };

  const tick = async () => {
    if (stopped) return;
    await ensurePathAhead();
    if (stopped) return;

    const now = Date.now();
    const dt = Math.max((now - lastTickAt) / 1000, 0.01);
    lastTickAt = now;

    const maxStep = ACCEL_MPS2 * dt;
    if (currentSpeed < CRUISE_SPEED_MPS) {
      currentSpeed = Math.min(CRUISE_SPEED_MPS, currentSpeed + maxStep);
    }

    const stepM = currentSpeed * dt;
    segmentProgressM += stepM;
    while (cursor < path.length - 1) {
      const segLen = haversineMeters(path[cursor], path[cursor + 1]);
      if (segmentProgressM < segLen) break;
      segmentProgressM -= segLen;
      cursor += 1;
    }

    let cleanLat: number;
    let cleanLng: number;
    let heading: number | null;
    if (cursor >= path.length - 1) {
      const here = path[path.length - 1];
      cleanLat = here.lat;
      cleanLng = here.lng;
      heading = null;
    } else {
      const a = path[cursor];
      const b = path[cursor + 1];
      const segLen = Math.max(haversineMeters(a, b), 0.001);
      const t = Math.min(segmentProgressM / segLen, 1);
      cleanLat = a.lat + (b.lat - a.lat) * t;
      cleanLng = a.lng + (b.lng - a.lng) * t;
      heading = currentSpeed > 0.5 ? bearingDeg(a, b) : null;
    }

    const isOutlier = Math.random() < OUTLIER_PROB;
    const noiseStd = isOutlier
      ? OUTLIER_NOISE_STDDEV_M
      : BASE_NOISE_STDDEV_M;
    const accuracy = isOutlier
      ? OUTLIER_ACCURACY_M
      : Math.max(
          2,
          BASE_ACCURACY_M + (Math.random() - 0.5) * 2 * ACCURACY_JITTER_M,
        );
    const noisy = addGaussianNoise(cleanLat, cleanLng, noiseStd);

    onTick({
      lat: noisy.lat,
      lng: noisy.lng,
      accuracy,
      speed: currentSpeed,
      heading,
      timestamp: now,
    });
  };

  const loop = () => {
    if (stopped) return;
    tick().finally(() => {
      if (stopped) return;
      const jitter =
        REAL_TICK_MS * REAL_TICK_JITTER_FRAC * (Math.random() - 0.5) * 2;
      timer = window.setTimeout(loop, REAL_TICK_MS + jitter);
    });
  };

  loop();

  return {
    stop: () => {
      stopped = true;
      if (timer != null) window.clearTimeout(timer);
    },
  };
}

function addGaussianNoise(lat: number, lng: number, stdDevM: number): LatLng {
  const u1 = Math.random() || 1e-9;
  const u2 = Math.random();
  const r = Math.sqrt(-2 * Math.log(u1));
  const z0 = r * Math.cos(2 * Math.PI * u2);
  const z1 = r * Math.sin(2 * Math.PI * u2);
  const latNoise = (z0 * stdDevM) / 111320;
  const lngNoise =
    (z1 * stdDevM) / (111320 * Math.cos((lat * Math.PI) / 180));
  return { lat: lat + latNoise, lng: lng + lngNoise };
}

function remainingDistance(
  path: LatLng[],
  cursor: number,
  progressOnSegmentM: number,
): number {
  if (cursor >= path.length - 1) return 0;
  const firstSegLen = haversineMeters(path[cursor], path[cursor + 1]);
  let total = Math.max(firstSegLen - progressOnSegmentM, 0);
  for (let i = cursor + 1; i < path.length - 1; i++) {
    total += haversineMeters(path[i], path[i + 1]);
  }
  return total;
}

async function fetchRoadPath(a: LatLng, b: LatLng): Promise<LatLng[]> {
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${a.lng},${a.lat};${b.lng},${b.lat}` +
    `?overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OSRM ${res.status}`);
  const json = await res.json();
  const coords: [number, number][] =
    json?.routes?.[0]?.geometry?.coordinates ?? [];
  return coords.map(([lng, lat]) => ({ lat, lng }));
}

function pointAt(
  origin: LatLng,
  distanceMeters: number,
  bearingDegrees: number,
): LatLng {
  const earthRadius = 6371000;
  const angDist = distanceMeters / earthRadius;
  const lat1 = (origin.lat * Math.PI) / 180;
  const lng1 = (origin.lng * Math.PI) / 180;
  const brng = (bearingDegrees * Math.PI) / 180;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angDist) +
      Math.cos(lat1) * Math.sin(angDist) * Math.cos(brng),
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(angDist) * Math.cos(lat1),
      Math.cos(angDist) - Math.sin(lat1) * Math.sin(lat2),
    );
  return { lat: (lat2 * 180) / Math.PI, lng: (lng2 * 180) / Math.PI };
}
