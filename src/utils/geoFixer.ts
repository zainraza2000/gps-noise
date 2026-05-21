import { RoutePoint } from "../types";
import { haversineMeters } from "./geo";

const OSRM_MATCH = "https://router.project-osrm.org/match/v1/driving";
const OSRM_NEAREST = "https://router.project-osrm.org/nearest/v1/driving";
const DEFAULT_BIAS = 0.4;
const EARLY_SNAP_MAX = 5;
const MAX_TOUCHING_PAST = 5;
const TOUCH_DISTANCE_M = 25;


/*
==============================================================================================================================
-------------------------------------------------------------SNAPPING---------------------------------------------------------
==============================================================================================================================
*/

export async function snapPointsToRoad( points: RoutePoint[], ): Promise<RoutePoint[]> {

  if (points.length === 0) return points;
  if (points.length === 1) return [await snapPointNearest(points[0])];

  const coordStr = points.map((p) => `${p.lng},${p.lat}`).join(";");
  const timestamps = points
    .map((p) => Math.round(p.timestamp / 1000))
    .join(";");
  const radiuses = points
    .map((p) => Math.min(50, Math.max(10, p.accuracy ?? 25)))
    .join(";");
  const url = `${OSRM_MATCH}/${coordStr}` + `?overview=false&gaps=ignore&timestamps=${timestamps}&radiuses=${radiuses}`;

  const res = await fetch(url);
  if (!res.ok) return points;
  const json = await res.json();


  const tracepoints: Array<{ location?: [number, number] } | null> = json?.tracepoints ?? [];

  return points.map((point, i) => {
    const tp = tracepoints[i];
    const location = tp?.location;
    if (!location) return point;
    return { ...point, lng: location[0], lat: location[1] };
  });
}

async function snapPointNearest(point: RoutePoint): Promise<RoutePoint> {
  const url = `${OSRM_NEAREST}/${point.lng},${point.lat}?number=1`;
  const res = await fetch(url);
  if (!res.ok) return point;
  const json = await res.json();
  const location: [number, number] | undefined = json?.waypoints?.[0]?.location;
  if (!location) return point;
  return { ...point, lng: location[0], lat: location[1] };
}

async function snapIfFew(points: RoutePoint[]): Promise<RoutePoint[]> {
  if (points.length >= 1 && points.length <= EARLY_SNAP_MAX) {
    return snapPointsToRoad(points);
  }
  return points;
}

/*
==============================================================================================================================
-------------------------------------------------------------DELETION---------------------------------------------------------
==============================================================================================================================
*/

function removePointsTouchingManyPast(points: RoutePoint[]): RoutePoint[] {
  const result = [...points];
  for (let i = result.length - 1; i >= 0; i--) {
    if (countTouchingPast(result, i) > MAX_TOUCHING_PAST) {
      result.splice(i, 1);
    }
  }
  return result;
}

/*
==============================================================================================================================
-------------------------------------------------------------HYBRID---------------------------------------------------------
==============================================================================================================================
*/


export async function fixPastPoints( pastPoints: RoutePoint[], newPoint: RoutePoint): Promise<RoutePoint[]> {
  const newPoints = [...pastPoints, newPoint];
  if (newPoints.length < 7) {
    return newPoints;
  }

  for (let i = newPoints.length - 4; i >= newPoints.length - 5; i--) {
    if (i === newPoints.length - 4) {
        const start = Math.max(0, newPoints.length - 6);
        const window = newPoints.slice(start);
        const snapped = await snapPointsToRoad(window);
        for (let j = 0; j < snapped.length; j++) {
            newPoints[start + j] = snapped[j];
        }
    }else{
        newPoints[i] = averageOutPoints( newPoints[i - 1], newPoints[i], newPoints[i + 1] );
    }
    
  }
  
  return newPoints;
}

/*
==============================================================================================================================
-------------------------------------------------------------MATH---------------------------------------------------------
==============================================================================================================================
*/

