let buzzerTimer;
const buzzer = document.getElementById("buzzer");
let logs = [];
let measurementPaused = false;
let measurementBuffer = []; // buffered readings while paused

// Color settings with defaults
const defaultColors = {
  safe: "#00ff00",
  caution: "#ffff00",
  danger: "#ff0000"
};

// Distance threshold defaults (in cm)
const defaultThresholds = {
  danger: 50,    // 0-50cm = Danger
  caution: 100   // 50-100cm = Caution, 100+cm = Safe
};

let userColors = { ...defaultColors };
let thresholds = { ...defaultThresholds };

function updateMeasurementButton() {
  const btn = document.getElementById("measurementBtn");
  if (!btn) return;
  btn.innerText = `🔌 Measurement: ${measurementPaused ? "Off" : "On"}` +
                (measurementPaused && measurementBuffer.length ? ` (${measurementBuffer.length})` : "");
}


// Load settings from localStorage on page load
window.addEventListener("load", () => {
  const savedLogs = localStorage.getItem("distanceLogs");
  if (savedLogs) {
    logs = JSON.parse(savedLogs);
  }

  // Load theme setting
  const darkModeEnabled = localStorage.getItem("darkMode") === "true";
  if (darkModeEnabled) {
    document.body.classList.add("dark-mode");
    document.getElementById("darkModeToggle").checked = true;
  }

  // Load color settings
  const savedColors = localStorage.getItem("zoneColors");
  if (savedColors) {
    userColors = JSON.parse(savedColors);
  } else {
    userColors = { ...defaultColors };
  }

  // Load threshold settings
  const savedThresholds = localStorage.getItem("distanceThresholds");
  if (savedThresholds) {
    thresholds = JSON.parse(savedThresholds);
  } else {
    thresholds = { ...defaultThresholds };
  }

  // Apply colors
  document.getElementById("safeColor").value = userColors.safe;
  document.getElementById("cautionColor").value = userColors.caution;
  document.getElementById("dangerColor").value = userColors.danger;

  // Apply thresholds
  document.getElementById("dangerThreshold").value = thresholds.danger;
  document.getElementById("cautionThreshold").value = thresholds.caution;
  document.getElementById("dangerValue").innerText = thresholds.danger;
  document.getElementById("cautionValue").innerText = thresholds.caution;

  // Load measurement paused state and buffer
  const pausedSaved = localStorage.getItem("measurementPaused") === "true";
  measurementPaused = pausedSaved;
  const measurementToggleEl = document.getElementById("measurementToggle");
  if (measurementToggleEl) measurementToggleEl.checked = measurementPaused;
  const savedBuffer = localStorage.getItem("measurementBuffer");
  measurementBuffer = savedBuffer ? JSON.parse(savedBuffer) : [];
  const bufferCountEl = document.getElementById("bufferCount");
  if (bufferCountEl) bufferCountEl.innerText = measurementBuffer.length;

  updateColorDisplays();
  updateMeasurementButton();
  initializeSettings();
});

function flushBufferIntoLogs() {
  if (!measurementBuffer || measurementBuffer.length === 0) return;
  measurementBuffer.forEach(buf => {
    const d = Number(buf.distance);
    let status = "";
    if (d > thresholds.caution) status = "Safe";
    else if (d > thresholds.danger) status = "Caution";
    else status = "Danger";
    const t = new Date(buf.timestamp);
    logs.push({ time: t.toLocaleTimeString(), distance: d, status: status, timestamp: buf.timestamp });
    if (logs.length > 100) logs.shift();
  });
  measurementBuffer = [];
  localStorage.setItem("measurementBuffer", JSON.stringify(measurementBuffer));
  localStorage.setItem("distanceLogs", JSON.stringify(logs));
  const bufferCountEl = document.getElementById("bufferCount");
  if (bufferCountEl) bufferCountEl.innerText = 0;
  updateMeasurementButton();
}

