const TAU = Math.PI * 2;

function involuteAngle(baseRadius, radius) {
  const ratio = Math.min(1, baseRadius / Math.max(radius, 1e-6));
  const alpha = Math.acos(ratio);
  return Math.tan(alpha) - alpha;
}

function polar(r, a) {
  return { x: r * Math.cos(a), y: r * Math.sin(a) };
}

function ccwTangent(angle) {
  return { x: -Math.sin(angle), y: Math.cos(angle) };
}

// Rounds the corner where `dirIn`/`dirOut` (unit vectors pointing AWAY
// from `corner` along the incoming/outgoing edges) meet, with the given
// fillet radius. Returns the arc points (tangent-to-tangent), replacing
// the sharp corner.
function filletArc(corner, dirIn, dirOut, radius, segments) {
  const dot = Math.max(-1, Math.min(1, dirIn.x * dirOut.x + dirIn.y * dirOut.y));
  const theta = Math.acos(dot);
  if (theta < 1e-3 || theta > Math.PI - 1e-3 || radius <= 0) {
    return [corner];
  }
  const half = theta / 2;
  const tanLen = radius / Math.tan(half);
  const bisX = dirIn.x + dirOut.x;
  const bisY = dirIn.y + dirOut.y;
  const bisLen = Math.hypot(bisX, bisY) || 1;
  const centerDist = radius / Math.sin(half);
  const center = {
    x: corner.x + (bisX / bisLen) * centerDist,
    y: corner.y + (bisY / bisLen) * centerDist,
  };
  const tIn = { x: corner.x + dirIn.x * tanLen, y: corner.y + dirIn.y * tanLen };
  const tOut = { x: corner.x + dirOut.x * tanLen, y: corner.y + dirOut.y * tanLen };
  const a0 = Math.atan2(tIn.y - center.y, tIn.x - center.x);
  const a1raw = Math.atan2(tOut.y - center.y, tOut.x - center.x);
  let delta = a1raw - a0;
  while (delta <= -Math.PI) delta += TAU;
  while (delta > Math.PI) delta -= TAU;
  const pts = [tIn];
  for (let i = 1; i < segments; i++) {
    const a = a0 + (delta * i) / segments;
    pts.push({ x: center.x + radius * Math.cos(a), y: center.y + radius * Math.sin(a) });
  }
  pts.push(tOut);
  return pts;
}

export function computeGearStats(params) {
  const { module: m, teeth: N, pressureAngle, clearance, addendumFactor } = params;
  const pressureRad = (pressureAngle * Math.PI) / 180;
  const pitchRadius = (m * N) / 2;
  const baseRadius = pitchRadius * Math.cos(pressureRad);
  const outerRadius = pitchRadius + m * addendumFactor;
  const rootRadius = Math.max(pitchRadius - m * (addendumFactor + clearance), baseRadius * 0.05);
  return {
    pitchDiameter: pitchRadius * 2,
    baseDiameter: baseRadius * 2,
    outerDiameter: outerRadius * 2,
    rootDiameter: rootRadius * 2,
    circularPitch: Math.PI * m,
    pitchRadius,
    baseRadius,
    outerRadius,
    rootRadius,
  };
}

