# How geoFixer works

On each new GPS fix, `RouteRecorder` calls `fixPoints` to smooth the trail and snap it to roads via OSRM while recording, not after the drive. Fixes with accuracy worse than 9 m are skipped before anything runs.

### fixPoints

Runs on every new fix in a fixed order. The incoming point is adjusted first, then the tail of the route is cleaned up.

Stationary clutter is removed, and short routes get snapped to the road network through OSRM.

### getNewPointWithBias

Looks at the last two recorded points and the new GPS reading. It keeps how far you moved but blends the new direction toward where you were already heading.

Bias defaults to 0.4, so the heading is pulled partly toward the previous segment. On sharp turns the blend is reduced so corners are not smoothed away.

### fixPastPoints

Only runs when there are at least seven points. One point near the end is averaged with its neighbors if the turn is gentle.

The last six points are sent to OSRM map matching and written back so the newest part of the trail sits on the road.

### removePointsTouchingManyPast

When the car is slow or stopped, GPS keeps adding points in the same place. This walks backward and drops a point if more than five older ones are still within about 25 meters.

That clears stacked fixes without removing points that are actually spaced along the route.

### snapPointsToRoad

Points go to OSRM with timestamps and a search radius from GPS accuracy. While the route has five points or fewer, the full list is matched on every update.

Steady fix timing helps matching and the heading blend. If the request fails, coordinates stay as they were.

### Limits

Everything depends on the public OSRM server. Only the recent tail is re snapped as you drive, and corners can still cut because no extra points are added along bends.

### What would I do if I had more time

I would try to detect corners based on the previous nodes' angles and create extra points between them then snap them to the nearest node in order to fix the issue with the corners.