async function updateDistance() {
  // if paused don't even request or sound buzzer
  if (measurementPaused) {
    if (buzzerTimer) {
      clearInterval(buzzerTimer);
      buzzerTimer = null;
      buzzer.pause();
      buzzer.currentTime = 0;
    }
    return;
  }
  try {
    const response = await fetch("/distance");
    const data = await response.json();
    const distance = Number(data.distance);

    const statusText = document.getElementById("status");
    const resultBox = document.getElementById("resultBox");
    const distanceDisplay = document.getElementById("distanceValue");
    const distanceBar = document.getElementById("distanceBar");

    const now = new Date();

    // If measurements are paused, buffer the reading and return early
    if (measurementPaused) {
      // make sure buzzer stopped in case pause was hit mid-cycle
      if (buzzerTimer) {
        clearInterval(buzzerTimer);
        buzzerTimer = null;
        buzzer.pause();
        buzzer.currentTime = 0;
      }
      measurementBuffer.push({ distance: distance, timestamp: now.getTime(), iso: now.toISOString() });
      localStorage.setItem("measurementBuffer", JSON.stringify(measurementBuffer));
      const bufferCountEl = document.getElementById("bufferCount");
      if (bufferCountEl) bufferCountEl.innerText = measurementBuffer.length;
      return;
    }

    // If there's buffered data and we're now active, flush it first (no buzzer for buffered logs)
    if (measurementBuffer.length > 0) {
      flushBufferIntoLogs();
    }

    distanceDisplay.innerText = `Distance: ${distance} cm`;

    // Update progress bar (0cm = full red, 150cm = empty)
    let barWidth = Math.min(100, Math.max(0, (150 - distance) / 150 * 100));
    distanceBar.style.width = `${barWidth}%`;

    // Clear previous buzzer intervals
    if (buzzerTimer) {
      clearInterval(buzzerTimer);
      buzzerTimer = null;
      buzzer.pause();
      buzzer.currentTime = 0;
    }

    // Status logic with custom thresholds
    let status = "";
    if (distance > thresholds.caution) {
      statusText.innerText = "Safe";
      resultBox.style.backgroundColor = userColors.safe;
      resultBox.className = "";
      status = "Safe";
    } else if (distance > thresholds.danger) {
      statusText.innerText = "Caution";
      resultBox.style.backgroundColor = userColors.caution;
      resultBox.className = "yellow";
      buzzerTimer = setInterval(() => buzzer.play(), 600);
      status = "Caution";
    } else {
      statusText.innerText = "Danger!";
      resultBox.style.backgroundColor = userColors.danger;
      resultBox.className = "red";
      buzzerTimer = setInterval(() => buzzer.play(), 200);
      status = "Danger";
    }

    // Log the reading
    const timeString = now.toLocaleTimeString();
    logs.push({
      time: timeString,
      distance: distance,
      status: status,
      timestamp: now.getTime()
    });

    // Keep only last 100 logs
    if (logs.length > 100) {
      logs.shift();
    }

    // Save logs to localStorage
    localStorage.setItem("distanceLogs", JSON.stringify(logs));

  } catch (err) {
    console.error(err);
  }
}

setInterval(updateDistance, 500);

// Tab navigation functionality
function switchTab(targetId) {
  document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
  const t = document.getElementById(targetId);
  if (t) t.classList.add('active');
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.target === targetId);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.target));
  });
  const bizBtn = document.getElementById('businessBtn');
  if (bizBtn) {
    bizBtn.addEventListener('click', () => switchTab('businessSection'));
  }
});

// ============ PERSONAL NOTES FUNCTIONALITY ============
let personalData = {}; // keyed by date -> array of notes
let editingNoteId = null;
const noteDateInput = document.getElementById('noteDate');
const noteTimeInput = document.getElementById('noteTime');
const noteEventInput = document.getElementById('noteEvent');
const noteHighlightInput = document.getElementById('noteHighlight');
const saveNoteBtn = document.getElementById('saveNoteBtn');
const cancelNoteBtn = document.getElementById('cancelNoteBtn');
const noteDateView = document.getElementById('noteDateView');
const notesContainer = document.getElementById('notesContainer');

