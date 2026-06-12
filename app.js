// VibeSync Beat-Sync Prompt Planner client logic

// State Management
let state = {
  isServerMode: false,
  projects: [],
  currentProject: null,
  audios: [],
  currentAudio: null,
  audioDuration: 60, // default if no audio
  audioContext: null,
  audioBuffer: null,
  audioElement: null,
  isPlaying: false,
  playheadTime: 0,
  clips: [],
  selectedClipId: null,
  dragState: null, // { clipId, action, startX, startLeft, startRight, clipDuration }
  localAudios: {}, // stores mapping of filename to object URL
  autoSnap: true,
  syncPanelControl: false,
  timelineStart: 0,
  timelineEnd: 60,
  timelineHeight: 240,
  previewRatio: '9:16',
  previewQuality: '1080p',
  previewGuides: 'none',
  dock: {
    'panel-settings': 1,
    'panel-prompt': 2,
    'panel-preview': 3
  },
  activeTabInSlot: {
    1: 'panel-settings',
    2: 'panel-prompt',
    3: 'panel-preview'
  }
};

// DOM Elements
const els = {
  projectSelect: document.getElementById('project-select'),
  audioSelect: document.getElementById('audio-select'),
  fallbackBanner: document.getElementById('fallback-banner'),
  playBtn: document.getElementById('play-btn'),
  timeDisplay: document.getElementById('time-display'),
  audioTitle: document.getElementById('audio-title'),
  waveformCanvas: document.getElementById('waveform-canvas'),
  ruler: document.getElementById('timeline-ruler'),
  clipsLayer: document.getElementById('clips-layer'),
  playhead: document.getElementById('playhead-cursor'),
  timelineWrapper: document.getElementById('timeline-wrapper'),

  // Editor
  emptyState: document.getElementById('empty-state'),
  editorForm: document.getElementById('editor-form'),
  clipTitle: document.getElementById('clip-title'),
  clipStart: document.getElementById('clip-start'),
  clipEnd: document.getElementById('clip-end'),
  clipTheme: document.getElementById('clip-theme'),
  presetSelect: document.getElementById('preset-select'),
  fieldSubject: document.getElementById('field-subject'),
  fieldAction: document.getElementById('field-action'),
  fieldCamera: document.getElementById('field-camera'),
  fieldStyle: document.getElementById('field-style'),
  promptCompiled: document.getElementById('prompt-compiled'),
  copyBtn: document.getElementById('copy-btn'),
  deleteClipBtn: document.getElementById('delete-clip-btn'),

  // Actions
  newProjectBtn: document.getElementById('new-project-btn'),
  saveProjectBtn: document.getElementById('save-project-btn'),
  exportJsonBtn: document.getElementById('export-json-btn'),
  importJsonBtn: document.getElementById('import-json-btn'),
  importJsonInput: document.getElementById('import-json-input'),
  uploadInput: document.getElementById('upload-input'),
  addClipBtn: document.getElementById('add-clip-btn'),
  skipBackBtn: document.getElementById('skip-back-btn'),
  skipForwardBtn: document.getElementById('skip-forward-btn'),
  fullscreenToggleBtn: document.getElementById('fullscreen-toggle-btn'),
  relinkBtn: document.getElementById('relink-btn'),
  snapToggle: document.getElementById('snap-toggle'),
  syncPanelToggle: document.getElementById('sync-panel-toggle'),
  timelineStartInput: document.getElementById('timeline-start-input'),
  timelineEndInput: document.getElementById('timeline-end-input'),
  sketchContainer: document.getElementById('sketch-container'),
  sketchPlaceholder: document.getElementById('sketch-placeholder'),
  sketchPreview: document.getElementById('sketch-preview'),
  removeSketchBtn: document.getElementById('remove-sketch-btn'),
  sketchFileInput: document.getElementById('sketch-file-input'),

  // Header Player Upgrades
  restartBtn: document.getElementById('restart-btn'),
  volumeSlider: document.getElementById('volume-slider'),

  // Details Slots & Panels
  dockSlots: [
    document.getElementById('dock-slot-1'),
    document.getElementById('dock-slot-2'),
    document.getElementById('dock-slot-3')
  ],
  panelSettings: document.getElementById('panel-settings'),
  panelPrompt: document.getElementById('panel-prompt'),
  panelPreview: document.getElementById('panel-preview'),
  rowResizer: document.getElementById('row-resizer'),
  rowTimeline: document.querySelector('.row-timeline'),

  // Viewport
  previewRatio: document.getElementById('preview-ratio'),
  previewQuality: document.getElementById('preview-quality'),
  previewGuides: document.getElementById('preview-guides'),
  viewportScreen: document.getElementById('viewport-screen'),
  viewportImage: document.getElementById('viewport-image'),
  viewportPlaceholder: document.getElementById('viewport-placeholder'),
  viewportSubtitles: document.getElementById('viewport-subtitles'),
  viewportGrid: document.getElementById('viewport-grid'),
  viewportSafe: document.getElementById('viewport-safe'),
  viewportWatermark: document.getElementById('viewport-watermark')
};

// Preset prompts and details
const PRESETS = {
  'arrival': {
    name: 'Arrival (Intro)',
    theme: 'arrival',
    subject: 'a fresh graduate wearing a simple white and black uniform',
    action: 'walking down the concrete stairs into the train station, wide shot',
    camera: 'slow pan',
    style: 'soft warm morning sun rays illuminating dust particles, natural color grading, filmed on 35mm lens, slow motion, portrait aspect ratio 9:16'
  },
  'red-rush': {
    name: 'Red Rush (Beat Drop)',
    theme: 'red-rush',
    subject: 'crowds of commuters running past',
    action: 'a hyperlapse timelapse of commuter train doors opening and crowds flooding in',
    camera: 'dynamic fast tracking shot with high-speed motion blur',
    style: 'monochrome red grayscale, high-contrast styling, cinematic lighting, dramatic shadows, portrait aspect ratio 9:16'
  },
  'calm': {
    name: 'Human Calm (Slow)',
    theme: 'calm',
    subject: 'a tired office worker wearing a muted blue shirt, holding a worn work bag',
    action: 'leaning their head against the glass window, extreme close-up on their tired eyes',
    camera: 'static steady close-up, slow motion',
    style: 'fully desaturated dark gray background with only the clothing color of the subject saturated and visible, moody film aesthetics, high details, portrait aspect ratio 9:16'
  },
  'rebuild': {
    name: 'Red Rush 2 (Klimaks)',
    theme: 'rebuild',
    subject: 'commuter train speeding away into a dark tunnel, red tail lights glowing',
    action: 'accelerating down the tracks',
    camera: 'low-angle shot looking up',
    style: 'monochrome red grayscale, intense high contrast, heavy shadows, abstract speed lines, slow motion, portrait aspect ratio 9:16'
  },
  'outro': {
    name: 'Outro (Fade)',
    theme: 'outro',
    subject: 'blank void',
    action: 'cinematic fade to absolute black silence',
    camera: 'stationary fade',
    style: 'minimalist look, portrait aspect ratio 9:16'
  }
};

// Time parsing and formatting helpers (Blender-style range parsing)
function parseTimeStr(str) {
  str = str.trim();
  let isNegative = false;
  if (str.startsWith('-')) {
    isNegative = true;
    str = str.substring(1);
  } else if (str.startsWith('+')) {
    str = str.substring(1);
  }
  
  if (str.includes(':')) {
    const parts = str.split(':');
    if (parts.length === 2) {
      const min = parseInt(parts[0], 10) || 0;
      const sec = parseFloat(parts[1]) || 0;
      const val = min * 60 + sec;
      return isNegative ? -val : val;
    }
  }
  const val = parseFloat(str) || 0;
  return isNegative ? -val : val;
}

