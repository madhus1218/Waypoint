export type GeoPoint = {
  latitude: number;
  longitude: number;
  timestamp: string;
  filename?: string;
};

export type TripCluster = {
  points: GeoPoint[];
  latitude: number;
  longitude: number;
  startDate: string;
  endDate: string;
};

type DbscanOptions = {
  epsilonMiles?: number;
  minPoints?: number;
  maxTimeGapHours?: number;
};

const EARTH_RADIUS_MILES = 3958.8;

function degreesToRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

export function haversineDistanceMiles(
  firstPoint: GeoPoint,
  secondPoint: GeoPoint,
): number {
  const latitudeDifference = degreesToRadians(
    secondPoint.latitude - firstPoint.latitude,
  );

  const longitudeDifference = degreesToRadians(
    secondPoint.longitude - firstPoint.longitude,
  );

  const firstLatitude = degreesToRadians(firstPoint.latitude);
  const secondLatitude = degreesToRadians(secondPoint.latitude);

  const haversineValue =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(longitudeDifference / 2) ** 2;

  const angularDistance =
    2 *
    Math.atan2(
      Math.sqrt(haversineValue),
      Math.sqrt(1 - haversineValue),
    );

  return EARTH_RADIUS_MILES * angularDistance;
}

function findNearbyPointIndexes(
  points: GeoPoint[],
  pointIndex: number,
  epsilonMiles: number,
): number[] {
  return points
    .map((point, candidateIndex) => ({
      candidateIndex,
      distance: haversineDistanceMiles(
        points[pointIndex],
        point,
      ),
    }))
    .filter(({ distance }) => distance <= epsilonMiles)
    .map(({ candidateIndex }) => candidateIndex);
}

function runDbscan(
  points: GeoPoint[],
  epsilonMiles: number,
  minPoints: number,
): GeoPoint[][] {
  const UNVISITED = -2;
  const NOISE = -1;

  const labels = new Array<number>(points.length).fill(UNVISITED);
  let currentClusterId = 0;

  for (let pointIndex = 0; pointIndex < points.length; pointIndex += 1) {
    if (labels[pointIndex] !== UNVISITED) {
      continue;
    }

    const nearbyIndexes = findNearbyPointIndexes(
      points,
      pointIndex,
      epsilonMiles,
    );

    if (nearbyIndexes.length < minPoints) {
      labels[pointIndex] = NOISE;
      continue;
    }

    labels[pointIndex] = currentClusterId;

    const expansionQueue = [...nearbyIndexes];

    for (
      let queueIndex = 0;
      queueIndex < expansionQueue.length;
      queueIndex += 1
    ) {
      const nearbyPointIndex = expansionQueue[queueIndex];

      if (labels[nearbyPointIndex] === NOISE) {
        labels[nearbyPointIndex] = currentClusterId;
      }

      if (labels[nearbyPointIndex] !== UNVISITED) {
        continue;
      }

      labels[nearbyPointIndex] = currentClusterId;

      const secondLevelNeighbors = findNearbyPointIndexes(
        points,
        nearbyPointIndex,
        epsilonMiles,
      );

      if (secondLevelNeighbors.length >= minPoints) {
        for (const neighborIndex of secondLevelNeighbors) {
          if (!expansionQueue.includes(neighborIndex)) {
            expansionQueue.push(neighborIndex);
          }
        }
      }
    }

    currentClusterId += 1;
  }

  const clusters = new Map<number, GeoPoint[]>();

  labels.forEach((clusterId, pointIndex) => {
    if (clusterId === NOISE) {
      return;
    }

    const clusterPoints = clusters.get(clusterId) ?? [];
    clusterPoints.push(points[pointIndex]);
    clusters.set(clusterId, clusterPoints);
  });

  return Array.from(clusters.values());
}

function splitClusterByTime(
  points: GeoPoint[],
  maxTimeGapHours: number,
): GeoPoint[][] {
  const sortedPoints = [...points].sort(
    (firstPoint, secondPoint) =>
      new Date(firstPoint.timestamp).getTime() -
      new Date(secondPoint.timestamp).getTime(),
  );

  if (sortedPoints.length === 0) {
    return [];
  }

  const visits: GeoPoint[][] = [[sortedPoints[0]]];

  for (let index = 1; index < sortedPoints.length; index += 1) {
    const previousPoint = sortedPoints[index - 1];
    const currentPoint = sortedPoints[index];

    const timeDifferenceHours =
      (new Date(currentPoint.timestamp).getTime() -
        new Date(previousPoint.timestamp).getTime()) /
      (1000 * 60 * 60);

    if (timeDifferenceHours > maxTimeGapHours) {
      visits.push([currentPoint]);
    } else {
      visits[visits.length - 1].push(currentPoint);
    }
  }

  return visits;
}

function createTripCluster(points: GeoPoint[]): TripCluster {
  const sortedPoints = [...points].sort(
    (firstPoint, secondPoint) =>
      new Date(firstPoint.timestamp).getTime() -
      new Date(secondPoint.timestamp).getTime(),
  );

  const latitude =
    sortedPoints.reduce(
      (total, point) => total + point.latitude,
      0,
    ) / sortedPoints.length;

  const longitude =
    sortedPoints.reduce(
      (total, point) => total + point.longitude,
      0,
    ) / sortedPoints.length;

  return {
    points: sortedPoints,
    latitude,
    longitude,
    startDate: sortedPoints[0].timestamp,
    endDate: sortedPoints[sortedPoints.length - 1].timestamp,
  };
}

export function inferTripsWithDbscan(
  points: GeoPoint[],
  options: DbscanOptions = {},
): TripCluster[] {
  const {
    epsilonMiles = 50,
    minPoints = 2,
    maxTimeGapHours = 72,
  } = options;

  const validPoints = points.filter((point) => {
    const hasValidLatitude =
      Number.isFinite(point.latitude) &&
      point.latitude >= -90 &&
      point.latitude <= 90;

    const hasValidLongitude =
      Number.isFinite(point.longitude) &&
      point.longitude >= -180 &&
      point.longitude <= 180;

    const hasValidTimestamp = !Number.isNaN(
      new Date(point.timestamp).getTime(),
    );

    return (
      hasValidLatitude &&
      hasValidLongitude &&
      hasValidTimestamp
    );
  });

  const geographicClusters = runDbscan(
    validPoints,
    epsilonMiles,
    minPoints,
  );

  return geographicClusters
    .flatMap((cluster) =>
      splitClusterByTime(cluster, maxTimeGapHours),
    )
    .filter((visit) => visit.length >= minPoints)
    .map(createTripCluster)
    .sort(
      (firstTrip, secondTrip) =>
        new Date(firstTrip.startDate).getTime() -
        new Date(secondTrip.startDate).getTime(),
    );
}