function loadPersonalData() {
  const s = localStorage.getItem('personalData');
  personalData = s ? JSON.parse(s) : {};
}
function savePersonalData() {
  localStorage.setItem('personalData', JSON.stringify(personalData));
}
function formatTimeNow() {
  const d = new Date();
  return d.toTimeString().slice(0,5);
}
function setDefaultsForNote() {
  const today = new Date().toISOString().slice(0,10);
  noteDateInput.value = today;
  noteTimeInput.value = formatTimeNow();
  noteDateView.value = today;
  noteEventInput.value = '';
  noteHighlightInput.value = '';
  editingNoteId = null;
}
function renderNotesFor(date) {
  const list = personalData[date] || [];
  if (list.length === 0) {
    notesContainer.innerHTML = '<p>No notes for this date.</p>';
    return;
  }
  notesContainer.innerHTML = list.map(n => `
    <div class="note-entry" data-id="${n.id}">
      <div><strong>${n.time}</strong> - ${n.event}</div>
      <div><em>${n.highlight}</em></div>
      <div class="biz-actions">
        <button class="edit-note">Edit</button>
        <button class="delete-note">Delete</button>
      </div>
    </div>
  `).join('');
  notesContainer.querySelectorAll('.edit-note').forEach(btn => {
    btn.addEventListener('click', ev => {
      const id = ev.target.closest('.note-entry').dataset.id;
      const entry = (personalData[date] || []).find(x => String(x.id) === String(id));
      if (entry) {
        noteDateInput.value = date;
        noteTimeInput.value = entry.time;
        noteEventInput.value = entry.event;
        noteHighlightInput.value = entry.highlight;
        editingNoteId = entry.id;
      }
    });
  });
  notesContainer.querySelectorAll('.delete-note').forEach(btn => {
    btn.addEventListener('click', ev => {
      const id = ev.target.closest('.note-entry').dataset.id;
      if (!confirm('Delete this note?')) return;
      personalData[date] = (personalData[date] || []).filter(x => String(x.id) !== String(id));
      savePersonalData();
      renderNotesFor(date);
    });
  });
}

// initialize personal area
loadPersonalData();
setDefaultsForNote();
noteDateView.addEventListener('change', e => renderNotesFor(e.target.value));
saveNoteBtn.addEventListener('click', () => {
  const date = noteDateInput.value;
  if (!date) return alert('Pick a date');
  const time = noteTimeInput.value || formatTimeNow();
  const event = noteEventInput.value.trim() || 'No title';
  const highlight = noteHighlightInput.value.trim() || '';
  personalData[date] = personalData[date] || [];
  const entry = { id: editingNoteId || Date.now(), date, time, event, highlight };
  if (editingNoteId) {
    personalData[date] = personalData[date].map(x => x.id === editingNoteId ? entry : x);
  } else {
    personalData[date].push(entry);
  }
  savePersonalData();
  renderNotesFor(date);
  setDefaultsForNote();
});
cancelNoteBtn.addEventListener('click', () => {
  setDefaultsForNote();
});

// set default view for notes
renderNotesFor(noteDateView.value || noteDateInput.value);