function formatTimeStr(secs) {
  const isNegative = secs < 0;
  const absSecs = Math.abs(secs);
  const m = Math.floor(absSecs / 60);
  const s = Math.floor(absSecs % 60);
  const sign = isNegative ? '-' : '';
  return `${sign}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// Timeline coordinate mapping helpers
function timeToPct(t) {
  const start = state.timelineStart;
  const end = state.timelineEnd;
  const total = end - start;
  if (total <= 0) return 0;
  return ((t - start) / total) * 100;
}

function pctToTime(pct) {
  const start = state.timelineStart;
  const end = state.timelineEnd;
  const total = end - start;
  return start + (pct * total);
}

// Initialize app
window.addEventListener('DOMContentLoaded', async () => {
  setupAudioElement();
  await checkServerConnection();
  await loadAudioList();
  await loadProjectList();

  setupEventListeners();
  renderRuler();
  renderTimeline();
  setupDockLayout();
  renderDock();
  updateViewportPreview();
});

// Setup simple Audio element
function setupAudioElement() {
  state.audioElement = new Audio();
  state.audioElement.addEventListener('timeupdate', () => {
    if (state.playheadTime >= 0 && !state.isPlaying) {
      state.playheadTime = state.audioElement.currentTime;
      updatePlayheadPosition();
      updateTimeDisplay();
      updateViewportPreview();
    }
  });
  state.audioElement.addEventListener('ended', () => {
    stopPlayback();
  });
  state.audioElement.addEventListener('loadedmetadata', () => {
    state.audioDuration = state.audioElement.duration || 60;
    // Auto-update timelineEnd if it is default
    if (state.currentProject && (state.timelineEnd === 60 || state.timelineEnd === state.audioDuration)) {
      state.timelineEnd = state.audioDuration;
      if (els.timelineEndInput) {
        els.timelineEndInput.value = formatTimeStr(state.timelineEnd);
      }
    }
    renderRuler();
    renderTimeline();
    analyzeAndDrawWaveform();
  });
}

let lastPlaybackTime = 0;

function playbackLoop() {
  if (!state.isPlaying) return;

  const now = performance.now();
  const dt = (now - lastPlaybackTime) / 1000;
  lastPlaybackTime = now;

  // Enforce muting and volume controls
  if (state.playheadTime < 0) {
    state.audioElement.muted = true;
    state.playheadTime += dt;
    if (state.playheadTime >= 0) {
      state.playheadTime = 0;
      state.audioElement.currentTime = 0;
      state.audioElement.muted = false;
      if (els.volumeSlider) state.audioElement.volume = parseFloat(els.volumeSlider.value);
      state.audioElement.play().catch(err => console.error(err));
    }
    updatePlayheadPosition();
    updateTimeDisplay();
  } else {
    state.audioElement.muted = false;
    if (els.volumeSlider) state.audioElement.volume = parseFloat(els.volumeSlider.value);
    state.playheadTime = state.audioElement.currentTime;
    updatePlayheadPosition();
    updateTimeDisplay();

    if (state.playheadTime >= state.timelineEnd || state.playheadTime >= state.audioDuration) {
      stopPlayback();
      return;
    }
  }

  // Handle Sync Panel Control (auto-select active clip)
  if (state.syncPanelControl) {
    const activeClip = state.clips.find(c => state.playheadTime >= c.start && state.playheadTime <= c.end);
    if (activeClip && activeClip.id !== state.selectedClipId) {
      selectClip(activeClip.id);
    }
  }

  // Live viewport preview update
  updateViewportPreview();

  requestAnimationFrame(playbackLoop);
}

function stopPlayback() {
  state.audioElement.pause();
  state.isPlaying = false;
  els.playBtn.innerHTML = '▶';
}

// Connection check with server
async function checkServerConnection() {
  const statusEl = document.getElementById('local-status-container');
  try {
    const res = await fetch('/api/projects');
    if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
      const data = await res.json();
      if (Array.isArray(data)) {
        state.isServerMode = true;
        els.fallbackBanner.style.display = 'none';
        if (statusEl) {
          statusEl.innerHTML = `
            <div class="local-status-badge">
              <span class="status-dot"></span>
              <span class="status-text">Local Machine Server Active</span>
            </div>
          `;
        }
        return;
      }
    }
    throw new Error();
  } catch (e) {
    state.isServerMode = false;
    els.fallbackBanner.style.display = 'flex';
    if (statusEl) {
      statusEl.innerHTML = `
        <div class="local-status-badge offline">
          <span class="status-dot"></span>
          <span class="status-text">Local Server Offline (Static Mode)</span>
        </div>
      `;
    }
  }
}

// Load List of projects
async function loadProjectList() {
  if (state.isServerMode) {
    try {
      const res = await fetch('/api/projects');
      const list = await res.json();
      state.projects = list;
    } catch (e) {
      console.error('Error fetching projects list:', e);
    }
  } else {
    // LocalStorage fallback
    state.projects = Object.keys(localStorage)
      .filter(k => k.startsWith('vibesync_proj_'))
      .map(k => k.replace('vibesync_proj_', ''));

    // If no projects exist, initialize a default starter project
    if (state.projects.length === 0) {
      const demoProject = {
        name: "VibeSync Demo",
        audioUrl: "",
        timelineStart: 0,
        timelineEnd: 60,
        clips: [
          { id: 'clip_demo_1', title: 'Arrival', start: 0, end: 10, theme: 'arrival', preset: 'arrival', ...PRESETS.arrival },
          { id: 'clip_demo_2', title: 'Red Rush', start: 10, end: 25, theme: 'red-rush', preset: 'red-rush', ...PRESETS['red-rush'] },
          { id: 'clip_demo_3', title: 'Human Calm', start: 25, end: 40, theme: 'calm', preset: 'calm', ...PRESETS.calm }
        ]
      };
      localStorage.setItem(`vibesync_proj_${demoProject.name}`, JSON.stringify(demoProject));
      state.projects.push(demoProject.name);
    }
  }

  // Update Dropdown
  els.projectSelect.innerHTML = '<option value="">-- Select Project --</option>';
  state.projects.forEach(proj => {
    const opt = document.createElement('option');
    opt.value = proj;
    opt.innerText = proj;
    els.projectSelect.appendChild(opt);
  });

  if (state.currentProject) {
    els.projectSelect.value = state.currentProject.name;
  } else if (state.projects.length > 0) {
    const defaultProj = state.projects.includes('VibeSync Demo') ? 'VibeSync Demo' : state.projects[0];
    els.projectSelect.value = defaultProj;
    await selectProject(defaultProj);
  }
}

// Load List of Audio Files
async function loadAudioList() {
  els.audioSelect.innerHTML = '<option value="">-- No Audio File --</option>';

  if (state.isServerMode) {
    try {
      const res = await fetch('/api/mp3');
      state.audios = await res.json();

      state.audios.forEach(audio => {
        const opt = document.createElement('option');
        opt.value = `/mp3/${audio}`;
        opt.innerText = audio;
        els.audioSelect.appendChild(opt);
      });
    } catch (e) {
      console.error('Error fetching audio list:', e);
    }
  } else {
    // Local Mode: list the files mapped in memory
    const localAudios = Object.keys(state.localAudios);
    localAudios.forEach(audioName => {
      const opt = document.createElement('option');
      opt.value = `local:${audioName}`;
      opt.innerText = audioName;
      els.audioSelect.appendChild(opt);
    });

    // Also check if current project needs a local file that isn't loaded yet
    if (state.currentProject && state.currentProject.audioUrl && state.currentProject.audioUrl.startsWith('local:')) {
      const neededFile = state.currentProject.audioUrl.replace('local:', '');
      if (!localAudios.includes(neededFile)) {
        const opt = document.createElement('option');
        opt.value = `local:${neededFile}`;
        opt.innerText = `⚠️ Relink: ${neededFile}`;
        els.audioSelect.appendChild(opt);
      }
    }
  }
}

// Load a specific project
async function selectProject(projectName) {
  if (!projectName) {
    state.currentProject = null;
    state.clips = [];
    state.selectedClipId = null;
    state.timelineStart = 0;
    state.timelineEnd = 60;
    state.timelineHeight = 240;
    if (els.rowTimeline) {
      els.rowTimeline.style.height = `${state.timelineHeight}px`;
    }
    window.dispatchEvent(new Event('resize'));
    if (els.timelineStartInput) els.timelineStartInput.value = "00:00";
    if (els.timelineEndInput) els.timelineEndInput.value = "01:00";
    loadAudioTrack(null);
    renderTimeline();
    updateEditorPanel();
    return;
  }

  let projectData;
  if (state.isServerMode) {
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectName)}`);
      projectData = await res.json();
    } catch (e) {
      console.error('Failed to load project from server:', e);
      alert('Could not load project.');
      return;
    }
  } else {
    const raw = localStorage.getItem(`vibesync_proj_${projectName}`);
    if (raw) {
      projectData = JSON.parse(raw);
    }
  }

  if (projectData) {
    state.currentProject = {
      name: projectName,
      audioUrl: projectData.audioUrl || '',
      timelineStart: projectData.timelineStart !== undefined ? projectData.timelineStart : 0,
      timelineEnd: projectData.timelineEnd !== undefined ? projectData.timelineEnd : 60
    };
    state.clips = projectData.clips || [];
    state.selectedClipId = null;
    state.timelineStart = state.currentProject.timelineStart;
    state.timelineEnd = state.currentProject.timelineEnd;

    // Load custom height for this project
    const savedHeight = localStorage.getItem(`vibesync_timeline_h_${projectName}`);
    if (savedHeight) {
      state.timelineHeight = parseInt(savedHeight, 10) || 240;
    } else {
      state.timelineHeight = 240;
    }
    if (els.rowTimeline) {
      els.rowTimeline.style.height = `${state.timelineHeight}px`;
    }
    window.dispatchEvent(new Event('resize'));

    // Update range input values
    if (els.timelineStartInput) els.timelineStartInput.value = formatTimeStr(state.timelineStart);
    if (els.timelineEndInput) els.timelineEndInput.value = formatTimeStr(state.timelineEnd);

    // Set audio select
    els.audioSelect.value = projectData.audioUrl || '';
    loadAudioTrack(projectData.audioUrl || '');

    renderTimeline();
    updateEditorPanel();
  }
}

