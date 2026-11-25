export const sources = {
  "CPCB-INDIA": { label: "Official CPCB readings", url: "https://app.cpcbccr.com/AQIIndia" },
  "CPCB-BULLETIN": { label: "CPCB daily bulletin", url: "https://cpcb.gov.in/AQI_Bulletin.php" },
  "OPEN-METEO-AIR": { label: "Open-Meteo · CAMS Global", url: "https://open-meteo.com/en/docs/air-quality-api" },
  "SAANS-DELHI-SAMPLE": { label: "Saans synthetic fixture", url: "/sources" },
  "AIRNOW-ACTIVITY": { label: "AirNow outdoor activity guidance", url: "https://document.airnow.gov/air-quality-and-outdoor-guidance-for-schools.pdf" },
  "EPA-HOME": { label: "EPA guide to home air cleaners", url: "https://www.epa.gov/indoor-air-quality-iaq/guide-air-cleaners-home" },
  "EPA-TRAVEL": { label: "EPA guide to passenger vehicle emissions", url: "https://www.epa.gov/greenvehicles/greenhouse-gas-emissions-typical-passenger-vehicle" },
} as const;

export type SourceId = keyof typeof sources;
