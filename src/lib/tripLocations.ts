export type LocationDetails = {
  title: string;
  city: string | null;
  country: string | null;
};

export function getLocationDetails(
  latitude: number,
  longitude: number
): LocationDetails {
  if (
    latitude >= 48 &&
    latitude <= 49.5 &&
    longitude >= 1.5 &&
    longitude <= 3
  ) {
    return {
      title: "Paris, France",
      city: "Paris",
      country: "France",
    };
  }

  if (
    latitude >= 48.5 &&
    latitude <= 50 &&
    longitude >= 5.5 &&
    longitude <= 7
  ) {
    return {
      title: "Metz, France",
      city: "Metz",
      country: "France",
    };
  }

  if (
    latitude >= 46.5 &&
    latitude <= 48 &&
    longitude >= 7.5 &&
    longitude <= 9.5
  ) {
    return {
      title: "Zurich, Switzerland",
      city: "Zurich",
      country: "Switzerland",
    };
  }

  return {
    title: "Unnamed Travel Stop",
    city: null,
    country: null,
  };
}