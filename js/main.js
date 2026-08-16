import { computeGearStats } from './gear-math.js';
import { createViewer } from './scene.js';
import { downloadSTL } from './export.js';
import { PRESETS } from './presets.js';

const DEFAULTS = {
  teeth: 24,
  module: 2,
  pressureAngle: 20,
  thickness: 6,
  boreDiameter: 5,
  boreType: 'circle',
  backlash: 0.1,
  filletRadius: 0.3,
  wheelStyle: 'spokes',
  spokeCount: 6,
  clearance: 0.25,
  addendumFactor: 1,
};

const FIELD_IDS = ['teeth', 'module', 'pressureAngle', 'thickness', 'boreDiameter', 'backlash', 'filletRadius', 'spokeCount'];
const BORE_TYPES = ['none', 'circle', 'square', 'hex'];
const WHEEL_STYLES = ['solid', 'spokes'];

const params = { ...DEFAULTS, ...readParamsFromURL() };
let showPitchCircle = false;

const canvas = document.getElementById('viewport');
const viewer = createViewer(canvas);

const inputs = {};
for (const id of FIELD_IDS) {
  inputs[id] = document.querySelectorAll(`[data-field="${id}"]`);
}

function readParamsFromURL() {
  const url = new URLSearchParams(location.search);
  const out = {};
  for (const id of FIELD_IDS) {
    if (url.has(id)) {
      const v = parseFloat(url.get(id));
      if (!Number.isNaN(v)) out[id] = v;
    }
  }
  if (url.has('boreType') && BORE_TYPES.includes(url.get('boreType'))) {
    out.boreType = url.get('boreType');
  }
  if (url.has('wheelStyle') && WHEEL_STYLES.includes(url.get('wheelStyle'))) {
    out.wheelStyle = url.get('wheelStyle');
  }
  return out;
}

function syncURL() {
  const url = new URLSearchParams();
  for (const id of FIELD_IDS) url.set(id, params[id]);
  url.set('boreType', params.boreType);
  url.set('wheelStyle', params.wheelStyle);
  history.replaceState(null, '', `?${url.toString()}`);
}

const boreButtons = document.querySelectorAll('#boreTypePicker .shape-btn');
const wheelButtons = document.querySelectorAll('#wheelStylePicker .shape-btn');

function syncInputs() {
  for (const id of FIELD_IDS) {
    inputs[id].forEach((el) => {
      el.value = params[id];
    });
  }
  boreButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.shape === params.boreType);
  });
  wheelButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.wheel === params.wheelStyle);
  });
  document.getElementById('pitchCircleToggle').checked = showPitchCircle;
  updateBoreControlsState();
  updateSpokeControlsState();
}

function updateBoreControlsState() {
  inputs.boreDiameter.forEach((el) => {
    el.disabled = params.boreType === 'none';
  });
}

function updateSpokeControlsState() {
  inputs.spokeCount.forEach((el) => {
    el.disabled = params.wheelStyle !== 'spokes';
  });
}

function formatMM(value, digits = 2) {
  return `${value.toFixed(digits)} mm`;
}

function updateHUD(stats) {
  document.getElementById('hudPitch').textContent = formatMM(stats.pitchDiameter);
  document.getElementById('hudOuter').textContent = formatMM(stats.outerDiameter);
  document.getElementById('hudRoot').textContent = formatMM(stats.rootDiameter);
  document.getElementById('hudCircPitch').textContent = formatMM(stats.circularPitch);
}

function updateCaption(stats) {
  const caption = document.getElementById('viewportCaption');
  const web = params.wheelStyle === 'spokes' ? `, ${params.spokeCount}-spoke web` : '';
  caption.innerHTML =
    `<b>${params.teeth}-tooth</b> spur gear at module <b>${params.module} mm</b> ` +
    `(${(25.4 / params.module).toFixed(2)} DP), ${params.pressureAngle}&deg; pressure angle. ` +
    `Pitch diameter <b>${stats.pitchDiameter.toFixed(1)} mm</b>, ` +
    `bore <b>${params.boreDiameter} mm</b>, thickness <b>${params.thickness} mm</b>${web}.`;
}

function regenerate() {
  const stats = computeGearStats(params);
  viewer.update(params, stats, showPitchCircle);
  updateHUD(stats);
  updateCaption(stats);
  syncURL();
  return stats;
}

function bindField(id) {
  inputs[id].forEach((el) => {
    el.addEventListener('input', () => {
      const v = parseFloat(el.value);
      if (Number.isNaN(v)) return;
      params[id] = v;
      inputs[id].forEach((other) => {
        if (other !== el) other.value = v;
      });
      regenerate();
    });
  });
}

FIELD_IDS.forEach(bindField);

document.getElementById('pitchCircleToggle').addEventListener('change', (e) => {
  showPitchCircle = e.target.checked;
  regenerate();
});

boreButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    params.boreType = btn.dataset.shape;
    boreButtons.forEach((other) => other.classList.toggle('active', other === btn));
    updateBoreControlsState();
    regenerate();
  });
});

wheelButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    params.wheelStyle = btn.dataset.wheel;
    wheelButtons.forEach((other) => other.classList.toggle('active', other === btn));
    updateSpokeControlsState();
    regenerate();
  });
});

const infoDialog = document.getElementById('infoDialog');
document.getElementById('infoBtn').addEventListener('click', () => infoDialog.showModal());
document.getElementById('infoCloseBtn').addEventListener('click', () => infoDialog.close());
infoDialog.addEventListener('click', (e) => {
  if (e.target === infoDialog) infoDialog.close();
});

document.getElementById('exportBtn').addEventListener('click', () => {
  const mesh = viewer.getMesh();
  if (!mesh) return;
  const filename = `gear_m${params.module}_t${params.teeth}.stl`;
  downloadSTL(mesh, filename);
});

const presetGrid = document.getElementById('presetGrid');
PRESETS.forEach((preset) => {
  const btn = document.createElement('button');
  btn.className = 'btn';
  btn.textContent = preset.name;
  btn.addEventListener('click', () => {
    Object.assign(params, preset.params);
    syncInputs();
    regenerate();
  });
  presetGrid.appendChild(btn);
});

syncInputs();
regenerate();
