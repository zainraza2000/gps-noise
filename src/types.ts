export type RoutePoint = {
  lat: number;
  lng: number;
  timestamp: number;
  accuracy?: number;
  speed?: number | null;
};
