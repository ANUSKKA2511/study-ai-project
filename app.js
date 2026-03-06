const API_BASE = "http://localhost:8000/api";

const BACKEND_DESCRIPTION =
  "In Command Prompt: cd to the pmc folder, then cd backend, run .venv\\Scripts\\activate.bat, then run: uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000";

const pages = {
  home: document.getElementById("page-home"),
  study: document.getElementById("page-study"),
  qa: document.getElementById("page-qa"),
  dashboard: document.getElementById("page-dashboard"),
  settings: document.getElementById("page-settings"),
};

const navLinks = Array.from(document.querySelectorAll(".nav-link"));
const statusBar = document.getElementById("statusBar");

const uploadForm = document.getElementById("uploadForm");
const uploadStatus = document.getElementById("uploadStatus");
const documentSelect = document.getElementById("documentSelect");
const loadDocumentBtn = document.getElementById("loadDocumentBtn");
const documentContent = document.getElementById("documentContent");
const aiOutput = document.getElementById("aiOutput");
const readAloudBtn = document.getElementById("readAloudBtn");
const summarizeBtn = document.getElementById("summarizeBtn");
const explainBtn = document.getElementById("explainBtn");
const questionInput = document.getElementById("questionInput");
const askQuestionBtn = document.getElementById("askQuestionBtn");
const qaAnswer = document.getElementById("qaAnswer");

const modePrompt = document.getElementById("modePrompt");
const chooseTypingBtn = document.getElementById("chooseTyping");
const chooseVoiceBtn = document.getElementById("chooseVoice");
const openFilePickerBtn = document.getElementById("openFilePickerBtn");
const startDictationBtn = document.getElementById("startDictationBtn");
const stopDictationBtn = document.getElementById("stopDictationBtn");
const dictationStatus = document.getElementById("dictationStatus");
const voiceToggle = document.getElementById("voiceToggle");
const toggleContrastBtn = document.getElementById("toggleContrastBtn");
const increaseFontBtn = document.getElementById("increaseFontBtn");
const decreaseFontBtn = document.getElementById("decreaseFontBtn");
const enableMotivationBtn = document.getElementById("enableMotivationBtn");
const disableMotivationBtn = document.getElementById("disableMotivationBtn");

const stats = {
  documents: document.getElementById("statDocuments"),
  summaries: document.getElementById("statSummaries"),
  explanations: document.getElementById("statExplanations"),
  questions: document.getElementById("statQuestions"),
  listeningMinutes: document.getElementById("statListeningMinutes"),
};

let currentDocumentId = null;
let currentDocumentText = "";
let recognition = null;
let recognitionActive = false;
let recognitionRunning = false;
let recognitionRestartTimer = null;
let dictationActive = false;
let dictationBuffer = [];
let selectedUploadFileName = "";
let lastUploadedDocName = "";

const PROGRESS_KEY = "ai-study-assistant-progress";

function loadProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) {
      return {
        documents: 0,
        summaries: 0,
        explanations: 0,
        questions: 0,
        listeningMinutes: 0,
      };
    }
    return JSON.parse(raw);
  } catch {
    return {
      documents: 0,
      summaries: 0,
      explanations: 0,
      questions: 0,
      listeningMinutes: 0,
    };
  }
}

let progress = loadProgress();

function saveProgress() {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  renderStats();
}

function renderStats() {
  stats.documents.textContent = String(progress.documents);
  stats.summaries.textContent = String(progress.summaries);
  stats.explanations.textContent = String(progress.explanations);
  stats.questions.textContent = String(progress.questions);
  stats.listeningMinutes.textContent = String(
    progress.listeningMinutes.toFixed(1)
  );
}