export function averageOutPoints( lastpoint: RoutePoint, currentPoint: RoutePoint, nextPoint: RoutePoint): RoutePoint {
  if (turnAngleRad(lastpoint, currentPoint, nextPoint) > Math.PI / 6) {
    return currentPoint;
  }
  return {
    ...currentPoint,
    lat: (lastpoint.lat + currentPoint.lat + nextPoint.lat) / 3,
    lng: (lastpoint.lng + currentPoint.lng + nextPoint.lng) / 3,
  };
}

export function lerpAngle(currentAngle: number, lastAngle: number, bias: number) {
  let diff = ((lastAngle - currentAngle + Math.PI) % (2 * Math.PI)) - Math.PI;
  return currentAngle + diff * bias;
}

function calculateDistance(dy:number,dx:number){
  return Math.sqrt(dx * dx + dy * dy);
}

export function getNewPointWithBias(bias: number,currentPoint: RoutePoint,lastPoint: RoutePoint,pastPoint: RoutePoint){

  let newBias = bias;
  let dx1 = lastPoint.lng - pastPoint.lng;
  let dy1 = lastPoint.lat - pastPoint.lat;

  let dx2 = currentPoint.lng - lastPoint.lng;
  let dy2 = currentPoint.lat - lastPoint.lat;

  let lastAngle = Math.atan2(dy1, dx1);
  let currentAngle = Math.atan2(dy2, dx2);

  // let distance = Math.sqrt(dx2 * dx2 + dy2 * dy2);
  let distance = calculateDistance(dy2,dx2);
  
  if(Math.abs(lastAngle-currentAngle)>Math.PI/6){
    newBias = newBias-0.2
  }

  let futureAngle = lerpAngle(currentAngle, lastAngle, newBias);



  const newPoint = {
    ...currentPoint,
    lng: lastPoint.lng + distance * Math.cos(futureAngle),
    lat: lastPoint.lat + distance * Math.sin(futureAngle),
  };
  return newPoint
}

/*
==============================================================================================================================
-------------------------------------------------------------UTILS---------------------------------------------------------
==============================================================================================================================
*/


function turnAngleRad(prev: RoutePoint, curr: RoutePoint, next: RoutePoint): number {
  const bearing = (from: RoutePoint, to: RoutePoint) =>
    Math.atan2(to.lat - from.lat, to.lng - from.lng);
  let diff = bearing(curr, next) - bearing(prev, curr);
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return Math.abs(diff);
}

function pointsTouch(a: RoutePoint, b: RoutePoint): boolean {
  const threshold = Math.min(
    TOUCH_DISTANCE_M,
    Math.max(10, ((a.accuracy ?? 25) + (b.accuracy ?? 25)) / 2),
  );
  return haversineMeters(a, b) <= threshold;
}

function countTouchingPast(points: RoutePoint[], index: number): number {
  let count = 0;
  for (let j = 0; j < index; j++) {
    if (pointsTouch(points[index], points[j])) count++;
  }
  return count;
}

/*
==============================================================================================================================
-------------------------------------------------------------MAIN---------------------------------------------------------
==============================================================================================================================
*/

export async function fixPoints( recordingPoints: RoutePoint[], point: RoutePoint, bias = DEFAULT_BIAS, ): Promise<RoutePoint[]> {

  if (recordingPoints.length < 2) {
    return snapIfFew(
      removePointsTouchingManyPast([...recordingPoints, point]),
    );
  }

  const lastPoint = recordingPoints[recordingPoints.length - 1];
  const pastPoint = recordingPoints[recordingPoints.length - 2];

  const newPoint = getNewPointWithBias(bias, point, lastPoint, pastPoint);
  const newPoints = removePointsTouchingManyPast(await fixPastPoints(recordingPoints, newPoint));
  return snapIfFew(newPoints);
}