// Load audio track and decode for waveform
async function loadAudioTrack(audioUrl) {
  state.currentAudio = audioUrl;
  state.audioElement.pause();
  state.isPlaying = false;
  els.playBtn.innerHTML = '▶';
  state.playheadTime = 0;

  // Default states
  els.audioTitle.style.display = 'block';
  els.relinkBtn.style.display = 'none';

  if (!audioUrl) {
    state.audioBuffer = null;
    state.audioDuration = 60;
    els.audioTitle.innerText = 'No track loaded';
    renderRuler();
    renderTimeline();
    clearWaveform();
    return;
  }

  els.audioTitle.innerText = 'Loading and decoding audio...';

  try {
    if (audioUrl.startsWith('local:')) {
      const filename = audioUrl.replace('local:', '');
      const objectUrl = state.localAudios[filename];
      if (objectUrl) {
        state.audioElement.src = objectUrl;
        els.audioTitle.innerText = filename;
        const res = await fetch(objectUrl);
        const arrayBuf = await res.arrayBuffer();
        decodeAudioData(arrayBuf);
      } else {
        // Hide standard audio title, display the relink button
        els.audioTitle.style.display = 'none';
        els.relinkBtn.innerText = `⚠️ Relink: ${filename}`;
        els.relinkBtn.style.display = 'inline-flex';

        state.audioBuffer = null;
        state.audioDuration = 60;
        renderRuler();
        renderTimeline();
        clearWaveform();
      }
    } else {
      state.audioElement.src = audioUrl;
      const fileName = audioUrl.substring(audioUrl.lastIndexOf('/') + 1);
      els.audioTitle.innerText = fileName;

      const res = await fetch(audioUrl);
      const arrayBuf = await res.arrayBuffer();
      decodeAudioData(arrayBuf);
    }
  } catch (e) {
    console.error('Failed to load audio track:', e);
    els.audioTitle.innerText = 'Error loading track';
    state.audioDuration = 60;
    renderRuler();
    renderTimeline();
    clearWaveform();
  }
}

// Decode audio binary to draw waveform
async function decodeAudioData(arrayBuffer) {
  if (!state.audioContext) {
    state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }

  try {
    state.audioBuffer = await state.audioContext.decodeAudioData(arrayBuffer);
    state.audioDuration = state.audioBuffer.duration;
    renderRuler();
    renderTimeline();
    analyzeAndDrawWaveform();
  } catch (e) {
    console.error('Audio decoding error:', e);
    // Don't crash, still allow prompt editing with standard timeline duration
  }
}

// Canvas waveform generator
function analyzeAndDrawWaveform() {
  if (!state.audioBuffer) return;

  const canvas = els.waveformCanvas;
  const ctx = canvas.getContext('2d');

  // Resize canvas internally
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * window.devicePixelRatio;
  canvas.height = rect.height * window.devicePixelRatio;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

  const width = rect.width;
  const height = rect.height;

  ctx.clearRect(0, 0, width, height);

  const leftChannel = state.audioBuffer.getChannelData(0);
  const totalSamples = leftChannel.length;
  const amp = height / 2.5;

  ctx.beginPath();
  ctx.moveTo(0, height / 2);

  // Gradient style
  const grad = ctx.createLinearGradient(0, 0, width, 0);
  grad.addColorStop(0, '#00e5ff');  // blue
  grad.addColorStop(0.3, '#bd00ff'); // purple
  grad.addColorStop(0.7, '#ff3838'); // red
  grad.addColorStop(1, '#ffaa00');   // amber
  ctx.strokeStyle = grad;
  ctx.lineWidth = 1.5;

  for (let i = 0; i < width; i++) {
    const tStart = pctToTime(i / width);
    const tEnd = pctToTime((i + 1) / width);

    if (tStart >= 0 && tStart <= state.audioDuration) {
      const sampleStart = Math.floor((tStart / state.audioDuration) * totalSamples);
      let sampleEnd = Math.floor((tEnd / state.audioDuration) * totalSamples);
      if (sampleEnd <= sampleStart) {
        sampleEnd = sampleStart + 1;
      }

      let min = 1.0;
      let max = -1.0;
      for (let j = sampleStart; j < sampleEnd && j < totalSamples; j++) {
        const datum = leftChannel[j];
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }
      ctx.lineTo(i, (1 + min) * amp + (height / 2 - amp));
      ctx.lineTo(i, (1 + max) * amp + (height / 2 - amp));
    } else {
      ctx.lineTo(i, height / 2);
    }
  }
  ctx.stroke();
}

