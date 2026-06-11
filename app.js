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
  localAudios: {} // stores mapping of filename to object URL
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
  relinkBtn: document.getElementById('relink-btn')
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

// Initialize app
window.addEventListener('DOMContentLoaded', async () => {
  setupAudioElement();
  await checkServerConnection();
  await loadAudioList();
  await loadProjectList();

  setupEventListeners();
  renderRuler();
  renderTimeline();
});

// Setup simple Audio element
function setupAudioElement() {
  state.audioElement = new Audio();
  state.audioElement.addEventListener('timeupdate', () => {
    state.playheadTime = state.audioElement.currentTime;
    updatePlayheadPosition();
    updateTimeDisplay();
  });
  state.audioElement.addEventListener('ended', () => {
    state.isPlaying = false;
    els.playBtn.innerHTML = '▶';
  });
  state.audioElement.addEventListener('loadedmetadata', () => {
    state.audioDuration = state.audioElement.duration || 60;
    renderRuler();
    renderTimeline();
    analyzeAndDrawWaveform();
  });
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
      audioUrl: projectData.audioUrl || ''
    };
    state.clips = projectData.clips || [];
    state.selectedClipId = null;

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
  const step = Math.ceil(leftChannel.length / width);
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
    let min = 1.0;
    let max = -1.0;
    for (let j = 0; j < step; j++) {
      const datum = leftChannel[i * step + j];
      if (datum < min) min = datum;
      if (datum > max) max = datum;
    }
    // Draw vertical bars
    ctx.lineTo(i, (1 + min) * amp + (height / 2 - amp));
    ctx.lineTo(i, (1 + max) * amp + (height / 2 - amp));
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
  const duration = state.audioDuration;
  const width = els.ruler.getBoundingClientRect().width || 800;

  // Determine tick interval based on audio length
  let step = 5;
  if (duration <= 10) step = 1;
  else if (duration <= 30) step = 2;
  else if (duration <= 90) step = 5;
  else step = 10;

  for (let t = 0; t <= duration; t += step) {
    const leftPct = (t / duration) * 100;
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
    state.playheadTime = Math.max(0, state.playheadTime - 1.0);
    state.audioElement.currentTime = state.playheadTime;
    updatePlayheadPosition();
    updateTimeDisplay();
  });

  els.skipForwardBtn.addEventListener('click', () => {
    if (!state.currentAudio) return;
    state.playheadTime = Math.min(state.audioDuration, state.playheadTime + 1.0);
    state.audioElement.currentTime = state.playheadTime;
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
    state.audioElement.pause();
    state.isPlaying = false;
    els.playBtn.innerHTML = '▶';
  } else {
    state.audioContext?.resume();
    state.audioElement.play().then(() => {
      state.isPlaying = true;
      els.playBtn.innerHTML = '❚❚';
    }).catch(err => {
      console.error('Play failed:', err);
    });
  }
}

// Seek by clicking timeline
function handleTimelineSeek(e) {
  if (!state.audioDuration) return;
  const rect = els.timelineWrapper.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const pct = clickX / rect.width;
  const targetTime = Math.max(0, Math.min(state.audioDuration, pct * state.audioDuration));

  state.playheadTime = targetTime;
  state.audioElement.currentTime = targetTime;
  updatePlayheadPosition();
  updateTimeDisplay();
}

// Playhead location updates
function updatePlayheadPosition() {
  if (!state.audioDuration) return;
  const pct = (state.playheadTime / state.audioDuration) * 100;
  els.playhead.style.left = `${pct}%`;
}

function updateTimeDisplay() {
  const cur = formatTime(state.playheadTime);
  const tot = formatTime(state.audioDuration);
  els.timeDisplay.innerText = `${cur} / ${tot}`;
}

function formatTime(secs) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  const ms = Math.floor((secs % 1) * 100);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
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

  state.currentProject = {
    name: cleanName,
    audioUrl: els.audioSelect.value || ''
  };

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
        audioUrl: projectData.audioUrl || ''
      };
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

  const start = Math.floor(state.playheadTime);
  const end = Math.min(state.audioDuration, start + 5);

  const newClip = {
    id: 'clip_' + Date.now(),
    title: 'New Clip',
    start: start,
    end: end,
    theme: 'arrival',
    preset: 'custom',
    subject: 'a scene',
    action: 'occurring',
    camera: 'static shot',
    style: 'portrait aspect ratio 9:16'
  };

  state.clips.push(newClip);
  state.selectedClipId = newClip.id;
  renderTimeline();
  updateEditorPanel();
}

