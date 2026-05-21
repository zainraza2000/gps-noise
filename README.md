# GPS Noise Challenge

## What this challenge is about

Raw GPS is dirty. Every fix carries 4–30 m of error, so if you just draw a
line through the points as they arrive, you get a jagged, zigzagging mess
that wanders off the road, cuts through buildings, and jumps around even
when the car is sitting still.

**Your job is to fix that.** The recorded route should be drawn **smoothly**,
the way it looks in Google Maps, Uber, Bolt, or any other taxi/navigation
app: a clean line that hugs the road the car actually drove on, with no
zigzags, no GPS dirt, no random spikes.

The smoothing has to happen **live, while the car is still driving** — not
as a post-processing step after the trip ends.

## The setup

A minimal app with three controls:

- a **map**
- **Start mock drive** — simulates a car cruising at 50 km/h, emitting
  realistic noisy GPS fixes (4–30 m error, just like the real thing)
- **Start recording** — collects each incoming GPS fix and draws it on
  the map as a polyline

Run it, press *Start mock drive*, then *Start recording*. Within seconds
you'll see the problem: the red recorded line zigzags off the road,
because every sample is noisy and the app is drawing them straight onto
the map.

## What "good" looks like

- The recorded line follows the actual road, not the noisy fixes.
- No visible zigzags, jitter, or backwards jumps.
- The line grows smoothly as the car drives — like watching your trip
  build up in a taxi app.
- It still works with real GPS in the browser, not just the mock.

## Approaches you can take

Pick one or combine several — we care more about how you reason about
tradeoffs than which library you use:

1. **Reject bad samples.** Drop outliers, low-accuracy fixes, backwards
   jumps, impossible speeds.
2. **Smooth the trail.** Moving average, exponential smoothing, Kalman
   filter, etc.
3. **Snap to roads.** Use a road-snapping API (OSRM, Mapbox, Google,
   Graphhopper…) to project each fix onto the nearest road.
4. **Map-match the stream.** Match the noisy sequence of fixes against
   the underlying road graph in real time.

## Rules

- Keep the existing UI: map + *Start mock drive* + *Start recording*.
  Do not add new buttons or controls — the three existing ones are all
  the UI you get.
- The mock drive must keep emitting noisy fixes. **Do not turn down the
  noise constants** in `src/utils/mockDrive.ts` — that's cheating.
- Real GPS must still work. If you swap mock for browser geolocation,
  the recorder should behave the same way.
- The mock drive uses the public OSRM demo server
  (`router.project-osrm.org`). If it's rate-limited, wait a minute and
  retry — or swap it for any routing service you prefer.

## What we look at

- **Behavior.** Does the recorded polyline actually follow the road,
  smoothly, like a real navigation app?
- **Code quality.** Clean React/TS, sensible separation of concerns,
  no dead code.
- **Reasoning.** Be ready to explain your approach, its failure modes,
  and what you'd improve with more time.

## Getting started

```bash
npm install
npm run dev
```

Open the URL Vite prints (defaults to `http://localhost:5173`). On first
load the browser will ask for location permission — granting it lets you
see your real GPS, but you can ignore it and use *Start mock drive*
instead.

## Layout

```
src/
├── App.tsx                       # Mounts <RouteRecorder/>.
├── main.tsx                      # Vite/React entry.
├── styles.css                    # All UI styles.
├── types.ts                      # RoutePoint type.
├── hooks/
│   └── useGeolocation.ts         # navigator.geolocation.watchPosition wrapper.
├── utils/
│   ├── geo.ts                    # haversineMeters, bearingDeg, totalDistanceMeters.
│   └── mockDrive.ts              # The noisy mock GPS source. Read this.
└── components/
    ├── MapView.tsx               # Leaflet map + polyline + live dot.
    └── RouteRecorder.tsx         # Buttons, state, and the "append every fix" loop.
```

The hot spot is `RouteRecorder.tsx` — the `useEffect` that pushes every
incoming `position` straight into `recordingPoints` is what produces the
ugly line. That's where (or near where) your smoothing logic belongs.

Good luck — and have fun.
