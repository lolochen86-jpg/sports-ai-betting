import type { League } from '@/types/sports';

export interface CityLocation {
  city: string;
  lat: number;
  lng: number;
  timezone: string;
}

export interface RestDaysInfo {
  restDays: number;
  travelDistanceKm: number;
  travelFatigueLevel: 'none' | 'mild' | 'heavy' | 'extreme';
  timezoneCrossed: number;
  description: string;
  specialNotes?: string;
}

// ─── MLB Team Cities & Coordinates Data ───
export const MLB_TEAM_CITIES: Record<string, CityLocation> = {
  ARI: { city: 'Phoenix', lat: 33.4484, lng: -112.0740, timezone: 'MST' },
  ATL: { city: 'Atlanta', lat: 33.7490, lng: -84.3880, timezone: 'EST' },
  BAL: { city: 'Baltimore', lat: 39.2904, lng: -76.6122, timezone: 'EST' },
  BOS: { city: 'Boston', lat: 42.3601, lng: -71.0589, timezone: 'EST' },
  CHC: { city: 'Chicago', lat: 41.8781, lng: -87.6298, timezone: 'CST' },
  CWS: { city: 'Chicago', lat: 41.8781, lng: -87.6298, timezone: 'CST' },
  CIN: { city: 'Cincinnati', lat: 39.1031, lng: -84.5120, timezone: 'EST' },
  CLE: { city: 'Cleveland', lat: 41.4993, lng: -81.6944, timezone: 'EST' },
  COL: { city: 'Denver', lat: 39.7392, lng: -104.9903, timezone: 'MST' },
  DET: { city: 'Detroit', lat: 42.3314, lng: -83.0458, timezone: 'EST' },
  HOU: { city: 'Houston', lat: 29.7604, lng: -95.3698, timezone: 'CST' },
  KC:  { city: 'Kansas City', lat: 39.0997, lng: -94.5786, timezone: 'CST' },
  LAA: { city: 'Anaheim', lat: 33.8366, lng: -117.9143, timezone: 'PST' },
  LAD: { city: 'Los Angeles', lat: 34.0522, lng: -118.2437, timezone: 'PST' },
  MIA: { city: 'Miami', lat: 25.7617, lng: -80.1918, timezone: 'EST' },
  MIL: { city: 'Milwaukee', lat: 43.0389, lng: -87.9065, timezone: 'CST' },
  MIN: { city: 'Minneapolis', lat: 44.9778, lng: -93.2650, timezone: 'CST' },
  NYM: { city: 'New York', lat: 40.7128, lng: -74.0060, timezone: 'EST' },
  NYY: { city: 'New York', lat: 40.7128, lng: -74.0060, timezone: 'EST' },
  ATH: { city: 'Oakland', lat: 37.8044, lng: -122.2712, timezone: 'PST' },
  OAK: { city: 'Oakland', lat: 37.8044, lng: -122.2712, timezone: 'PST' },
  PHI: { city: 'Philadelphia', lat: 39.9526, lng: -75.1652, timezone: 'EST' },
  PIT: { city: 'Pittsburgh', lat: 40.4406, lng: -79.9959, timezone: 'EST' },
  SD:  { city: 'San Diego', lat: 32.7157, lng: -117.1611, timezone: 'PST' },
  SF:  { city: 'San Francisco', lat: 37.7749, lng: -122.4194, timezone: 'PST' },
  SEA: { city: 'Seattle', lat: 47.6062, lng: -122.3321, timezone: 'PST' },
  STL: { city: 'St. Louis', lat: 38.6270, lng: -90.1994, timezone: 'CST' },
  TB:  { city: 'Tampa Bay', lat: 27.7676, lng: -82.6403, timezone: 'EST' },
  TEX: { city: 'Arlington', lat: 32.7357, lng: -97.1081, timezone: 'CST' },
  TOR: { city: 'Toronto', lat: 43.6532, lng: -79.3832, timezone: 'EST' },
  WSH: { city: 'Washington D.C.', lat: 38.9072, lng: -77.0369, timezone: 'EST' }
};

