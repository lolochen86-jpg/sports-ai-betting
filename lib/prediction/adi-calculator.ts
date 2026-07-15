/**
 * Air Density Index (ADI) & HR Factor Calculator
 * Ports the logic from feature_engineering.py calculate_adi function.
 */

export interface AdiCalculationResult {
  adi: number;
  hrFactor: number;
  isHotHighAltitude: boolean;
}

// Elevation lookup table for MLB stadiums (in feet)
export const MLB_ELEVATION_FT: Record<string, number> = {
  COL: 5200, // Denver (Coors Field)
  ARI: 1100, // Phoenix (Chase Field)
  ATL: 1000, // Atlanta (Truist Park)
  MIN: 850,  // Minneapolis (Target Field)
  KC: 850,   // Kansas City (Kauffman Stadium)
  TEX: 600,  // Arlington (Globe Life Field)
  STL: 450,  // St. Louis (Busch Stadium)
  MIL: 600,  // Milwaukee (American Family Field)
  CHI: 600,  // Chicago Cubs (Wrigley Field)
  CWS: 600,  // Chicago White Sox (Guaranteed Rate Field)
  CLE: 650,  // Cleveland (Progressive Field)
  CIN: 500,  // Cincinnati (Great American Ball Park)
  PIT: 750,  // Pittsburgh (PNC Park)
  DET: 600,  // Detroit (Comerica Park)
  TOR: 250,  // Toronto (Rogers Centre)
  BAL: 100,  // Baltimore (Oriole Park)
  PHI: 50,   // Philadelphia (Citizens Bank Park)
  NYY: 50,   // New York Yankees (Yankee Stadium)
  NYM: 50,   // New York Mets (Citi Field)
  BOS: 50,   // Boston (Fenway Park)
  WSH: 50,   // Washington (Nationals Park)
  TB: 10,    // Tampa Bay (Tropicana Field)
  MIA: 15,   // Miami (loanDepot park)
  HOU: 50,   // Houston (Minute Maid Park)
  LAA: 160,  // Los Angeles Angels (Angel Stadium)
  LAD: 270,  // Los Angeles Dodgers (Dodger Stadium)
  SD: 15,    // San Diego (Petco Park)
  SF: 10,    // San Francisco (Oracle Park)
  OAK: 40,   // Oakland (RingCentral Coliseum)
  SEA: 10,   // Seattle (T-Mobile Park)
};

/**
 * Calculate ADI and HR Factor
 * @param temperatureF Temperature in Fahrenheit (defaults to 72.0)
 * @param elevationFt Elevation in feet (defaults to 0)
 * @param humidityPct Relative humidity percentage (defaults to 50.0)
 */
export function calculateAdi(
  temperatureF: number = 72.0,
  elevationFt: number = 0,
  humidityPct: number = 50.0
): AdiCalculationResult {
  const tempC = ((temperatureF - 32.0) * 5.0) / 9.0;

  // Temperature factor: higher temp -> lower density -> lower ADI
  const tempFactor = Math.min(Math.max(1.0 - (tempC - 15.0) * 0.012, 0.75), 1.25);

  // Elevation factor: higher elevation -> thinner air -> lower ADI
  const altFactor = Math.min(Math.max(1.0 - elevationFt / 20000.0, 0.70), 1.05);

  // Humidity factor: higher humidity -> lower density -> lower ADI
  const humidityFactor = Math.min(Math.max(1.0 + (humidityPct - 50.0) * 0.002, 0.95), 1.10);

  const adi = 100.0 * tempFactor * altFactor * humidityFactor;

  // Rule 3: Hot Temperature and High Altitude boost HRs
  const isHotHighAltitude = temperatureF > 85.0 && elevationFt > 3000.0;
  const hrBoost = isHotHighAltitude ? 1.12 : 1.0;

  // Temperature linear adjustment
  const hrTempAdj = temperatureF > 85.0 ? 1.0 + (temperatureF - 85.0) * 0.004 : 1.0;

  // HR Factor clamp
  const hrFactor = Math.min(Math.max(hrBoost * hrTempAdj, 0.85), 1.35);

  return {
    adi,
    hrFactor,
    isHotHighAltitude,
  };
}
