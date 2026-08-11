export const PRESETS = [
  {
    name: 'Standard M2 · 20T',
    params: { module: 2, teeth: 20, pressureAngle: 20, thickness: 6, boreDiameter: 5, backlash: 0.1, filletRadius: 0.4 },
  },
  {
    name: 'Small Pinion M1 · 12T',
    params: { module: 1, teeth: 12, pressureAngle: 20, thickness: 4, boreDiameter: 3, backlash: 0.08, filletRadius: 0.2 },
  },
  {
    name: 'Large Gear M3 · 48T',
    params: { module: 3, teeth: 48, pressureAngle: 20, thickness: 10, boreDiameter: 8, backlash: 0.15, filletRadius: 0.6 },
  },
  {
    name: 'Fine Detail M0.8 · 30T',
    params: { module: 0.8, teeth: 30, pressureAngle: 20, thickness: 3, boreDiameter: 3, backlash: 0.05, filletRadius: 0.15 },
  },
];