// ─── NBA Team Cities & Coordinates Data ───
export const NBA_TEAM_CITIES: Record<string, CityLocation> = {
  ATL: { city: 'Atlanta', lat: 33.7490, lng: -84.3880, timezone: 'EST' },
  BOS: { city: 'Boston', lat: 42.3601, lng: -71.0589, timezone: 'EST' },
  BKN: { city: 'Brooklyn', lat: 40.6782, lng: -73.9442, timezone: 'EST' },
  CHA: { city: 'Charlotte', lat: 35.2271, lng: -80.8431, timezone: 'EST' },
  CHI: { city: 'Chicago', lat: 41.8781, lng: -87.6298, timezone: 'CST' },
  CLE: { city: 'Cleveland', lat: 41.4993, lng: -81.6944, timezone: 'EST' },
  DAL: { city: 'Dallas', lat: 32.7767, lng: -96.7970, timezone: 'CST' },
  DEN: { city: 'Denver', lat: 39.7392, lng: -104.9903, timezone: 'MST' },
  DET: { city: 'Detroit', lat: 42.3314, lng: -83.0458, timezone: 'EST' },
  GSW: { city: 'San Francisco', lat: 37.7749, lng: -122.4194, timezone: 'PST' },
  HOU: { city: 'Houston', lat: 29.7604, lng: -95.3698, timezone: 'CST' },
  IND: { city: 'Indianapolis', lat: 39.7684, lng: -86.1581, timezone: 'EST' },
  LAC: { city: 'Los Angeles', lat: 34.0522, lng: -118.2437, timezone: 'PST' },
  LAL: { city: 'Los Angeles', lat: 34.0522, lng: -118.2437, timezone: 'PST' },
  MEM: { city: 'Memphis', lat: 35.1495, lng: -90.0490, timezone: 'CST' },
  MIA: { city: 'Miami', lat: 25.7617, lng: -80.1918, timezone: 'EST' },
  MIL: { city: 'Milwaukee', lat: 43.0389, lng: -87.9065, timezone: 'CST' },
  MIN: { city: 'Minneapolis', lat: 44.9778, lng: -93.2650, timezone: 'CST' },
  NOP: { city: 'New Orleans', lat: 29.9511, lng: -90.0715, timezone: 'CST' },
  NYK: { city: 'New York', lat: 40.7128, lng: -74.0060, timezone: 'EST' },
  OKC: { city: 'Oklahoma City', lat: 35.4676, lng: -97.5164, timezone: 'CST' },
  ORL: { city: 'Orlando', lat: 28.5383, lng: -81.3792, timezone: 'EST' },
  PHI: { city: 'Philadelphia', lat: 39.9526, lng: -75.1652, timezone: 'EST' },
  PHX: { city: 'Phoenix', lat: 33.4484, lng: -112.0740, timezone: 'MST' },
  POR: { city: 'Portland', lat: 45.5152, lng: -122.6784, timezone: 'PST' },
  SAC: { city: 'Sacramento', lat: 38.5816, lng: -121.4944, timezone: 'PST' },
  SAS: { city: 'San Antonio', lat: 29.4241, lng: -98.4936, timezone: 'CST' },
  TOR: { city: 'Toronto', lat: 43.6532, lng: -79.3832, timezone: 'EST' },
  UTA: { city: 'Salt Lake City', lat: 40.7608, lng: -111.8910, timezone: 'MST' },
  WAS: { city: 'Washington D.C.', lat: 38.9072, lng: -77.0369, timezone: 'EST' }
};

// Calculate Haversine distance between two sets of coordinates in km
function calculateHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Calculates travel distance, fatigue level, and timezone difference between home and away team cities.
 */
export function calculateRestAndTravel(
  fromTeamCode: string, 
  toTeamCode: string, 
  league: League,
  restDays: number = 1
): RestDaysInfo {
  const citiesMap = league === 'MLB' ? MLB_TEAM_CITIES : NBA_TEAM_CITIES;
  const fromCity = citiesMap[fromTeamCode?.toUpperCase()] || { city: 'Home', lat: 0, lng: 0, timezone: 'EST' };
  const toCity = citiesMap[toTeamCode?.toUpperCase()] || { city: 'Away', lat: 0, lng: 0, timezone: 'EST' };

  let distKm = 0;
  if (fromCity.lat !== 0 && toCity.lat !== 0) {
    distKm = calculateHaversineDistance(fromCity.lat, fromCity.lng, toCity.lat, toCity.lng);
  }

  // Calculate fatigue level
  let travelFatigueLevel: 'none' | 'mild' | 'heavy' | 'extreme' = 'none';
  if (distKm > 2800 || (distKm > 1800 && restDays === 0)) {
    travelFatigueLevel = 'extreme';
  } else if (distKm > 1600 || (distKm > 1000 && restDays === 0)) {
    travelFatigueLevel = 'heavy';
  } else if (distKm > 600 || restDays === 0) {
    travelFatigueLevel = 'mild';
  }

  const timezoneDiff = Math.abs(
    (fromCity.timezone === 'PST' ? 1 : fromCity.timezone === 'MST' ? 2 : fromCity.timezone === 'CST' ? 3 : 4) -
    (toCity.timezone === 'PST' ? 1 : toCity.timezone === 'MST' ? 2 : toCity.timezone === 'CST' ? 3 : 4)
  );

  let description = `休息 ${restDays} 天，移動距離 ${distKm} 公里。`;
  let specialNotes = undefined;

  if (travelFatigueLevel === 'extreme') {
    description = `🚌 長途跨區奔波 (${distKm} km) 且僅休 ${restDays} 天，體能大幅消耗！`;
    specialNotes = '✈️ 跨時區長途遠征，體能與時差雙重考驗';
  } else if (travelFatigueLevel === 'heavy') {
    description = `✈️ 移動距離達 ${distKm} 公里 (休 ${restDays} 天)，連戰面臨體能試煉。`;
    specialNotes = '🏃 移動距離較遠，末段防守強度恐有下滑';
  } else if (travelFatigueLevel === 'mild') {
    description = `🚗 中短程移動 (${distKm} km)，休 ${restDays} 天，體能處於常態範圍。`;
  } else {
    description = `🏠 近距離或主場作戰，體能充沛 (休 ${restDays} 天)。`;
  }

  return {
    restDays,
    travelDistanceKm: distKm,
    travelFatigueLevel,
    timezoneCrossed: timezoneDiff,
    description,
    specialNotes
  };
}