function speak(text) {
  if (!("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  } catch (_) {}
}

function speakModePrompt() {
  const msg =
    "Welcome. Would you like to use typing or voice control? " +
    "Press V for Voice Control or T for Texting. " +
    "On mobile, tap a button or swipe right for Voice, swipe left for Texting. " +
    "You can also say voice or typing.";
  speak(msg);
}

let modePromptSpoken = false;

function showModePrompt() {
  if (!modePrompt) return;
  modePrompt.hidden = false;
  chooseTypingBtn?.focus();
  if (!modePromptSpoken) {
    speakModePrompt();
    modePromptSpoken = true;
  }
  // Attempt to start recognition so users can answer by voice
  if (!recognition) {
    initVoiceControl();
  }
  try {
    if (recognition && !recognitionRunning) {
      recognition.start();
    }
  } catch (_) {}
  setStatus("Press V for Voice Control or T for Texting.");
  const instructions = document.getElementById("modeInstructions");
  if (instructions) {
    instructions.textContent = "Press V for Voice Control or T for Texting.";
  }
  window.addEventListener("keydown", promptKeyHandler);
}

function hideModePrompt() {
  if (!modePrompt) return;
  modePrompt.hidden = true;
  try {
    window.speechSynthesis?.cancel();
  } catch (_) {}
  window.removeEventListener("keydown", promptKeyHandler);
  removePromptTouchHandlers();
  const main = document.getElementById("mainContent");
  main?.focus();
  setStatus("Mode selected. You can use the website now.");
}

function setStatus(message) {
  statusBar.textContent = message;
}

function showPage(name) {
  Object.entries(pages).forEach(([key, page]) => {
    page.classList.toggle("visible", key === name);
  });
  navLinks.forEach((link) => {
    link.classList.toggle("active", link.dataset.target === name);
  });
  const main = document.getElementById("mainContent");
  main.focus();
  setStatus(`Showing ${name} page`);
}

navLinks.forEach((link) => {
  link.addEventListener("click", () => {
    showPage(link.dataset.target);
  });
});

function isNetworkError(err) {
  return (
    err instanceof TypeError &&
    (err.message === "Failed to fetch" ||
      err.message.includes("Load failed") ||
      err.message.includes("NetworkError"))
  );
}

async function fetchJSON(url, options = {}) {
  let res;
  try {
    const opts = {
      ...options,
      headers: {
        ...(options.headers || {}),
      },
    };
    // Don't set Content-Type for FormData – browser sets it with boundary
    if (options.body && options.body instanceof FormData) {
      delete opts.headers["Content-Type"];
    }
    res = await fetch(url, opts);
  } catch (err) {
    if (isNetworkError(err)) {
      throw new Error(
        "Cannot connect to server. Is the backend running? " + BACKEND_DESCRIPTION
      );
    }
    throw err;
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed with status ${res.status}`);
  }
  return res.json();
}

async function loadDocuments() {
  try {
    const docs = await fetchJSON(`${API_BASE}/documents`);
    documentSelect.innerHTML = "";
    if (!docs.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "No documents uploaded yet";
      documentSelect.appendChild(opt);
      return;
    }
    docs.forEach((doc) => {
      const opt = document.createElement("option");
      opt.value = doc.id;
      opt.textContent = `${doc.name} (${Math.round(doc.size / 1024)} KB)`;
      documentSelect.appendChild(opt);
    });
    if (!currentDocumentId && docs[0]) {
      currentDocumentId = docs[0].id;
    }
    documentSelect.value = currentDocumentId || "";
  } catch (err) {
    const msg = isNetworkError(err)
      ? "Cannot connect to server. " + BACKEND_DESCRIPTION
      : err.message;
    setStatus("Error: " + msg);
  }
}

function promptKeyHandler(e) {
  if (modePrompt?.hidden) return;
  const key = e.key.toLowerCase();
  if (key === "v" || key === "enter" || key === " ") {
    e.preventDefault();
    chooseVoiceBtn?.click();
  } else if (key === "t") {
    e.preventDefault();
    chooseTypingBtn?.click();
  }
}

let touchStart = null;
function addPromptTouchHandlers() {
  if (!modePrompt) return;
  const start = (e) => {
    const t = e.touches?.[0];
    const inDialog = !!e.target.closest(".mode-dialog");
    touchStart = t ? { x: t.clientX, y: t.clientY, time: Date.now(), inDialog } : null;
  };
  const end = (e) => {
    if (!touchStart) return;
    const t = e.changedTouches?.[0];
    if (!t) return;
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    const dt = Date.now() - touchStart.time;
    if (touchStart.inDialog && dt < 500 && Math.abs(dx) > 100 && Math.abs(dy) < 40) {
      if (dx > 0) chooseVoiceBtn?.click();
      else chooseTypingBtn?.click();
    }
    touchStart = null;
  };
  modePrompt.addEventListener("touchstart", start, { passive: true });
  modePrompt.addEventListener("touchend", end, { passive: true });
  modePrompt._touchHandlers = { start, end };
}

function removePromptTouchHandlers() {
  if (!modePrompt || !modePrompt._touchHandlers) return;
  const { start, end } = modePrompt._touchHandlers;
  modePrompt.removeEventListener("touchstart", start);
  modePrompt.removeEventListener("touchend", end);
  modePrompt._touchHandlers = null;
}

uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const fileInput = document.getElementById("fileInput");
  const file = fileInput.files[0];
  if (!file) {
    setStatus("Please choose a TXT file first.");
    return;
  }
  if (!file.name.toLowerCase().endsWith(".txt")) {
    setStatus("Only .txt files are supported.");
    return;
  }
  const formData = new FormData();
  formData.append("file", file);

  uploadStatus.textContent = "Uploading...";
  setStatus("Uploading document...");
  try {
    const doc = await fetchJSON(`${API_BASE}/documents`, {
      method: "POST",
      body: formData,
    });
    currentDocumentId = doc.id;
    progress.documents += 1;
    saveProgress();
    uploadStatus.textContent = "Upload successful.";
    uploadStatus.classList.remove("sr-only");
    setStatus("Upload successful.");
    speak("Upload successful. Say load document to open it.");
    await loadDocuments();
  } catch (err) {
    uploadStatus.textContent = "Upload failed: " + err.message;
    uploadStatus.classList.remove("sr-only");
    setStatus("Upload failed: " + err.message);
  }
});

loadDocumentBtn.addEventListener("click", async () => {
  const id = documentSelect.value;
  if (!id) {
    setStatus("Please select a document.");
    return;
  }
  await loadDocument(id);
});

async function loadDocument(id) {
  try {
    const data = await fetchJSON(`${API_BASE}/documents/${id}`);
    currentDocumentId = id;
    currentDocumentText = data.content;
    documentContent.textContent = data.content;
    aiOutput.textContent = "";
    qaAnswer.textContent = "";
    setStatus("Document loaded.");
  } catch (err) {
    const msg = isNetworkError(err)
      ? "Cannot connect to server. " + BACKEND_DESCRIPTION
      : err.message;
    setStatus("Error: " + msg);
  }
}

function estimateListeningMinutes(text) {
  const words = text.split(/\s+/).filter(Boolean).length;
  const wpm = 160;
  return words / wpm;
}

readAloudBtn.addEventListener("click", () => {
  if (!currentDocumentText) {
    setStatus("No document loaded to read.");
    return;
  }
  if (!("speechSynthesis" in window)) {
    setStatus("Speech synthesis is not supported in this browser.");
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(currentDocumentText);
  window.speechSynthesis.speak(utterance);
  const minutes = estimateListeningMinutes(currentDocumentText);
  progress.listeningMinutes += minutes;
  saveProgress();
  setStatus("Reading document aloud.");
});

function openFilePicker(fromVoice = false) {
  const el = document.getElementById("fileInput");
  if (!el) return;
  try {
    showPage("study");
    el.classList.add("picker-highlight");
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.focus();
    if (fromVoice) {
      const keyHandler = (e) => {
        const k = e.key.toLowerCase();
        if (k === "enter" || k === " ") {
          e.preventDefault();
          window.removeEventListener("keydown", keyHandler);
          window.removeEventListener("pointerdown", pointerHandler);
          el.classList.remove("picker-highlight");
          el.click();
        }
      };
      const pointerHandler = () => {
        window.removeEventListener("keydown", keyHandler);
        window.removeEventListener("pointerdown", pointerHandler);
        el.classList.remove("picker-highlight");
        el.click();
      };
      window.addEventListener("keydown", keyHandler, { once: true });
      window.addEventListener("pointerdown", pointerHandler, { once: true });
      openFilePickerBtn?.classList.add("picker-highlight");
      openFilePickerBtn?.focus();
      setStatus("Press Enter/Space or tap to open the file picker.");
      speak("Press Enter or Space, or tap the highlighted button to open the file picker.");
    } else {
      setTimeout(() => el.classList.remove("picker-highlight"), 1600);
      el.click();
      setStatus("File picker opened. Use your screen reader or keyboard to select a file.");
      speak("File picker opened. Choose a text file, then say upload document.");
    }
  } catch (e) {
    setStatus("Cannot open file picker: " + e.message);
  }
}

openFilePickerBtn?.addEventListener("click", () => openFilePicker(false));

document.getElementById("fileInput")?.addEventListener("change", (e) => {
  const f = e.target.files?.[0];
  if (f) {
    selectedUploadFileName = String(f.name || "");
    setStatus(`Selected file: ${selectedUploadFileName}. Say 'upload document' to upload.`);
    speak(`Selected file ${selectedUploadFileName}. Say upload document to upload.`);
  } else {
    selectedUploadFileName = "";
  }
});

function voiceSubmitUpload(expectedNameFragment) {
  const input = document.getElementById("fileInput");
  const file = input?.files?.[0];
  if (!file) {
    setStatus("No file chosen. Say 'open file picker' first.");
    speak("No file chosen. Say open file picker first.");
    return;
  }
  if (expectedNameFragment) {
    const frag = expectedNameFragment.trim().toLowerCase();
    const matches =
      file.name.toLowerCase().includes(frag) ||
      file.name.toLowerCase().replace(/\.[^.\s]+$/, "").includes(frag);
    if (!matches) {
      setStatus(`Chosen file does not match '${expectedNameFragment}'. Proceeding anyway.`);
    }
  }
  lastUploadedDocName = file.name;
  try {
    document.getElementById("uploadForm")?.requestSubmit();
    setStatus("Uploading selected file...");
    speak("Uploading selected file.");
  } catch (e) {
    setStatus("Cannot submit upload: " + e.message);
  }
}

function startDictation() {
  dictationActive = true;
  dictationBuffer = [];
  dictationStatus?.classList.remove("sr-only");
  dictationStatus.textContent = "Dictation started. Speak clearly. Say 'stop dictation' when finished.";
  setStatus("Dictation started.");
  speak("Dictation started. Speak your document. Say stop dictation when finished.");
  if (!recognition) {
    initVoiceControl();
  }
  try {
    if (recognition && !recognitionRunning) {
      recognition.start();
    }
  } catch (_) {}
}

function stopDictationAndUpload() {
  dictationActive = false;
  const text = dictationBuffer.join(" ").trim();
  if (!text) {
    dictationStatus.textContent = "No speech captured.";
    setStatus("No speech captured.");
    return;
  }
  const file = new File([text], "dictation.txt", { type: "text/plain" });
  const formData = new FormData();
  formData.append("file", file);
  dictationStatus.textContent = "Uploading dictated document...";
  setStatus("Uploading dictated document...");
  fetchJSON(`${API_BASE}/documents`, {
    method: "POST",
    body: formData,
  })
    .then((doc) => {
      currentDocumentId = doc.id;
      progress.documents += 1;
      saveProgress();
      dictationStatus.textContent = "Upload successful.";
      setStatus("Dictation uploaded successfully.");
      loadDocuments();
    })
    .catch((err) => {
      dictationStatus.textContent = "Upload failed: " + err.message;
      setStatus("Upload failed: " + err.message);
    });
}

startDictationBtn?.addEventListener("click", startDictation);
stopDictationBtn?.addEventListener("click", stopDictationAndUpload);

async function callOllamaAction(path, body, progressField) {
  if (!currentDocumentId) {
    setStatus("Please load a document first.");
    return null;
  }
  setStatus("Contacting AI model...");
  try {
    const result = await fetchJSON(`${API_BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (progressField && progress[progressField] !== undefined) {
      progress[progressField] += 1;
      saveProgress();
    }
    setStatus("AI response received.");
    return result.response;
  } catch (err) {
    setStatus(`AI request failed: ${err.message}`);
    return null;
  }
}

summarizeBtn.addEventListener("click", async () => {
  const text = await callOllamaAction(
    `/documents/${currentDocumentId}/summarize`,
    {},
    "summaries"
  );
  if (text) {
    aiOutput.textContent = text;
    speak(text);
  }
});

explainBtn.addEventListener("click", async () => {
  const text = await callOllamaAction(
    `/documents/${currentDocumentId}/explain`,
    {},
    "explanations"
  );
  if (text) {
    aiOutput.textContent = text;
    speak(text);
  }
});

askQuestionBtn.addEventListener("click", async () => {
  const question = questionInput.value.trim();
  if (!question) {
    setStatus("Please type a question first.");
    return;
  }
  const text = await callOllamaAction(
    `/qa`,
    { document_id: currentDocumentId, question },
    "questions"
  );
  if (text) {
    qaAnswer.textContent = text;
  }
});

toggleContrastBtn.addEventListener("click", () => {
  document.body.classList.toggle("high-contrast");
  setStatus("Toggled high contrast mode.");
});

increaseFontBtn.addEventListener("click", () => {
  document.body.classList.remove("small-font");
  document.body.classList.add("large-font");
  setStatus("Increased base font size.");
});

decreaseFontBtn.addEventListener("click", () => {
  document.body.classList.remove("large-font");
  document.body.classList.add("small-font");
  setStatus("Decreased base font size.");
});

function enableMotivationMode() {
  document.body.classList.add("motivation-mode");
  setStatus("Motivation mode enabled. You can do this.");
  speak("Motivation mode enabled. You can do this.");
}

function disableMotivationMode() {
  document.body.classList.remove("motivation-mode");
  setStatus("Motivation mode disabled.");
}

enableMotivationBtn?.addEventListener("click", enableMotivationMode);
disableMotivationBtn?.addEventListener("click", disableMotivationMode);

function initVoiceControl() {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    setStatus("Voice control is not supported in this browser.");
    voiceToggle.disabled = true;
    return;
  }

  const secureOK =
    window.isSecureContext ||
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1";
  if (!secureOK) {
    setStatus("Voice control requires HTTPS or localhost.");
    voiceToggle.disabled = true;
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.continuous = true;
  recognition.interimResults = false;

  recognition.onstart = () => {
    setStatus("Listening for voice commands...");
    recognitionRunning = true;
  };

  recognition.onresult = (event) => {
    const last = event.results[event.results.length - 1];
    if (!last.isFinal) return;
    const transcript = last[0].transcript.toLowerCase().trim();
    const confidence = typeof last[0].confidence === "number" ? last[0].confidence : 0;
    if (dictationActive) {
      dictationBuffer.push(transcript);
      setStatus("Dictating...");
    } else {
      handleVoiceCommand(transcript, confidence);
    }
  };

  recognition.onerror = (event) => {
    const err = event.error;
    if (err === "not-allowed") {
      setStatus("Microphone permission denied. Allow access to use voice control.");
      recognitionActive = false;
      voiceToggle.setAttribute("aria-pressed", "false");
      voiceToggle.textContent = "🎙 Start Voice Control";
      recognitionRunning = false;
    } else if (err === "no-speech") {
      setStatus("No speech detected. Try again closer to the mic.");
    } else if (err === "aborted") {
      setStatus("Voice recognition aborted.");
      recognitionRunning = false;
    } else if (err === "audio-capture") {
      setStatus("No microphone found. Check your audio input device.");
      recognitionRunning = false;
    } else {
      setStatus(`Voice recognition error: ${err}`);
    }
  };

  recognition.onend = () => {
    recognitionRunning = false;
    if (recognitionActive) {
      if (recognitionRestartTimer) {
        clearTimeout(recognitionRestartTimer);
      }
      recognitionRestartTimer = setTimeout(() => {
        if (!recognitionActive || recognitionRunning) return;
        try {
          recognition.start();
        } catch (e) {
          setStatus("Cannot restart voice recognition: " + e.message);
          recognitionActive = false;
          voiceToggle.setAttribute("aria-pressed", "false");
          voiceToggle.textContent = "🎙 Start Voice Control";
        }
      }, 400);
    }
  };
}

function handleVoiceCommand(text, confidence = 0) {
  setStatus(`Heard: "${text}"`);

  // If mode prompt is open, accept "voice" or "typing" answers
  if (!modePrompt?.hidden) {
    if (text.includes("select voice")) {
      chooseVoiceBtn?.click();
      return;
    }
    if (text.includes("select typing") || text.includes("select text") || text.includes("select texting")) {
      chooseTypingBtn?.click();
      return;
    }
    if (confidence >= 0.7 && (text === "voice" || text === "typing" || text === "texting")) {
      chooseTypingBtn?.click();
      return;
    }
  }

  // Uploader and dictation
  if (text.includes("open uploader") || text.includes("open file picker")) {
    openFilePicker(true);
    return;
  }
  if (text.includes("enable motivation mode") || text.includes("motivation background") || text.includes("motivation mode")) {
    enableMotivationMode();
    return;
  }
  if (text.includes("disable motivation mode")) {
    disableMotivationMode();
    return;
  }
  const uploadNameMatch = text.match(/\bupload\s+(?:document|file)\s+(.*)$/);
  if (text.includes("upload document") || text.includes("upload file") || uploadNameMatch) {
    const nameFrag = uploadNameMatch ? uploadNameMatch[1] : "";
    voiceSubmitUpload(nameFrag);
    return;
  }
  if (text.includes("start dictation")) {
    startDictation();
    return;
  }
  if (text.includes("stop dictation")) {
    stopDictationAndUpload();
    return;
  }

  // Load document by name or current selection
  const loadMatch = text.match(/\bload\s+(?:document|file)\s+(.*)$/);
  if (text.includes("load document") || text.includes("load file") || loadMatch) {
    const frag = loadMatch ? loadMatch[1].trim().toLowerCase() : "";
    const options = Array.from(documentSelect?.options || []);
    let targetId = null;
    if (frag) {
      for (const opt of options) {
        const nameText = String(opt.textContent || "").toLowerCase();
        const base = nameText.replace(/\.[^.\s\)]*$/, "");
        if (nameText.includes(frag) || base.includes(frag)) {
          targetId = opt.value;
          break;
        }
      }
    }
    if (!targetId && lastUploadedDocName) {
      for (const opt of options) {
        const nameText = String(opt.textContent || "").toLowerCase();
        if (nameText.includes(lastUploadedDocName.toLowerCase().replace(/\.[^.\s]+$/, ""))) {
          targetId = opt.value;
          break;
        }
      }
    }
    if (!targetId) {
      targetId = documentSelect?.value || null;
    }
    if (targetId) {
      documentSelect.value = targetId;
      loadDocumentBtn.click();
      speak("Loading document.");
      return;
    } else {
      setStatus("No document found to load. Try 'open file picker' and upload first.");
      speak("No document found to load.");
      return;
    }
  }

  if (text.includes("go to home")) {
    showPage("home");
    return;
  }
  if (text.includes("go to study")) {
    showPage("study");
    return;
  }
  if (text.includes("go to questions") || text.includes("go to question")) {
    showPage("qa");
    return;
  }
  if (text.includes("go to dashboard")) {
    showPage("dashboard");
    return;
  }
  if (text.includes("go to settings")) {
    showPage("settings");
    return;
  }
  if (text.includes("read document")) {
    readAloudBtn.click();
    return;
  }
  if (text.includes("summarize document") || text.includes("summarise document")) {
    summarizeBtn.click();
    return;
  }
  if (text.includes("explain document")) {
    explainBtn.click();
    return;
  }
}

chooseTypingBtn?.addEventListener("click", () => {
  hideModePrompt();
  if (recognitionRunning) {
    try {
      recognition.stop();
    } catch (_) {}
  }
  recognitionActive = false;
  voiceToggle.setAttribute("aria-pressed", "false");
  voiceToggle.textContent = "🎙 Start Voice Control";
  setStatus("Typing mode selected.");
});

chooseVoiceBtn?.addEventListener("click", () => {
  hideModePrompt();
  const startVoice = () => {
    if (!recognition) {
      initVoiceControl();
    }
    if (!recognition) {
      setStatus("Voice control not available.");
      return;
    }
    recognitionActive = true;
    voiceToggle.setAttribute("aria-pressed", "true");
    voiceToggle.textContent = "🛑 Stop Voice Control";
    try {
      recognition.start();
      setStatus("Voice mode selected. Listening for commands.");
      speak("Voice mode selected. You can say: go to home, go to study, and more.");
    } catch (e) {
      if (String(e.message).includes("already started")) {
        setStatus("Listening for voice commands...");
      } else {
        setStatus("Cannot start voice recognition: " + e.message);
        recognitionActive = false;
        voiceToggle.setAttribute("aria-pressed", "false");
        voiceToggle.textContent = "🎙 Start Voice Control";
      }
    }
  };
  if (navigator.mediaDevices?.getUserMedia) {
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then(() => startVoice())
      .catch((err) => {
        setStatus("Microphone permission denied: " + err.message);
        speak("Microphone permission denied. You can continue by texting.");
      });
  } else {
    startVoice();
  }
});

voiceToggle.addEventListener("click", () => {
  if (!recognition) {
    initVoiceControl();
  }
  if (!recognition) {
    return;
  }
  recognitionActive = !recognitionActive;
  if (recognitionActive) {
    voiceToggle.setAttribute("aria-pressed", "true");
    voiceToggle.textContent = "🛑 Stop Voice Control";
    if (!recognitionRunning) {
      try {
        recognition.start();
        setStatus("Voice control started. Say 'go to home', 'go to study', etc.");
      } catch (e) {
        if (String(e.message).includes("already started")) {
          setStatus("Listening for voice commands...");
        } else {
          setStatus("Cannot start voice recognition: " + e.message);
          recognitionActive = false;
          voiceToggle.setAttribute("aria-pressed", "false");
          voiceToggle.textContent = "🎙 Start Voice Control";
        }
      }
    } else {
      setStatus("Listening for voice commands...");
    }
  } else {
    if (recognitionRunning) {
      recognition.stop();
    }
    voiceToggle.setAttribute("aria-pressed", "false");
    voiceToggle.textContent = "🎙 Start Voice Control";
    setStatus("Voice control stopped.");
  }
});

function showConnectionStatus(ok, message) {
  const el = document.getElementById("connectionBanner");
  if (!el) return;
  el.hidden = ok;
  if (message) el.textContent = message;
}

async function checkConnection() {
  try {
    const res = await fetch(API_BASE.replace("/api", "") + "/api/health", {
      method: "GET",
    });
    showConnectionStatus(res.ok, null);
    return res.ok;
  } catch (e) {
    showConnectionStatus(
      false,
      "Cannot reach server. Start backend: Command Prompt → cd backend → .venv\\Scripts\\activate.bat → uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000"
    );
    return false;
  }
}

renderStats();
showPage("home");
loadDocuments();
checkConnection();
setInterval(checkConnection, 15000);
setStatus("Ready. Use the navigation buttons or voice control.");

let lastScrollY = 0;
let ticking = false;
function onScroll() {
  lastScrollY = window.scrollY || 0;
  if (!ticking) {
    requestAnimationFrame(() => {
      document.documentElement.style.setProperty("--scrollY", String(lastScrollY));
      ticking = false;
    });
    ticking = true;
  }
}
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();

// Show entry mode prompt shortly after load
function unlockAudioOnFirstInteraction() {
  const once = () => {
    if (!modePromptSpoken && !modePrompt?.hidden) {
      speakModePrompt();
      modePromptSpoken = true;
    }
    window.removeEventListener("click", once);
    window.removeEventListener("keydown", once);
    window.removeEventListener("pointerdown", once);
  };
  window.addEventListener("click", once, { once: true });
  window.addEventListener("keydown", once, { once: true });
  window.addEventListener("pointerdown", once, { once: true });
}

setTimeout(() => {
  showModePrompt();
  unlockAudioOnFirstInteraction();
  addPromptTouchHandlers();
}, 300);