function clearWaveform() {
  const canvas = els.waveformCanvas;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// Timeline Ruler Rendering
function renderRuler() {
  els.ruler.innerHTML = '';
  const range = state.timelineEnd - state.timelineStart;
  if (range <= 0) return;

  // Determine tick interval based on timeline range length
  let step = 5;
  if (range <= 10) step = 1;
  else if (range <= 30) step = 2;
  else if (range <= 90) step = 5;
  else step = 10;

  const firstTick = Math.ceil(state.timelineStart / step) * step;

  for (let t = firstTick; t <= state.timelineEnd; t += step) {
    const leftPct = timeToPct(t);
    if (leftPct < 0 || leftPct > 100) continue;

    const tick = document.createElement('div');
    tick.className = 'ruler-tick' + (t % (step * 2) === 0 ? ' major' : '');
    tick.style.left = `${leftPct}%`;
    tick.innerText = `${t}s`;
    els.ruler.appendChild(tick);
  }

  updatePlayheadPosition();
}

// Setup standard event listeners
function setupEventListeners() {
  // Header player upgrades
  els.restartBtn.addEventListener('click', () => {
    state.playheadTime = state.timelineStart;
    if (state.playheadTime >= 0) {
      state.audioElement.currentTime = state.playheadTime;
      state.audioElement.muted = false;
      if (els.volumeSlider) state.audioElement.volume = parseFloat(els.volumeSlider.value);
    } else {
      state.audioElement.muted = true;
      state.audioElement.currentTime = 0;
      state.audioElement.pause();
    }
    updatePlayheadPosition();
    updateTimeDisplay();
    updateViewportPreview();

    // If not currently playing, start playing!
    if (!state.isPlaying) {
      togglePlayback();
    }
  });

  if (els.volumeSlider) {
    els.volumeSlider.addEventListener('input', (e) => {
      const vol = parseFloat(e.target.value);
      state.volume = vol;
      if (state.playheadTime >= 0) {
        state.audioElement.volume = vol;
        state.audioElement.muted = false;
      }
      
      const icon = document.getElementById('volume-icon');
      if (icon) {
        if (vol === 0) icon.innerText = '🔇';
        else if (vol < 0.4) icon.innerText = '🔈';
        else if (vol < 0.7) icon.innerText = '🔉';
        else icon.innerText = '🔊';
      }
    });
  }

  // Premiere Pro Slots Drag and Drop listeners
  els.dockSlots.forEach(slotEl => {
    if (!slotEl) return;
    const slotIdx = parseInt(slotEl.dataset.slotIndex);

    slotEl.addEventListener('dragover', (e) => {
      e.preventDefault(); // Required to allow drop
      slotEl.classList.add('drag-hover');
    });

    slotEl.addEventListener('dragleave', () => {
      slotEl.classList.remove('drag-hover');
    });

    slotEl.addEventListener('drop', (e) => {
      e.preventDefault();
      slotEl.classList.remove('drag-hover');
      const panelId = e.dataTransfer.getData('text/plain');
      if (panelId && (panelId === 'panel-settings' || panelId === 'panel-prompt' || panelId === 'panel-preview')) {
        state.dock[panelId] = slotIdx;
        state.activeTabInSlot[slotIdx] = panelId;
        
        // Save layouts config to localStorage
        localStorage.setItem('vibesync_dock_config', JSON.stringify(state.dock));
        
        renderDock();
      }
    });
  });

  // Timeline height splitter resizer drag handling
  if (els.rowResizer && els.rowTimeline) {
    els.rowResizer.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      els.rowResizer.classList.add('dragging');

      const startY = e.clientY;
      const startHeight = els.rowTimeline.offsetHeight;

      const onPointerMove = (moveEvent) => {
        const dy = moveEvent.clientY - startY;
        let newHeight = startHeight + dy;

        // Clamp timeline height between 120px and 75% of viewport height
        if (newHeight < 120) newHeight = 120;
        const maxHeight = window.innerHeight * 0.75;
        if (newHeight > maxHeight) newHeight = maxHeight;

        state.timelineHeight = newHeight;
        els.rowTimeline.style.height = `${newHeight}px`;

        // Dispatch window resize event to force canvas timeline re-draws
        window.dispatchEvent(new Event('resize'));
      };

      const onPointerUp = () => {
        els.rowResizer.classList.remove('dragging');
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);

        // Save custom timeline height
        if (state.currentProject) {
          localStorage.setItem(`vibesync_timeline_h_${state.currentProject.name}`, state.timelineHeight);
        }
      };

      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', onPointerUp);
    });
  }

  // Viewport Settings listeners
  els.previewRatio.addEventListener('change', (e) => {
    state.previewRatio = e.target.value;
    els.viewportScreen.style.aspectRatio = e.target.value.replace(':', ' / ');
  });

  els.previewQuality.addEventListener('change', (e) => {
    state.previewQuality = e.target.value;
    let text = `Veo 3.1 • ${state.previewQuality}`;
    if (state.previewQuality === '1080p') text += ' Playback';
    else if (state.previewQuality === '4K') text += ' Quality';
    else if (state.previewQuality === '720p') text += ' Draft';
    else if (state.previewQuality === '480p') text += ' Proxy';
    els.viewportWatermark.innerText = text;
  });

  els.previewGuides.addEventListener('change', (e) => {
    state.previewGuides = e.target.value;
    if (state.previewGuides === 'none') {
      els.viewportGrid.style.display = 'none';
      els.viewportSafe.style.display = 'none';
    } else if (state.previewGuides === 'thirds') {
      els.viewportGrid.style.display = 'block';
      els.viewportSafe.style.display = 'none';
    } else if (state.previewGuides === 'safe') {
      els.viewportGrid.style.display = 'none';
      els.viewportSafe.style.display = 'flex';
    }
  });

  // Play / Pause
  els.playBtn.addEventListener('click', togglePlayback);

  // Spacebar to play/pause
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      e.preventDefault();
      togglePlayback();
    }
  });

  // Project Selection
  els.projectSelect.addEventListener('change', (e) => {
    selectProject(e.target.value);
  });

  // Audio Selection
  els.audioSelect.addEventListener('change', (e) => {
    const val = e.target.value;
    if (state.currentProject) {
      state.currentProject.audioUrl = val;
      loadAudioTrack(val);
    } else {
      loadAudioTrack(val);
    }
  });

  // Editor Toggles and Project Settings
  els.snapToggle.addEventListener('change', (e) => {
    state.autoSnap = e.target.checked;
  });

  els.syncPanelToggle.addEventListener('change', (e) => {
    state.syncPanelControl = e.target.checked;
  });

  els.timelineStartInput.addEventListener('change', (e) => {
    const val = parseTimeStr(e.target.value);
    state.timelineStart = val;
    if (state.currentProject) {
      state.currentProject.timelineStart = val;
    }
    e.target.value = formatTimeStr(val);
    renderRuler();
    renderTimeline();
    analyzeAndDrawWaveform();
  });

  els.timelineEndInput.addEventListener('change', (e) => {
    const val = parseTimeStr(e.target.value);
    state.timelineEnd = val;
    if (state.currentProject) {
      state.currentProject.timelineEnd = val;
    }
    e.target.value = formatTimeStr(val);
    renderRuler();
    renderTimeline();
    analyzeAndDrawWaveform();
  });

  // Storyboard Sketch listeners
  els.sketchContainer.addEventListener('click', (e) => {
    if (e.target === els.removeSketchBtn) return;
    els.sketchFileInput.click();
  });

  els.sketchFileInput.addEventListener('change', handleSketchUpload);

  els.removeSketchBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    removeSketch();
  });

  // File Upload
  document.getElementById('upload-zone').addEventListener('click', () => {
    els.uploadInput.click();
  });

  els.uploadInput.addEventListener('change', handleAudioUpload);

  // New Project
  els.newProjectBtn.addEventListener('click', createNewProject);

  // Save Project
  els.saveProjectBtn.addEventListener('click', saveCurrentProject);

  // Export & Import Project JSON
  els.exportJsonBtn.addEventListener('click', exportProjectJSON);
  els.importJsonBtn.addEventListener('click', () => els.importJsonInput.click());
  els.importJsonInput.addEventListener('change', handleProjectImport);

  // Add Clip
  els.addClipBtn.addEventListener('click', createClipAtPlayhead);

  // Skip buttons click handlers
  els.skipBackBtn.addEventListener('click', () => {
    if (!state.currentAudio) return;
    state.playheadTime = Math.max(state.timelineStart, state.playheadTime - 1.0);
    if (state.playheadTime >= 0) {
      state.audioElement.currentTime = state.playheadTime;
    } else {
      state.audioElement.currentTime = 0;
    }
    updatePlayheadPosition();
    updateTimeDisplay();
  });

  els.skipForwardBtn.addEventListener('click', () => {
    if (!state.currentAudio) return;
    state.playheadTime = Math.min(state.timelineEnd, state.playheadTime + 1.0);
    if (state.playheadTime >= 0) {
      state.audioElement.currentTime = state.playheadTime;
    } else {
      state.audioElement.currentTime = 0;
    }
    updatePlayheadPosition();
    updateTimeDisplay();
  });

  // Fullscreen button click handler
  els.fullscreenToggleBtn.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen mode: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  });

  // Relink button click handler
  els.relinkBtn.addEventListener('click', () => {
    els.uploadInput.click();
  });

  // Form Field sync
  const formInputs = [
    els.clipTitle, els.clipStart, els.clipEnd, els.clipTheme,
    els.fieldSubject, els.fieldAction, els.fieldCamera, els.fieldStyle
  ];
  formInputs.forEach(input => {
    input.addEventListener('input', () => {
      syncFormToClip();
      renderTimeline();
    });
  });

  // Preset Selection
  els.presetSelect.addEventListener('change', (e) => {
    applyPreset(e.target.value);
  });

  // Delete Clip
  els.deleteClipBtn.addEventListener('click', deleteSelectedClip);

  // Clipboard copy
  els.copyBtn.addEventListener('click', copyCompiledPrompt);

  // Timeline seeking by clicking ruler or waveform canvas
  els.ruler.addEventListener('pointerdown', handleTimelineSeek);
  els.waveformCanvas.addEventListener('pointerdown', handleTimelineSeek);

  // Window resize re-draws canvas waveform and ruler ticks
  window.addEventListener('resize', () => {
    renderRuler();
    analyzeAndDrawWaveform();
  });

  // Track drag events on document to ensure dragging works outside timeline bounds
  document.addEventListener('pointermove', handlePointerMove);
  document.addEventListener('pointerup', handlePointerUp);

  // Adobe Premiere Pro style mouse wheel zooming and panning
  if (els.timelineWrapper) {
    els.timelineWrapper.addEventListener('wheel', (e) => {
      e.preventDefault();

      const rect = els.timelineWrapper.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const pct = Math.max(0, Math.min(1, mouseX / rect.width));

      const currentRange = state.timelineEnd - state.timelineStart;
      const hoverTime = state.timelineStart + pct * currentRange;

      if (e.altKey || e.ctrlKey) {
        // Zoom timeline centered on mouse hover position
        const zoomIntensity = 0.08;
        const factor = e.deltaY < 0 ? (1 - zoomIntensity) : (1 + zoomIntensity);

        let newRange = currentRange * factor;
        // Clamp minimum zoom to 1 second, maximum zoom to 1 hour
        if (newRange < 1) newRange = 1;
        if (newRange > 3600) newRange = 3600;

        state.timelineStart = hoverTime - pct * newRange;
        state.timelineEnd = hoverTime + (1 - pct) * newRange;
      } else {
        // Pan timeline left/right
        const panIntensity = 0.05;
        const delta = e.deltaX !== 0 ? e.deltaX : e.deltaY;
        const shiftAmount = currentRange * panIntensity * (delta > 0 ? 1 : -1);

        state.timelineStart += shiftAmount;
        state.timelineEnd += shiftAmount;
      }

      // Update range settings textboxes
      if (els.timelineStartInput) els.timelineStartInput.value = formatTimeStr(state.timelineStart);
      if (els.timelineEndInput) els.timelineEndInput.value = formatTimeStr(state.timelineEnd);

      if (state.currentProject) {
        state.currentProject.timelineStart = state.timelineStart;
        state.currentProject.timelineEnd = state.timelineEnd;
      }

      // Redraw ruler, clips, playhead, and waveform
      renderRuler();
      renderTimeline();
      updatePlayheadPosition();
      analyzeAndDrawWaveform();
    }, { passive: false });
  }

  // Mobile & Desktop Drawer Toggle Listeners
  const sidebarToggle = document.getElementById('sidebar-toggle-btn');
  const sidebarClose = document.getElementById('sidebar-close-btn');
  const sidebarOverlay = document.getElementById('sidebar-overlay');
  const sidebar = document.getElementById('sidebar');
  const workspace = document.querySelector('.workspace');

  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', () => {
      // Toggle active classes for mobile drawer view
      sidebar.classList.toggle('active');
      sidebarOverlay.classList.toggle('active');

      // Toggle sidebar-collapsed for desktop collapsible grid view
      if (workspace) {
        workspace.classList.toggle('sidebar-collapsed');
      }
    });
  }

  if (sidebarClose) {
    sidebarClose.addEventListener('click', () => {
      sidebar.classList.remove('active');
      sidebarOverlay.classList.remove('active');
    });
  }

  if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', () => {
      sidebar.classList.remove('active');
      sidebarOverlay.classList.remove('active');
    });
  }
}

