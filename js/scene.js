import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildGearGeometry, buildPitchCircleGeometry } from './geometry.js';

export function createViewer(canvas) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x18191c);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);
  camera.position.set(70, 55, 90);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;

  // OrbitControls' built-in wheel zoom applies a fixed step per wheel *event*,
  // ignoring deltaY's magnitude. That's fine for a low-resolution mouse wheel
  // (one notch = one event) but trackpads and precision mice fire many
  // small-delta events per gesture, each getting treated as a full step, so
  // zoom compounds into a huge jump for what feels like a small scroll. Scale
  // the step by the actual delta instead.
  controls.enableZoom = false;
  const zoomSpeed = 0.9;
  canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      const normalized = Math.max(-3, Math.min(3, event.deltaY / 100));
      const factor = Math.pow(0.95, normalized * zoomSpeed);
      const offset = camera.position.clone().sub(controls.target);
      const newLength = Math.max(controls.minDistance, Math.min(controls.maxDistance, offset.length() * factor));
      offset.setLength(newLength);
      camera.position.copy(controls.target).add(offset);
    },
    { passive: false },
  );

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 1.3);
  key.position.set(80, 120, 100);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x5577ee, 0.5);
  rim.position.set(-100, -30, -60);
  scene.add(rim);

  const material = new THREE.MeshStandardMaterial({ color: 0xe2e2e2, metalness: 0.15, roughness: 0.5 });
  const pitchMaterial = new THREE.LineBasicMaterial({ color: 0x1153ee, transparent: true, opacity: 0.85 });

  let mesh = null;
  let pitchLine = null;

  // A single large static plane with a shader that draws grid lines procedurally
  // and fades them out with distance from the camera. The plane never resizes or
  // rebuilds as parameters change — only its z-offset nudges to sit under the
  // current gear — and the distance fade hides its edge, so it reads as an
  // effectively infinite CAD-style ground grid at any zoom level.
  const gridMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uCameraPosition: { value: new THREE.Vector3() },
      uCellSize: { value: 5 },
      uLineColor: { value: new THREE.Color(0x888888) },
      uAxisColor: { value: new THREE.Color(0x55585e) },
      uFadeNear: { value: 400 },
      uFadeFar: { value: 1400 },
    },
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vWorldPos;
      uniform vec3 uCameraPosition;
      uniform float uCellSize;
      uniform vec3 uLineColor;
      uniform vec3 uAxisColor;
      uniform float uFadeNear;
      uniform float uFadeFar;

      float gridFactor(vec2 coord, float cellSize) {
        vec2 c = coord / cellSize;
        vec2 g = abs(fract(c - 0.5) - 0.5) / max(fwidth(c), 1e-6);
        return 1.0 - min(min(g.x, g.y), 1.0);
      }

      void main() {
        vec2 p = vWorldPos.xy;
        float minor = gridFactor(p, uCellSize);
        float major = gridFactor(p, uCellSize * 5.0);
        float axisX = 1.0 - min(abs(p.y) / max(fwidth(p.y), 1e-6), 1.0);
        float axisY = 1.0 - min(abs(p.x) / max(fwidth(p.x), 1e-6), 1.0);
        float axis = max(axisX, axisY);

        float dist = distance(vWorldPos, uCameraPosition);
        float fade = 1.0 - smoothstep(uFadeNear, uFadeFar, dist);

        vec3 color = mix(uLineColor, uAxisColor, axis);
        float alpha = max(minor * 0.35 + major * 0.3, axis * 0.55) * fade;
        if (alpha < 0.003) discard;
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
  });
  const grid = new THREE.Mesh(new THREE.PlaneGeometry(20000, 20000), gridMaterial);
  grid.position.z = -3;
  scene.add(grid);

  function resize() {
    const { clientWidth: w, clientHeight: h } = canvas;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function fitCameraToRadius(radius) {
    const direction = camera.position.clone().normalize();
    const fovRad = (camera.fov * Math.PI) / 180;
    const distance = (radius / Math.sin(fovRad / 2)) * 1.5;
    camera.position.copy(direction.multiplyScalar(distance));
    camera.near = Math.max(distance * 0.02, 0.01);
    camera.far = distance * 50;
    camera.updateProjectionMatrix();
    controls.minDistance = distance * 0.05;
    controls.maxDistance = distance * 15;
    // Scale the grid's distance fade with the current view distance (not the
    // gear's absolute size) so it never fully vanishes when zoomed out for a
    // large gear, and still fades in nicely at typical scale.
    gridMaterial.uniforms.uFadeNear.value = distance * 1.5;
    gridMaterial.uniforms.uFadeFar.value = distance * 4;
  }

  function update(params, stats, showPitchCircle) {
    if (mesh) {
      mesh.geometry.dispose();
      scene.remove(mesh);
    }
    const geometry = buildGearGeometry(params);
    geometry.computeBoundingSphere();
    mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
    fitCameraToRadius(geometry.boundingSphere.radius);

    if (pitchLine) {
      pitchLine.geometry.dispose();
      scene.remove(pitchLine);
      pitchLine = null;
    }
    if (showPitchCircle) {
      const geom = buildPitchCircleGeometry(stats, params);
      pitchLine = new THREE.LineLoop(geom, pitchMaterial);
      scene.add(pitchLine);
    }

    return mesh;
  }

  function render() {
    controls.update();
    gridMaterial.uniforms.uCameraPosition.value.copy(camera.position);
    renderer.render(scene, camera);
  }

  window.addEventListener('resize', resize);
  resize();

  function loop() {
    render();
    requestAnimationFrame(loop);
  }
  loop();

  return { update, resize, getMesh: () => mesh };
}
