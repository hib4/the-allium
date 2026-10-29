/** Display targets describe the whole stage, including optional captions. */
export const displayProfiles = {
  responsive: { label: "Responsive · fill display", target: null },
  venue: {
    label: "Venue LED · 4416 × 896",
    target: { width: 4416, height: 896, ratio: "69:14" },
  },
  "venue-2424": {
    label: "Venue LED · 2424 × 896",
    target: { width: 2424, height: 896, ratio: "303:112" },
  },
} as const;
export type DisplayProfile = keyof typeof displayProfiles;