// Play Pause logic
function togglePlayback() {
  if (!state.currentAudio) return;

  if (state.isPlaying) {
    stopPlayback();
  } else {
    state.audioContext?.resume();
    state.isPlaying = true;
    els.playBtn.innerHTML = '❚❚';
    lastPlaybackTime = performance.now();

    if (state.playheadTime >= 0) {
      state.audioElement.currentTime = state.playheadTime;
      state.audioElement.play().catch(err => {
        console.error('Play failed:', err);
      });
    } else {
      state.audioElement.pause();
    }

    requestAnimationFrame(playbackLoop);
  }
}

// Seek by clicking timeline
function handleTimelineSeek(e) {
  if (state.timelineEnd <= state.timelineStart) return;
  const rect = els.timelineWrapper.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const pct = clickX / rect.width;
  const targetTime = Math.max(state.timelineStart, Math.min(state.timelineEnd, pctToTime(pct)));

  state.playheadTime = targetTime;
  if (state.playheadTime >= 0) {
    state.audioElement.muted = false;
    if (els.volumeSlider) state.audioElement.volume = parseFloat(els.volumeSlider.value);
    state.audioElement.currentTime = state.playheadTime;
  } else {
    state.audioElement.muted = true;
    state.audioElement.currentTime = 0;
  }
  updatePlayheadPosition();
  updateTimeDisplay();
  updateViewportPreview();
}

// Playhead location updates
function updatePlayheadPosition() {
  const pct = Math.max(0, Math.min(100, timeToPct(state.playheadTime)));
  els.playhead.style.left = `${pct}%`;
}

function updateTimeDisplay() {
  const cur = formatTime(state.playheadTime);
  const tot = formatTime(state.audioDuration);
  els.timeDisplay.innerText = `${cur} / ${tot}`;
}

function formatTime(secs) {
  const isNegative = secs < 0;
  const absSecs = Math.abs(secs);
  const m = Math.floor(absSecs / 60);
  const s = Math.floor(absSecs % 60);
  const ms = Math.floor((absSecs % 1) * 100);
  const sign = isNegative ? '-' : '';
  return `${sign}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

// Upload Audio File
async function handleAudioUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  els.audioTitle.innerText = `Uploading ${file.name}...`;

  if (state.isServerMode) {
    try {
      const res = await fetch(`/api/mp3?filename=${encodeURIComponent(file.name)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: file
      });
      const data = await res.json();
      if (data.success) {
        await loadAudioList();
        els.audioSelect.value = `/mp3/${data.filename}`;
        loadAudioTrack(`/mp3/${data.filename}`);

        if (state.currentProject) {
          state.currentProject.audioUrl = `/mp3/${data.filename}`;
        }
      }
    } catch (err) {
      console.error('Audio upload failed:', err);
      alert('Failed to upload audio file to server.');
    }
  } else {
    // Local Mode: Create a temporary object URL to read local file
    const objectUrl = URL.createObjectURL(file);
    state.localAudios[file.name] = objectUrl;

    // Add to selector if not present
    let optExists = Array.from(els.audioSelect.options).some(opt => opt.value === `local:${file.name}`);
    if (!optExists) {
      const opt = document.createElement('option');
      opt.value = `local:${file.name}`;
      opt.innerText = file.name;
      els.audioSelect.appendChild(opt);
    }

    els.audioSelect.value = `local:${file.name}`;
    loadAudioTrack(`local:${file.name}`);

    if (state.currentProject) {
      state.currentProject.audioUrl = `local:${file.name}`;
    }
    showNotification('Audio loaded locally!');
  }
}

