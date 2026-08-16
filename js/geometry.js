import * as THREE from 'three';
import { buildGearOutline, computeGearStats, ccwTangent } from './gear-math.js';

const TAU = Math.PI * 2;

export function buildGearGeometry(params) {
  const outline = buildGearOutline(params);
  const shape = new THREE.Shape(outline.map((p) => new THREE.Vector2(p.x, p.y)));

  if (params.boreType !== 'none' && params.boreDiameter > 0) {
    shape.holes.push(buildBorePath(params.boreType, params.boreDiameter / 2));
  }

  if (params.wheelStyle === 'spokes') {
    buildSpokeHoles(params).forEach((hole) => shape.holes.push(hole));
  }

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: params.thickness,
    bevelEnabled: false,
    curveSegments: 64,
  });
  geometry.translate(0, 0, -params.thickness / 2);
  geometry.computeVertexNormals();
  return geometry;
}

const BORE_SIDES = { circle: 0, square: 4, hex: 6 };

// `radius` is corner-to-corner (circumscribed) for polygon shapes, so a given
// bore diameter always fits inside a circle of that size, whatever the shape.
function buildBorePath(shape, radius) {
  const sides = BORE_SIDES[shape] ?? 0;
  const path = new THREE.Path();
  if (sides === 0) {
    path.absellipse(0, 0, radius, radius, 0, TAU, false, 0);
    return path;
  }
  const rotation = -Math.PI / 2;
  for (let i = 0; i <= sides; i++) {
    const a = rotation + (i / sides) * TAU;
    const x = radius * Math.cos(a);
    const y = radius * Math.sin(a);
    if (i === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  }
  return path;
}

// Cuts lightening holes between a solid hub (around the bore) and a solid rim
// (just inside the tooth root) so material isn't wasted on a fully solid web.
// Falls back to no cutouts (solid) if the gear is too small for the hub and
// rim to leave meaningful room for spokes, rather than producing degenerate
// geometry.
function buildSpokeHoles(params) {
  const stats = computeGearStats(params);
  const rootRadius = stats.rootRadius;
  const boreRadius = params.boreType !== 'none' ? params.boreDiameter / 2 : 0;

  const hubRadius = Math.max(rootRadius * 0.3, boreRadius + 2.5);
  const rimRadius = rootRadius - Math.max(2, rootRadius * 0.14);
  if (rimRadius - hubRadius < 3) return [];

  const spokeCount = Math.max(3, Math.round(params.spokeCount));
  const angularPitch = TAU / spokeCount;

  // Constant physical spoke width (not angular width) so spokes read as
  // straight bars rather than wedges that fatten toward the rim. Capped by
  // the tightest point (the hub, where circumference per spoke is smallest)
  // so gaps never invert at high spoke counts.
  const hubArcPerSpoke = hubRadius * angularPitch;
  const spokeWidth = Math.max(0.6, Math.min(6, hubArcPerSpoke * 0.6));
  const halfWidth = spokeWidth / 2;
  const filletRadius = Math.min(halfWidth * 0.8, 2.5);

  const arcSegments = 10;
  const filletSegments = 6;
  const holes = [];

  function edgePoint(centerAngle, radius, signedOffset) {
    const tangent = ccwTangent(centerAngle);
    return {
      x: radius * Math.cos(centerAngle) + tangent.x * signedOffset,
      y: radius * Math.sin(centerAngle) + tangent.y * signedOffset,
    };
  }

  for (let k = 0; k < spokeCount; k++) {
    const centerA = k * angularPitch;
    const centerB = centerA + angularPitch;

    // Fillet the corner where spoke k's trailing edge meets the hub (outside
    // tangency: the gap is outside the hub circle) and the rim (inside
    // tangency: the gap is inside the rim circle) — and mirror for spoke
    // k+1's leading edge.
    const hubA = lineCircleFillet(centerA, halfWidth, hubRadius, filletRadius, false);
    const rimA = lineCircleFillet(centerA, halfWidth, rimRadius, filletRadius, true);
    const rimB = lineCircleFillet(centerB, -halfWidth, rimRadius, filletRadius, true);
    const hubB = lineCircleFillet(centerB, -halfWidth, hubRadius, filletRadius, false);

    const points = [];
    points.push(...arcBetween(hubA.center, hubA.tCircle, hubA.tLine, filletRadius, filletSegments));
    points.push(...arcBetween(rimA.center, rimA.tLine, rimA.tCircle, filletRadius, filletSegments));
    points.push(...arcBetween({ x: 0, y: 0 }, rimA.tCircle, rimB.tCircle, rimRadius, arcSegments));
    points.push(...arcBetween(rimB.center, rimB.tCircle, rimB.tLine, filletRadius, filletSegments));
    points.push(...arcBetween(hubB.center, hubB.tLine, hubB.tCircle, filletRadius, filletSegments));
    points.push(...arcBetween({ x: 0, y: 0 }, hubB.tCircle, hubA.tCircle, hubRadius, arcSegments));

    const path = new THREE.Path();
    points.forEach((p, i) => (i === 0 ? path.moveTo(p.x, p.y) : path.lineTo(p.x, p.y)));
    path.closePath();
    holes.push(path);
  }
  return holes;
}

// A fillet of radius `filletRadius` tangent to both a straight spoke edge
// (a line parallel to the spoke's own radial centerline, offset from it by
// `signedOffset`) and a circle of radius `circleRadius` centered at the
// origin. `internal` selects which side of the circle the fillet sits on:
// true = inside it (the rim, where the gap is the inner region), false =
// outside it (the hub, where the gap is the outer region). Unlike a
// line-line fillet, this accounts for the circle's actual curvature instead
// of approximating it as a tangent line.
function lineCircleFillet(centerAngle, signedOffset, circleRadius, filletRadius, internal) {
  const gapSign = Math.sign(signedOffset) || 1;
  const centerDist = internal ? circleRadius - filletRadius : circleRadius + filletRadius;
  const v = signedOffset + gapSign * filletRadius;
  const u = Math.sqrt(Math.max(0, centerDist * centerDist - v * v));

  const uAxis = { x: Math.cos(centerAngle), y: Math.sin(centerAngle) };
  const vAxis = ccwTangent(centerAngle);
  const center = { x: u * uAxis.x + v * vAxis.x, y: u * uAxis.y + v * vAxis.y };
  const tLine = { x: u * uAxis.x + signedOffset * vAxis.x, y: u * uAxis.y + signedOffset * vAxis.y };
  const scale = circleRadius / centerDist;
  const tCircle = { x: center.x * scale, y: center.y * scale };
  return { center, tLine, tCircle };
}

// Arc from `from` to `to` (both assumed to lie on a circle of `radius`
// around `center`), always sweeping the short way.
function arcBetween(center, from, to, radius, segments) {
  const a0 = Math.atan2(from.y - center.y, from.x - center.x);
  const a1 = Math.atan2(to.y - center.y, to.x - center.x);
  const delta = shortAngleDelta(a0, a1);
  const pts = [from];
  for (let i = 1; i < segments; i++) {
    const a = a0 + (delta * i) / segments;
    pts.push({ x: center.x + radius * Math.cos(a), y: center.y + radius * Math.sin(a) });
  }
  pts.push(to);
  return pts;
}

// atan2 wraps to (-pi, pi], so a raw `to - from` can be off by a full turn
// whenever the arc straddles the +-180 degree seam. Always take the short way.
function shortAngleDelta(from, to) {
  let delta = to - from;
  while (delta <= -Math.PI) delta += TAU;
  while (delta > Math.PI) delta -= TAU;
  return delta;
}

export function buildPitchCircleGeometry(stats, params) {
  const curve = new THREE.EllipseCurve(0, 0, stats.pitchRadius, stats.pitchRadius, 0, TAU);
  const pts = curve.getPoints(128).map((p) => new THREE.Vector3(p.x, p.y, params.thickness / 2 + 0.05));
  return new THREE.BufferGeometry().setFromPoints(pts);
}