// Builds one closed CCW polygon (array of {x,y}) tracing the full gear
// outline: for each tooth, root arc -> (optional undercut) -> leading
// flank -> tip land -> trailing flank -> (optional undercut) -> root arc.
export function buildGearOutline(params) {
  const {
    module: m,
    teeth: N,
    pressureAngle,
    clearance,
    addendumFactor,
    backlash,
    filletRadius,
  } = params;

  const flankSegments = 10;
  const tipSegments = 4;
  const gapSegments = 8;
  const filletSegments = 5;

  const pressureRad = (pressureAngle * Math.PI) / 180;
  const Rp = (m * N) / 2;
  const Rb = Rp * Math.cos(pressureRad);
  const Ra = Rp + m * addendumFactor;
  const Rf = Math.max(Rp - m * (addendumFactor + clearance), Rb * 0.05);

  const invP = involuteAngle(Rb, Rp);
  const nominalHalfAngle = Math.PI / (2 * N);
  // Backlash is an absolute mm value; on a small enough module it could otherwise
  // remove more than the tooth's entire thickness and flip it inside out.
  const toothHalfAngle = Math.max(nominalHalfAngle * 0.1, nominalHalfAngle - backlash / (2 * Rp));
  const angleAt = (r) => toothHalfAngle - (involuteAngle(Rb, r) - invP);

  const hasUndercut = Rf < Rb;
  const flankStart = hasUndercut ? Rb : Rf;
  const phiRoot = angleAt(flankStart);

  // At low tooth counts / low pressure angles / large modules, the involute flanks
  // can converge to a point before reaching the nominal addendum circle and cross
  // over. Pull the tip in to wherever the tooth is still at least a hair wide,
  // same as real gear design caps the addendum in this regime.
  const tipEpsilon = 0.01;
  let effectiveRa = Ra;
  if (angleAt(effectiveRa) < tipEpsilon) {
    let lo = flankStart;
    let hi = Ra;
    for (let iter = 0; iter < 30; iter++) {
      const mid = (lo + hi) / 2;
      if (angleAt(mid) > tipEpsilon) lo = mid;
      else hi = mid;
    }
    effectiveRa = lo;
  }
  const phiTip = angleAt(effectiveRa);

  const angularPitch = TAU / N;
  // The fillet arc's tangent point travels along the gap edge, so it must not eat
  // more than a safe fraction of the gap's own arc length or it folds back on itself.
  const gapHalfArc = Rf * Math.max(0, angularPitch / 2 - phiRoot);
  const maxFillet = Math.max(0, Math.min(filletRadius, (Rb - Rf) * 0.9, m * 0.5, gapHalfArc * 0.8));

  const points = [];

  for (let k = 0; k < N; k++) {
    const center = k * angularPitch;

    // --- leading root corner ---
    if (hasUndercut) {
      const cornerAngle = center - phiRoot;
      const corner = polar(Rf, cornerAngle);
      if (maxFillet > 0) {
        const t = ccwTangent(cornerAngle);
        const dirIn = { x: -t.x, y: -t.y }; // back along incoming (CW) gap arc
        const dirOut = { x: Math.cos(cornerAngle), y: Math.sin(cornerAngle) }; // outward, toward Rb
        points.push(...filletArc(corner, dirIn, dirOut, maxFillet, filletSegments));
      } else {
        points.push(corner);
      }
      points.push(polar(Rb, cornerAngle));
    }

    // --- leading flank: flankStart -> effectiveRa ---
    for (let i = 1; i <= flankSegments; i++) {
      const r = flankStart + ((effectiveRa - flankStart) * i) / flankSegments;
      points.push(polar(r, center - angleAt(r)));
    }

    // --- tip land ---
    for (let i = 1; i < tipSegments; i++) {
      const a = -phiTip + (2 * phiTip * i) / tipSegments;
      points.push(polar(effectiveRa, center + a));
    }

    // --- trailing flank: effectiveRa -> flankStart ---
    for (let i = flankSegments; i >= 0; i--) {
      const r = flankStart + ((effectiveRa - flankStart) * i) / flankSegments;
      points.push(polar(r, center + angleAt(r)));
    }

    // --- trailing root corner ---
    if (hasUndercut) {
      const cornerAngle = center + phiRoot;
      const corner = polar(Rf, cornerAngle);
      if (maxFillet > 0) {
        const dirIn = { x: Math.cos(cornerAngle), y: Math.sin(cornerAngle) }; // back along incoming radial (toward Rb)
        const dirOut = ccwTangent(cornerAngle); // forward along outgoing gap arc
        points.push(...filletArc(corner, dirIn, dirOut, maxFillet, filletSegments));
      } else {
        points.push(corner);
      }
    }

    // --- gap arc to next tooth ---
    const gapStart = center + phiRoot;
    const gapEnd = center + angularPitch - phiRoot;
    for (let i = 1; i < gapSegments; i++) {
      const a = gapStart + ((gapEnd - gapStart) * i) / gapSegments;
      points.push(polar(Rf, a));
    }
  }

  return points;
}