// Create New Project
function createNewProject() {
  const name = prompt('Enter project name:');
  if (!name) return;

  const cleanName = name.replace(/[^a-zA-Z0-9_\- ]/g, '').trim();
  if (!cleanName) return;

  state.timelineStart = 0;
  state.timelineEnd = state.audioDuration || 60;

  state.currentProject = {
    name: cleanName,
    audioUrl: els.audioSelect.value || '',
    timelineStart: state.timelineStart,
    timelineEnd: state.timelineEnd
  };

  if (els.timelineStartInput) els.timelineStartInput.value = formatTimeStr(state.timelineStart);
  if (els.timelineEndInput) els.timelineEndInput.value = formatTimeStr(state.timelineEnd);

  state.clips = [
    { id: 'clip_' + Date.now() + '_1', title: 'Arrival', start: 0, end: 10, theme: 'arrival', preset: 'arrival', ...PRESETS.arrival },
    { id: 'clip_' + Date.now() + '_2', title: 'Red Rush', start: 10, end: 25, theme: 'red-rush', preset: 'red-rush', ...PRESETS['red-rush'] }
  ];
  state.selectedClipId = state.clips[0].id;

  renderTimeline();
  updateEditorPanel();
  saveCurrentProject();
}

// Save Project JSON
async function saveCurrentProject() {
  if (!state.currentProject) return;

  const payload = {
    name: state.currentProject.name,
    audioUrl: state.currentProject.audioUrl,
    timelineStart: state.timelineStart,
    timelineEnd: state.timelineEnd,
    clips: state.clips
  };

  if (state.isServerMode) {
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(state.currentProject.name)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        await loadProjectList();
        showNotification('Project saved successfully!');
      }
    } catch (e) {
      console.error('Failed to save project:', e);
      alert('Failed to save project.');
    }
  } else {
    localStorage.setItem(`vibesync_proj_${state.currentProject.name}`, JSON.stringify(payload));
    await loadProjectList();
    showNotification('Project saved to browser cache!');
  }
}