// ============ SETTINGS FUNCTIONALITY ============
function initializeSettings() {
  const settingsBtn = document.getElementById("settingsBtn");
  const settingsModal = document.getElementById("settingsModal");
  const closeSettingsBtn = settingsModal.querySelector(".close-btn");
  const darkModeToggle = document.getElementById("darkModeToggle");
  const safeColorInput = document.getElementById("safeColor");
  const cautionColorInput = document.getElementById("cautionColor");
  const dangerColorInput = document.getElementById("dangerColor");
  const dangerThresholdInput = document.getElementById("dangerThreshold");
  const cautionThresholdInput = document.getElementById("cautionThreshold");
  const resetBtn = document.getElementById("resetSettingsBtn");
  const measurementToggle = document.getElementById("measurementToggle");
  const flushBufferBtn = document.getElementById("flushBufferBtn");
  const clearBufferBtn = document.getElementById("clearBufferBtn");
  const bufferCountEl = document.getElementById("bufferCount");

  console.log("Settings initialized", { darkModeToggle, closeSettingsBtn, measurementToggle });

  // Settings button
  settingsBtn.addEventListener("click", () => {
    settingsModal.classList.add("active");
  });

  // Close settings
  if (closeSettingsBtn) {
    closeSettingsBtn.addEventListener("click", () => {
      settingsModal.classList.remove("active");
    });
  }

  // Click outside modal to close
  window.addEventListener("click", (e) => {
    if (e.target === settingsModal) {
      settingsModal.classList.remove("active");
    }
  });

  // Dark mode toggle
  if (darkModeToggle) {
    darkModeToggle.addEventListener("change", (e) => {
      console.log("Dark mode toggle changed to:", e.target.checked);
      if (e.target.checked) {
        document.body.classList.add("dark-mode");
        localStorage.setItem("darkMode", "true");
      } else {
        document.body.classList.remove("dark-mode");
        localStorage.setItem("darkMode", "false");
      }
      // Trigger reflow to ensure smooth animation
      void document.body.offsetHeight;
    });
  } else {
    console.error("darkModeToggle element not found!");
  }

  // Measurement pause toggle and buffer controls
  if (measurementToggle) {
    measurementToggle.addEventListener('change', (e) => {
      measurementPaused = !!e.target.checked;
      localStorage.setItem('measurementPaused', measurementPaused ? 'true' : 'false');
      if (measurementPaused) {
        // stop any buzzer already running
        if (buzzerTimer) {
          clearInterval(buzzerTimer);
          buzzerTimer = null;
          buzzer.pause();
          buzzer.currentTime = 0;
        }
        fetch(`/control?measure=off`).catch(()=>{});
      } else {
        // flush buffered readings into logs (no buzzer)
        flushBufferIntoLogs();
        fetch(`/control?measure=on`).catch(()=>{});
      }
      if (bufferCountEl) bufferCountEl.innerText = measurementBuffer.length;
      updateMeasurementButton();
    });
  }

  if (clearBufferBtn) {
    clearBufferBtn.addEventListener('click', () => {
      if (!confirm('Clear buffered readings?')) return;
      measurementBuffer = [];
      localStorage.setItem('measurementBuffer', JSON.stringify(measurementBuffer));
      if (bufferCountEl) bufferCountEl.innerText = 0;
      updateMeasurementButton();
    });
  }

  if (flushBufferBtn) {
    flushBufferBtn.addEventListener('click', () => {
      flushBufferIntoLogs();
      alert('Buffered readings flushed to logs.');
      updateMeasurementButton();
    });
  }

  // Header measurement toggle
  const measurementBtn = document.getElementById("measurementBtn");
  if (measurementBtn) {
    measurementBtn.addEventListener('click', () => {
      measurementPaused = !measurementPaused;
      localStorage.setItem('measurementPaused', measurementPaused ? 'true' : 'false');
      const mt = document.getElementById("measurementToggle");
      if (mt) mt.checked = measurementPaused;
      if (measurementPaused) {
        if (buzzerTimer) {
          clearInterval(buzzerTimer);
          buzzerTimer = null;
          buzzer.pause();
          buzzer.currentTime = 0;
        }
        fetch(`/control?measure=off`).catch(()=>{});
      } else {
        flushBufferIntoLogs();
        fetch(`/control?measure=on`).catch(()=>{});
      }
      if (bufferCountEl) bufferCountEl.innerText = measurementBuffer.length;
      updateMeasurementButton();
    });
  }

  // Color picker events
  safeColorInput.addEventListener("change", (e) => {
    userColors.safe = e.target.value;
    saveColors();
    updateDistance(); // Update display immediately
    updateColorDisplays();
  });

  cautionColorInput.addEventListener("change", (e) => {
    userColors.caution = e.target.value;
    saveColors();
    updateDistance(); // Update display immediately
    updateColorDisplays();
  });

  dangerColorInput.addEventListener("change", (e) => {
    userColors.danger = e.target.value;
    saveColors();
    updateDistance(); // Update display immediately
    updateColorDisplays();
  });

  // Real-time color display update (on input)
  safeColorInput.addEventListener("input", updateColorDisplays);
  cautionColorInput.addEventListener("input", updateColorDisplays);
  dangerColorInput.addEventListener("input", updateColorDisplays);

  // Threshold input listeners
  dangerThresholdInput.addEventListener("input", (e) => {
    document.getElementById("dangerValue").innerText = e.target.value;
  });

  dangerThresholdInput.addEventListener("change", (e) => {
    thresholds.danger = Number(e.target.value);
    saveThresholds();
    updateDistance(); // Update display immediately
    console.log("Danger threshold updated to:", thresholds.danger);
  });

  cautionThresholdInput.addEventListener("input", (e) => {
    document.getElementById("cautionValue").innerText = e.target.value;
  });

  cautionThresholdInput.addEventListener("change", (e) => {
    thresholds.caution = Number(e.target.value);
    saveThresholds();
    updateDistance(); // Update display immediately
    console.log("Caution threshold updated to:", thresholds.caution);
  });

  // Reset button
  resetBtn.addEventListener("click", () => {
    if (confirm("Reset all settings to defaults?")) {
      userColors = { ...defaultColors };
      thresholds = { ...defaultThresholds };
      saveColors();
      saveThresholds();
      safeColorInput.value = defaultColors.safe;
      cautionColorInput.value = defaultColors.caution;
      dangerColorInput.value = defaultColors.danger;
      dangerThresholdInput.value = defaultThresholds.danger;
      cautionThresholdInput.value = defaultThresholds.caution;
      document.getElementById("dangerValue").innerText = defaultThresholds.danger;
      document.getElementById("cautionValue").innerText = defaultThresholds.caution;
      updateColorDisplays();
      updateDistance();
      console.log("Settings reset to defaults");
    }
  });
}

