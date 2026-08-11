import * as THREE from 'three';
import { buildGearOutline } from './gear-math.js';

const TAU = Math.PI * 2;

export function buildGearGeometry(params) {
  const outline = buildGearOutline(params);
  const shape = new THREE.Shape(outline.map((p) => new THREE.Vector2(p.x, p.y)));

  if (params.boreType !== 'none' && params.boreDiameter > 0) {
    shape.holes.push(buildBorePath(params.boreType, params.boreDiameter / 2));
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

export function buildPitchCircleGeometry(stats, params) {
  const curve = new THREE.EllipseCurve(0, 0, stats.pitchRadius, stats.pitchRadius, 0, TAU);
  const pts = curve.getPoints(128).map((p) => new THREE.Vector3(p.x, p.y, params.thickness / 2 + 0.05));
  return new THREE.BufferGeometry().setFromPoints(pts);
}