// Delete Clip
function deleteSelectedClip() {
  if (!state.selectedClipId) return;
  state.clips = state.clips.filter(c => c.id !== state.selectedClipId);
  state.selectedClipId = null;
  renderTimeline();
  updateEditorPanel();
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

  const duration = state.audioDuration;

  state.clips.forEach(clip => {
    const startPct = (clip.start / duration) * 100;
    const widthPct = ((clip.end - clip.start) / duration) * 100;

    const clipNode = document.createElement('div');
    clipNode.className = `timeline-clip theme-${clip.theme}`;
    if (clip.id === state.selectedClipId) {
      clipNode.classList.add('selected');
    }
    clipNode.style.left = `${startPct}%`;
    clipNode.style.width = `${widthPct}%`;

    // Inner details
    const label = document.createElement('span');
    label.className = 'clip-label';
    label.innerText = clip.title || 'Untitled';
    clipNode.appendChild(label);

    const time = document.createElement('span');
    time.className = 'clip-time';
    time.innerText = `${clip.start.toFixed(1)}s - ${clip.end.toFixed(1)}s`;
    clipNode.appendChild(time);

    // Left Resize Handle
    const leftHandle = document.createElement('div');
    leftHandle.className = 'resize-handle left';
    leftHandle.addEventListener('pointerdown', (e) => startDrag(e, clip.id, 'resize-left'));
    clipNode.appendChild(leftHandle);

    // Right Resize Handle
    const rightHandle = document.createElement('div');
    rightHandle.className = 'resize-handle right';
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

  state.dragState = {
    clipId,
    action,
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
  const dt = (dxPx / drag.timelineWidthPx) * state.audioDuration;

  if (drag.action === 'move') {
    let newStart = drag.startLeft + dt;
    let newEnd = newStart + drag.clipDuration;

    // Bounds check
    if (newStart < 0) {
      newStart = 0;
      newEnd = drag.clipDuration;
    }
    if (newEnd > state.audioDuration) {
      newEnd = state.audioDuration;
      newStart = newEnd - drag.clipDuration;
    }

    clip.start = parseFloat(newStart.toFixed(2));
    clip.end = parseFloat(newEnd.toFixed(2));
  }
  else if (drag.action === 'resize-left') {
    let newStart = drag.startLeft + dt;
    if (newStart < 0) newStart = 0;
    if (newStart > drag.startRight - 0.5) newStart = drag.startRight - 0.5; // min 0.5s width

    clip.start = parseFloat(newStart.toFixed(2));
  }
  else if (drag.action === 'resize-right') {
    let newEnd = drag.startRight + dt;
    if (newEnd > state.audioDuration) newEnd = state.audioDuration;
    if (newEnd < drag.startLeft + 0.5) newEnd = drag.startLeft + 0.5; // min 0.5s width

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

  els.fieldSubject.value = clip.subject || '';
  els.fieldAction.value = clip.action || '';
  els.fieldCamera.value = clip.camera || '';
  els.fieldStyle.value = clip.style || '';

  compilePromptText(clip);
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

// Sync input changes from HTML form back to the Clip state
function syncFormToClip() {
  const clip = state.clips.find(c => c.id === state.selectedClipId);
  if (!clip) return;

  clip.title = els.clipTitle.value;
  clip.start = Math.max(0, parseFloat(els.clipStart.value) || 0);
  clip.end = Math.min(state.audioDuration, parseFloat(els.clipEnd.value) || 0);
  clip.theme = els.clipTheme.value;
  clip.preset = els.presetSelect.value;

  clip.subject = els.fieldSubject.value;
  clip.action = els.fieldAction.value;
  clip.camera = els.fieldCamera.value;
  clip.style = els.fieldStyle.value;

  compilePromptText(clip);
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