function updateColorDisplays() {
  document.getElementById("safeColorDisplay").style.backgroundColor = document.getElementById("safeColor").value;
  document.getElementById("cautionColorDisplay").style.backgroundColor = document.getElementById("cautionColor").value;
  document.getElementById("dangerColorDisplay").style.backgroundColor = document.getElementById("dangerColor").value;
}

function saveColors() {
  localStorage.setItem("zoneColors", JSON.stringify(userColors));
}

function saveThresholds() {
  localStorage.setItem("distanceThresholds", JSON.stringify(thresholds));
}

// ============ HELP MODAL FUNCTIONALITY ============
const helpBtn = document.getElementById("helpBtn");
const helpModal = document.getElementById("helpModal");
const helpCloseBtn = helpModal.querySelector(".close-btn");

helpBtn.addEventListener("click", () => {
  helpModal.classList.add("active");
});

if (helpCloseBtn) {
  helpCloseBtn.addEventListener("click", () => {
    helpModal.classList.remove("active");
  });
}

// Close help modal when clicking outside
window.addEventListener("click", (e) => {
  if (e.target === helpModal) {
    helpModal.classList.remove("active");
  }
});

// FAQ Toggle functionality
document.querySelectorAll(".faq-toggle").forEach((toggle) => {
  toggle.addEventListener("click", () => {
    const faqItem = toggle.parentElement;
    faqItem.classList.toggle("active");
    toggle.classList.toggle("active");
  });
});

// Voice Guide functionality
const voiceGuideBtn = document.getElementById("voiceGuideBtn");
const voiceStatus = document.getElementById("voiceStatus");