// Export Project to a local JSON file
function exportProjectJSON() {
  if (!state.currentProject) {
    alert('No project loaded to export.');
    return;
  }

  const payload = {
    name: state.currentProject.name,
    audioUrl: state.currentProject.audioUrl,
    timelineStart: state.timelineStart,
    timelineEnd: state.timelineEnd,
    clips: state.clips
  };

  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `${state.currentProject.name}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
  showNotification('Project JSON downloaded!');
}



// Import Project from a local JSON file
function handleProjectImport(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function (evt) {
    try {
      const projectData = JSON.parse(evt.target.result);
      if (!projectData.name || !Array.isArray(projectData.clips)) {
        alert('Invalid project file format. Name and clips are required.');
        return;
      }

      state.currentProject = {
        name: projectData.name,
        audioUrl: projectData.audioUrl || '',
        timelineStart: projectData.timelineStart !== undefined ? projectData.timelineStart : 0,
        timelineEnd: projectData.timelineEnd !== undefined ? projectData.timelineEnd : 60
      };
      state.timelineStart = state.currentProject.timelineStart;
      state.timelineEnd = state.currentProject.timelineEnd;

      // Update range input values
      if (els.timelineStartInput) els.timelineStartInput.value = formatTimeStr(state.timelineStart);
      if (els.timelineEndInput) els.timelineEndInput.value = formatTimeStr(state.timelineEnd);

      state.clips = projectData.clips;
      state.selectedClipId = state.clips.length > 0 ? state.clips[0].id : null;

      // Auto-save the imported project (either to server or local storage)
      await saveCurrentProject();

      // Load audio if defined
      els.audioSelect.value = projectData.audioUrl || '';
      loadAudioTrack(projectData.audioUrl || '');

      renderTimeline();
      updateEditorPanel();

      showNotification('Project imported successfully!');
    } catch (err) {
      console.error('Failed to parse project JSON:', err);
      alert('Failed to parse JSON file.');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

function showNotification(msg) {
  const banner = document.createElement('div');
  banner.style.position = 'fixed';
  banner.style.bottom = '20px';
  banner.style.right = '20px';
  banner.style.background = 'var(--accent-blue)';
  banner.style.color = '#000';
  banner.style.padding = '0.75rem 1.5rem';
  banner.style.borderRadius = '8px';
  banner.style.boxShadow = '0 4px 15px rgba(0,229,255,0.3)';
  banner.style.zIndex = '1000';
  banner.style.fontWeight = 'bold';
  banner.innerText = msg;
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 2500);
}

// Add Clip at Playhead
function createClipAtPlayhead() {
  if (!state.currentProject) {
    alert('Please load or create a project first.');
    return;
  }

  // Sort clips by start time first to ensure neighbor detection is accurate
  state.clips.sort((a, b) => a.start - b.start);

  const playhead = state.playheadTime;
  let start = playhead;
  
  // Find immediate neighbors to check for overlap
  let minStart = state.timelineStart;
  let maxEnd = state.timelineEnd;
  
  for (let i = 0; i < state.clips.length; i++) {
    const c = state.clips[i];
    if (c.end <= playhead) {
      minStart = Math.max(minStart, c.end);
    }
    if (c.start >= playhead) {
      maxEnd = Math.min(maxEnd, c.start);
    }
  }
  
  // Clamp start to minStart (starts after previous clip ends)
  if (start < minStart) {
    start = minStart;
  }
  
  let end = Math.min(maxEnd, start + 5);
  
  if (end - start < 0.5) {
    alert('Cannot add clip here: Not enough space between existing clips (minimum 0.5s required).');
    return;
  }

  const newClip = {
    id: 'clip_' + Date.now(),
    title: 'New Clip',
    start: parseFloat(start.toFixed(2)),
    end: parseFloat(end.toFixed(2)),
    theme: 'arrival',
    preset: 'custom',
    subject: 'a scene',
    action: 'occurring',
    camera: 'static shot',
    style: 'portrait aspect ratio 9:16'
  };

  state.clips.push(newClip);
  state.clips.sort((a, b) => a.start - b.start);
  state.selectedClipId = newClip.id;
  renderTimeline();
  updateEditorPanel();
  saveCurrentProject();
}

// Delete Clip
function deleteSelectedClip() {
  if (!state.selectedClipId) return;
  state.clips = state.clips.filter(c => c.id !== state.selectedClipId);
  state.selectedClipId = null;
  renderTimeline();
  updateEditorPanel();
  saveCurrentProject();
}

// Apply Preset Values
function applyPreset(key) {
  const preset = PRESETS[key];
  if (!preset) return;

  els.clipTheme.value = preset.theme;
  els.fieldSubject.value = preset.subject;
  els.fieldAction.value = preset.action;
  els.fieldCamera.value = preset.camera;
  els.fieldStyle.value = preset.style;

  syncFormToClip();
  renderTimeline();
}

// Render Clips overlay inside timeline
function renderTimeline() {
  els.clipsLayer.innerHTML = '';

  if (state.clips.length === 0) return;

  state.clips.forEach(clip => {
    const startPct = timeToPct(clip.start);
    const widthPct = timeToPct(clip.end) - startPct;

    const clipNode = document.createElement('div');
    clipNode.className = `timeline-clip theme-${clip.theme}`;
    if (clip.id === state.selectedClipId) {
      clipNode.classList.add('selected');
    }
    clipNode.style.left = `${startPct}%`;
    clipNode.style.width = `${widthPct}%`;

    // Apply Cover Image if set
    if (clip.image) {
      clipNode.style.backgroundImage = `url(${clip.image})`;
      clipNode.style.backgroundSize = 'cover';
      clipNode.style.backgroundPosition = 'center';

      const overlay = document.createElement('div');
      overlay.style.position = 'absolute';
      overlay.style.top = '0';
      overlay.style.left = '0';
      overlay.style.right = '0';
      overlay.style.bottom = '0';
      overlay.style.background = 'rgba(10, 10, 15, 0.65)';
      overlay.style.borderRadius = '5px';
      overlay.style.pointerEvents = 'none';
      overlay.style.zIndex = '1';
      clipNode.appendChild(overlay);
    }

    // Inner details (stacked above overlay)
    const label = document.createElement('span');
    label.className = 'clip-label';
    label.innerText = clip.title || 'Untitled';
    label.style.position = 'relative';
    label.style.zIndex = '2';
    clipNode.appendChild(label);

    const time = document.createElement('span');
    time.className = 'clip-time';
    time.innerText = `${clip.start.toFixed(1)}s - ${clip.end.toFixed(1)}s`;
    time.style.position = 'relative';
    time.style.zIndex = '2';
    clipNode.appendChild(time);

    // Left Resize Handle
    const leftHandle = document.createElement('div');
    leftHandle.className = 'resize-handle left';
    leftHandle.style.zIndex = '3';
    leftHandle.addEventListener('pointerdown', (e) => startDrag(e, clip.id, 'resize-left'));
    clipNode.appendChild(leftHandle);

    // Right Resize Handle
    const rightHandle = document.createElement('div');
    rightHandle.className = 'resize-handle right';
    rightHandle.style.zIndex = '3';
    rightHandle.addEventListener('pointerdown', (e) => startDrag(e, clip.id, 'resize-right'));
    clipNode.appendChild(rightHandle);

    // Click to select/Drag to move
    clipNode.addEventListener('pointerdown', (e) => {
      if (e.target.classList.contains('resize-handle')) return;
      selectClip(clip.id);
      startDrag(e, clip.id, 'move');
    });

    els.clipsLayer.appendChild(clipNode);
  });
}

// Drag & Drop logic for clips
function startDrag(e, clipId, action) {
  e.preventDefault();
  e.stopPropagation();

  const clip = state.clips.find(c => c.id === clipId);
  if (!clip) return;

  const rect = els.timelineWrapper.getBoundingClientRect();
  const clipIndex = state.clips.findIndex(c => c.id === clipId);

  state.dragState = {
    clipId,
    action,
    clipIndex,
    startX: e.clientX,
    startLeft: clip.start,
    startRight: clip.end,
    clipDuration: clip.end - clip.start,
    timelineWidthPx: rect.width
  };

  els.timelineWrapper.setPointerCapture(e.pointerId);
}

function handlePointerMove(e) {
  if (!state.dragState) return;

  const drag = state.dragState;
  const clip = state.clips.find(c => c.id === drag.clipId);
  if (!clip) return;

  const dxPx = e.clientX - drag.startX;
  const timelineRange = state.timelineEnd - state.timelineStart;
  const dt = (dxPx / drag.timelineWidthPx) * timelineRange;

  const idx = drag.clipIndex;
  const prevClip = (idx > 0) ? state.clips[idx - 1] : null;
  const nextClip = (idx < state.clips.length - 1) ? state.clips[idx + 1] : null;

  // Snapping threshold (10 pixels translated to timeline seconds)
  const snapThresholdSecs = (10 / drag.timelineWidthPx) * timelineRange;

  if (drag.action === 'move') {
    let newStart = drag.startLeft + dt;
    let newEnd = newStart + drag.clipDuration;

    const minAllowedStart = prevClip ? prevClip.end : state.timelineStart;
    const maxAllowedEnd = nextClip ? nextClip.start : state.timelineEnd;

    // Snapping logic
    if (state.autoSnap) {
      if (Math.abs(newStart - minAllowedStart) < snapThresholdSecs) {
        newStart = minAllowedStart;
        newEnd = newStart + drag.clipDuration;
      }
      if (Math.abs(newEnd - maxAllowedEnd) < snapThresholdSecs) {
        newEnd = maxAllowedEnd;
        newStart = newEnd - drag.clipDuration;
      }
    }

    // Hard clamps for non-overlapping
    if (newStart < minAllowedStart) {
      newStart = minAllowedStart;
      newEnd = newStart + drag.clipDuration;
    }
    if (newEnd > maxAllowedEnd) {
      newEnd = maxAllowedEnd;
      newStart = newEnd - drag.clipDuration;
    }

    if (newStart < minAllowedStart) newStart = minAllowedStart;
    if (newEnd > maxAllowedEnd) newEnd = maxAllowedEnd;

    clip.start = parseFloat(newStart.toFixed(2));
    clip.end = parseFloat(newEnd.toFixed(2));
  }
  else if (drag.action === 'resize-left') {
    let newStart = drag.startLeft + dt;

    const minAllowedStart = prevClip ? prevClip.end : state.timelineStart;
    const maxStart = drag.startRight - 0.5; // minimum width of 0.5s

    // Snapping logic
    if (state.autoSnap) {
      if (Math.abs(newStart - minAllowedStart) < snapThresholdSecs) {
        newStart = minAllowedStart;
      }
    }

    // Clamp limits
    if (newStart < minAllowedStart) newStart = minAllowedStart;
    if (newStart > maxStart) newStart = maxStart;

    clip.start = parseFloat(newStart.toFixed(2));
  }
  else if (drag.action === 'resize-right') {
    let newEnd = drag.startRight + dt;

    const minEnd = drag.startLeft + 0.5; // minimum width of 0.5s
    const maxAllowedEnd = nextClip ? nextClip.start : state.timelineEnd;

    // Snapping logic
    if (state.autoSnap) {
      if (Math.abs(newEnd - maxAllowedEnd) < snapThresholdSecs) {
        newEnd = maxAllowedEnd;
      }
    }

    // Clamp limits
    if (newEnd < minEnd) newEnd = minEnd;
    if (newEnd > maxAllowedEnd) newEnd = maxAllowedEnd;

    clip.end = parseFloat(newEnd.toFixed(2));
  }

  // Update visual timeline
  renderTimeline();

  // Update editor inputs if selected
  if (state.selectedClipId === clip.id) {
    els.clipStart.value = clip.start;
    els.clipEnd.value = clip.end;
    compilePromptText(clip);
  }
}

function handlePointerUp(e) {
  if (!state.dragState) return;

  try {
    els.timelineWrapper.releasePointerCapture(e.pointerId);
  } catch (err) { }

  state.dragState = null;
  // Sort clips by start time to maintain clean index order
  state.clips.sort((a, b) => a.start - b.start);
}

// Select Clip
function selectClip(clipId) {
  state.selectedClipId = clipId;
  renderTimeline();
  updateEditorPanel();
}

// Sync Form panel to selected Clip
function updateEditorPanel() {
  if (!state.selectedClipId) {
    els.emptyState.style.display = 'flex';
    els.editorForm.style.display = 'none';
    updateViewportPreview();
    return;
  }

  els.emptyState.style.display = 'none';
  els.editorForm.style.display = 'flex';

  const clip = state.clips.find(c => c.id === state.selectedClipId);
  if (!clip) return;

  els.clipTitle.value = clip.title || '';
  els.clipStart.value = clip.start || 0;
  els.clipEnd.value = clip.end || 0;
  els.clipTheme.value = clip.theme || 'arrival';
  els.presetSelect.value = clip.preset || '';

  // Storyboard Sketch preview update
  if (clip.image) {
    els.sketchPreview.src = clip.image;
    els.sketchPreview.style.display = 'block';
    els.sketchPlaceholder.style.display = 'none';
    els.removeSketchBtn.style.display = 'inline-flex';
  } else {
    els.sketchPreview.src = '';
    els.sketchPreview.style.display = 'none';
    els.sketchPlaceholder.style.display = 'flex';
    els.removeSketchBtn.style.display = 'none';
  }

  els.fieldSubject.value = clip.subject || '';
  els.fieldAction.value = clip.action || '';
  els.fieldCamera.value = clip.camera || '';
  els.fieldStyle.value = clip.style || '';

  compilePromptText(clip);
  updateViewportPreview();
}

// Build Prompt output text
function compilePromptText(clip) {
  const vals = {
    subject: clip.subject || '',
    action: clip.action || '',
    camera: clip.camera || '',
    style: clip.style || ''
  };

  const output = `A cinematic video of ${vals.subject}, ${vals.action}, ${vals.camera}. Styling: ${vals.style}.`;
  els.promptCompiled.innerText = output;
}

// Dynamic Viewport Storyboard Preview update
function updateViewportPreview() {
  let activeClip = null;
  
  if (state.isPlaying) {
    // During active playback, show clip under playhead
    activeClip = state.clips.find(c => state.playheadTime >= c.start && state.playheadTime <= c.end);
  } else {
    // When paused, show selected clip
    activeClip = state.clips.find(c => c.id === state.selectedClipId);
  }

  if (activeClip) {
    if (activeClip.image) {
      els.viewportImage.src = activeClip.image;
      els.viewportImage.style.display = 'block';
      els.viewportPlaceholder.style.display = 'none';
    } else {
      els.viewportImage.src = '';
      els.viewportImage.style.display = 'none';
      els.viewportPlaceholder.style.display = 'flex';
    }

    // Update subtitles overlay with the compiled prompt
    const subject = activeClip.subject || '';
    const action = activeClip.action || '';
    const camera = activeClip.camera || '';
    const style = activeClip.style || '';
    
    let subtitleText = '';
    if (subject || action || camera) {
      subtitleText = `A cinematic video of ${subject}, ${action}, ${camera}.`;
      if (style) subtitleText += ` Styling: ${style}.`;
    } else {
      subtitleText = activeClip.title || 'Untitled';
    }
    
    els.viewportSubtitles.innerText = subtitleText;
    els.viewportSubtitles.style.display = 'block';
  } else {
    // No active or selected clip
    els.viewportImage.src = '';
    els.viewportImage.style.display = 'none';
    els.viewportPlaceholder.style.display = 'flex';
    els.viewportSubtitles.innerText = 'Ready to Sync';
  }
}

function renderDock() {
  const panels = {
    'panel-settings': { element: els.panelSettings, title: 'Clip Settings' },
    'panel-prompt': { element: els.panelPrompt, title: 'Compiled Prompt' },
    'panel-preview': { element: els.panelPreview, title: 'Storyboard Viewport' }
  };

  // Render each slot (1, 2, 3)
  for (let slotIdx = 1; slotIdx <= 3; slotIdx++) {
    const slotEl = els.dockSlots[slotIdx - 1];
    if (!slotEl) continue;

    const headerEl = slotEl.querySelector('.dock-header');
    const contentEl = slotEl.querySelector('.dock-content');
    if (!headerEl || !contentEl) continue;

    // Find all panels in this slot
    const slotPanels = Object.keys(state.dock).filter(pId => state.dock[pId] === slotIdx);

    if (slotPanels.length === 0) {
      // Hide the slot column
      slotEl.style.display = 'none';
      continue;
    }

    // Show the slot column
    slotEl.style.display = 'flex';

    // Clear headers
    headerEl.innerHTML = '';
    
    // Ensure the active tab in this slot is one of the panels docked here
    let activePanelId = state.activeTabInSlot[slotIdx];
    if (!slotPanels.includes(activePanelId)) {
      activePanelId = slotPanels[0];
      state.activeTabInSlot[slotIdx] = activePanelId;
    }

    // Draw tab headers
    slotPanels.forEach(pId => {
      const pInfo = panels[pId];
      const tabBtn = document.createElement('div');
      tabBtn.className = 'dock-tab';
      if (pId === activePanelId) {
        tabBtn.classList.add('active');
      }
      tabBtn.innerText = pInfo.title;
      tabBtn.setAttribute('draggable', 'true');
      tabBtn.dataset.panelId = pId;

      // Drag and drop events for the tab itself
      tabBtn.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', pId);
        tabBtn.style.opacity = '0.5';
      });

      tabBtn.addEventListener('dragend', () => {
        tabBtn.style.opacity = '1';
      });

      // Tab click to select active tab
      tabBtn.addEventListener('click', () => {
        state.activeTabInSlot[slotIdx] = pId;
        renderDock();
      });

      headerEl.appendChild(tabBtn);
    });

    // Move active panel to content
    contentEl.innerHTML = '';
    const activePanel = panels[activePanelId].element;
    contentEl.appendChild(activePanel);
    activePanel.style.display = 'flex';
  }
}

function setupDockLayout() {
  const savedConfig = localStorage.getItem('vibesync_dock_config');
  if (savedConfig) {
    try {
      const parsed = JSON.parse(savedConfig);
      if (parsed['panel-settings'] && parsed['panel-prompt'] && parsed['panel-preview']) {
        state.dock = parsed;
      }
    } catch (e) {
      console.error('Failed to parse saved dock config:', e);
    }
  }
}

// Sync input changes from HTML form back to the Clip state
function syncFormToClip() {
  const clip = state.clips.find(c => c.id === state.selectedClipId);
  if (!clip) return;

  const idx = state.clips.findIndex(c => c.id === state.selectedClipId);
  const prevClip = (idx > 0) ? state.clips[idx - 1] : null;
  const nextClip = (idx < state.clips.length - 1) ? state.clips[idx + 1] : null;

  const minAllowedStart = prevClip ? prevClip.end : state.timelineStart;
  const maxAllowedEnd = nextClip ? nextClip.start : state.timelineEnd;

  let startVal = parseFloat(els.clipStart.value);
  if (isNaN(startVal)) startVal = clip.start;
  let endVal = parseFloat(els.clipEnd.value);
  if (isNaN(endVal)) endVal = clip.end;

  // Enforce boundaries
  if (startVal < minAllowedStart) startVal = minAllowedStart;
  if (endVal > maxAllowedEnd) endVal = maxAllowedEnd;

  // Enforce minimum length of 0.5s
  if (endVal < startVal + 0.5) {
    if (document.activeElement === els.clipStart) {
      startVal = endVal - 0.5;
      if (startVal < minAllowedStart) {
        startVal = minAllowedStart;
        endVal = startVal + 0.5;
      }
    } else {
      endVal = startVal + 0.5;
      if (endVal > maxAllowedEnd) {
        endVal = maxAllowedEnd;
        startVal = endVal - 0.5;
      }
    }
  }

  clip.start = parseFloat(startVal.toFixed(2));
  clip.end = parseFloat(endVal.toFixed(2));

  // Sync inputs back to clean clamped values
  els.clipStart.value = clip.start;
  els.clipEnd.value = clip.end;

  clip.title = els.clipTitle.value;
  clip.theme = els.clipTheme.value;
  clip.preset = els.presetSelect.value;

  clip.subject = els.fieldSubject.value;
  clip.action = els.fieldAction.value;
  clip.camera = els.fieldCamera.value;
  clip.style = els.fieldStyle.value;

  compilePromptText(clip);
  updateViewportPreview();
}

// Copy prompt clipboard helper
function copyCompiledPrompt() {
  const text = els.promptCompiled.innerText;
  navigator.clipboard.writeText(text).then(() => {
    const orig = els.copyBtn.innerHTML;
    els.copyBtn.innerHTML = '✓ Copied!';
    setTimeout(() => {
      els.copyBtn.innerHTML = orig;
    }, 1500);
  }).catch(err => {
    alert('Failed to copy to clipboard: ' + err);
  });
}

// Storyboard Sketch Handlers
function handleSketchUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (evt) {
    const rawDataUrl = evt.target.result;
    // Resize and compress the image before saving
    resizeImage(rawDataUrl, (resizedDataUrl) => {
      const clip = state.clips.find(c => c.id === state.selectedClipId);
      if (clip) {
        clip.image = resizedDataUrl;
        updateEditorPanel();
        renderTimeline();
        saveCurrentProject();
      }
    });
  };
  reader.readAsDataURL(file);
  e.target.value = '';
}

function resizeImage(dataUrl, callback) {
  const img = new Image();
  img.onload = () => {
    const maxDim = 480; // Target max dimension for layout thumbnail
    let w = img.width;
    let h = img.height;

    if (w > maxDim || h > maxDim) {
      if (w > h) {
        h = Math.round((h * maxDim) / w);
        w = maxDim;
      } else {
        w = Math.round((w * maxDim) / h);
        h = maxDim;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);

    // Compress to JPEG with 0.7 quality factor
    const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7);
    callback(compressedDataUrl);
  };
  img.src = dataUrl;
}

function removeSketch() {
  const clip = state.clips.find(c => c.id === state.selectedClipId);
  if (clip) {
    delete clip.image;
    updateEditorPanel();
    renderTimeline();
    saveCurrentProject();
  }
}