voiceGuideBtn.addEventListener("click", () => {
  voiceGuideBtn.disabled = true;
  voiceStatus.innerText = "🔊 Playing voice instructions...";
  
  // Create text-to-speech guide
  const voiceGuideText = `
    Welcome to the UNIGUIDE Guide.
    
    This device helps you detect obstacles using ultrasonic sensors and provides audio feedback.
    
    Color codes: Green means safe, no obstacles detected. Yellow means caution, an obstacle is between 50 and 100 centimeters away. Red means danger, an obstacle is very close, less than 50 centimeters away.
    
    Buzzer alerts: In the caution zone, you will hear slow beeping every 600 milliseconds. In the danger zone, you will hear fast beeping every 200 milliseconds. Listen carefully to these alerts.
    
    Safety tips: Always scan ahead slowly with the stick. Move it side to side to detect obstacles. Practice in safe areas before using in unfamiliar places. Keep the sensor clean for accurate readings. Do not rely solely on this device. Always be cautious and aware of your surroundings.
    
    To customize settings: Click the settings button to adjust colors, distance thresholds, and toggle dark mode.
    
    To view your activity logs: Click the logs button to see your distance reading history.
    
    Thank you for using UNIGUIDE. Stay safe!
  `;
  
  // Use Web Speech API if available
  if ("speechSynthesis" in window) {
    const utterance = new SpeechSynthesisUtterance(voiceGuideText);
    utterance.rate = 0.9;
    utterance.pitch = 1;
    
    utterance.onend = () => {
      voiceStatus.innerText = "✅ Voice instructions completed!";
      voiceGuideBtn.disabled = false;
      setTimeout(() => {
        voiceStatus.innerText = "";
      }, 2000);
    };
    
    utterance.onerror = () => {
      voiceStatus.innerText = "❌ Voice not available on this browser";
      voiceGuideBtn.disabled = false;
    };
    
    speechSynthesis.cancel(); // Cancel any ongoing speech
    speechSynthesis.speak(utterance);
  } else {
    voiceStatus.innerText = "❌ Voice instructions not supported on this browser";
    voiceGuideBtn.disabled = false;
  }
});

    // ============ BUSINESS DATA FUNCTIONALITY ============
    let businessData = {};
    const businessBtn = document.getElementById("businessBtn");
    const personNameInput = document.getElementById("personName");
    const businessDateInput = document.getElementById("businessDate");
    const businessTimeInput = document.getElementById("businessTime");
    const businessPlaceInput = document.getElementById("businessPlace");
    const businessClosenessInput = document.getElementById("businessCloseness");
    const saveBusinessBtn = document.getElementById("saveBusinessBtn");
    const cancelBusinessBtn = document.getElementById("cancelBusinessBtn");
    const businessDateView = document.getElementById("businessDateView");
    const businessList = document.getElementById("businessList");

    let editingEntryId = null;

    function loadBusinessData() {
      const s = localStorage.getItem("businessData");
      businessData = s ? JSON.parse(s) : {};
      // migrate any old arrays to new structure
      Object.keys(businessData).forEach(k => {
        if (Array.isArray(businessData[k])) {
          businessData[k] = { entries: businessData[k], stats: {} };
        }
      });
      // Recompute stats for all dates after load
      Object.keys(businessData).forEach(date => {
        recomputeStatsFor(date);
      });
    }

    function saveBusinessData() {
      localStorage.setItem("businessData", JSON.stringify(businessData));
    }

    function formatTimeNow() {
      const d = new Date();
      return d.toTimeString().slice(0,5);
    }

    function setDefaultsForBusinessForm() {
      const today = new Date().toISOString().slice(0,10);
      businessDateInput.value = today;
      businessTimeInput.value = formatTimeNow();
      businessDateView.value = today;
      personNameInput.value = "";
      businessPlaceInput.value = "";
      businessClosenessInput.value = "";
      editingEntryId = null;
    }

    function recomputeStatsFor(date) {
      const container = businessData[date] || { entries: [], stats: {} };
      const entries = container.entries || [];
      const stats = {};
      entries.forEach(e => {
        const closenessRaw = e.closeness;
        const closeness = (closenessRaw === null || closenessRaw === undefined || closenessRaw === '') ? null : Number(closenessRaw);
        if (closeness === null || isNaN(closeness)) return; // ignore entries without closeness
        const hour = (e.time && e.time.slice(0,2)) || '00';
        stats[hour] = stats[hour] || { sum: 0, count: 0, avg: null };
        stats[hour].sum += closeness;
        stats[hour].count += 1;
      });
      Object.keys(stats).forEach(h => {
        if (stats[h].count) {
          const mean = stats[h].sum / stats[h].count;
          stats[h].avg = parseFloat(mean.toFixed(1));
        } else {
          stats[h].avg = null;
        }
      });
      businessData[date] = businessData[date] || { entries: [], stats: {} };
      businessData[date].stats = stats;
    }

    function renderBusinessEntriesFor(date) {
      const container = businessData[date] || { entries: [], stats: {} };
      const entries = container.entries || [];
      const stats = container.stats || {};
      if (entries.length === 0) {
        businessList.innerHTML = '<p>No entries for this date.</p>';
        return;
      }
      businessList.innerHTML = entries.map(e => {
        const hour = (e.time && e.time.slice(0,2)) || '00';
        const avg = stats[hour] && stats[hour].avg ? stats[hour].avg + ' cm (avg)' : '-';
        return `<div class="business-entry" data-id="${e.id}">
          <div>
            <strong>${e.person}</strong> — <span class="biz-time">${e.time}</span> @ <em>${e.place || ''}</em><br>
            <small>Closeness: ${e.closeness || '-'} cm • Hour avg: ${avg}</small>
          </div>
          <div class="biz-actions">
            <button class="edit-biz">Edit</button>
            <button class="delete-biz">Delete</button>
          </div>
        </div>`;
      }).join('');

      businessList.querySelectorAll('.edit-biz').forEach(btn => {
        btn.addEventListener('click', (ev) => {
          const id = ev.target.closest('.business-entry').dataset.id;
          const entry = (businessData[date] && businessData[date].entries || []).find(x => String(x.id) === String(id));
          if (entry) {
            personNameInput.value = entry.person;
            businessTimeInput.value = entry.time;
            businessPlaceInput.value = entry.place || '';
            businessClosenessInput.value = entry.closeness || '';
            businessDateInput.value = date;
            editingEntryId = entry.id;
          }
        });
      });

      businessList.querySelectorAll('.delete-biz').forEach(btn => {
        btn.addEventListener('click', (ev) => {
          const id = ev.target.closest('.business-entry').dataset.id;
          if (!confirm('Delete this entry?')) return;
          businessData[date].entries = (businessData[date].entries || []).filter(x => String(x.id) !== String(id));
          recomputeStatsFor(date);
          saveBusinessData();
          renderBusinessEntriesFor(date);
        });
      });
    }

    businessBtn.addEventListener('click', () => {
      // open business tab and prepare form
      switchTab('businessSection');
      loadBusinessData();
      setDefaultsForBusinessForm();
      renderBusinessEntriesFor(businessDateView.value || businessDateInput.value);
    });
    if (cancelBusinessBtn) cancelBusinessBtn.addEventListener('click', () => {
      setDefaultsForBusinessForm();
    });

    businessDateView.addEventListener('change', (e) => renderBusinessEntriesFor(e.target.value));

    saveBusinessBtn.addEventListener('click', () => {
      const date = businessDateInput.value;
      if (!date) return alert('Please pick a date');
      const person = personNameInput.value.trim() || 'Unknown';
      const time = businessTimeInput.value || formatTimeNow();
      const place = businessPlaceInput.value.trim() || '';
      const closeness = businessClosenessInput.value ? Number(businessClosenessInput.value) : null;

      businessData[date] = businessData[date] || { entries: [], stats: {} };

      const entry = {
        id: editingEntryId || Date.now(),
        person, time, place, closeness
      };

      if (editingEntryId) {
        businessData[date].entries = businessData[date].entries.map(x => x.id === editingEntryId ? entry : x);
      } else {
        businessData[date].entries.push(entry);
      }

      // recompute stats for accurate per-hour averages
      recomputeStatsFor(date);
      saveBusinessData();
      renderBusinessEntriesFor(date);
      setDefaultsForBusinessForm();
    });

    // Initialize load
    loadBusinessData();

    // Splash behavior: hide after a few seconds and show overview
    window.addEventListener('load', () => {
      const splash = document.getElementById('splash');
      const overview = document.getElementById('overviewBanner');
      if (!splash || !overview) return;
      // show for 3 seconds, then hide and reveal overview for 5 seconds
      setTimeout(() => {
        splash.classList.add('hidden');
        // after transition remove from flow
        setTimeout(() => {
          splash.style.display = 'none';
          overview.classList.add('visible');
          overview.setAttribute('aria-hidden','false');
          // hide overview after 6 seconds
          setTimeout(() => {
            overview.classList.remove('visible');
            overview.setAttribute('aria-hidden','true');
          }, 6000);
        }, 500);
      }, 3000);
    });

// ============ LOGS MODAL FUNCTIONALITY ============
const logsBtn = document.getElementById("logsBtn");
const logsModal = document.getElementById("logsModal");
const logsCloseBtn = logsModal.querySelector(".close-btn");
const clearLogsBtn = document.getElementById("clearLogsBtn");
const logsContainer = document.getElementById("logsContainer");

logsBtn.addEventListener("click", () => {
  logsModal.classList.add("active");
  displayLogs();
});

// Close logs modal
if (logsCloseBtn) {
  logsCloseBtn.addEventListener("click", () => {
    logsModal.classList.remove("active");
  });
}

// Clear logs button
if (clearLogsBtn) {
  clearLogsBtn.addEventListener("click", () => {
    if (confirm("Are you sure you want to clear all logs?")) {
      logs = [];
      localStorage.removeItem("distanceLogs");
      displayLogs();
      console.log("Logs cleared successfully");
    }
  });
}

window.addEventListener("click", (e) => {
  if (e.target === logsModal) {
    logsModal.classList.remove("active");
  }
});

function displayLogs() {
  if (logs.length === 0) {
    logsContainer.innerHTML = "<p>No logs yet</p>";
    return;
  }

  logsContainer.innerHTML = logs
    .slice()
    .reverse()
    .map(log => {
      return `
        <div class="log-entry ${log.status.toLowerCase()}">
          <span class="log-time">${log.time}</span>
          <span class="log-details">${log.status} - ${log.distance} cm</span>
        </div>
      `;
    })
    .join("");
}

clearLogsBtn.addEventListener("click", () => {
  if (confirm("Are you sure you want to clear all logs?")) {
    logs = [];
    localStorage.removeItem("distanceLogs");
    displayLogs();
  }
});