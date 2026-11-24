import { PLATES } from "./plates.js";
import { SPECIAL_ANSWERS, evaluateTest } from "./scoring.js";

const STORAGE_KEY = "color_vision_test_session_v1";
const TRANSITION_DELAY_MS = 180;

const VIEWS = Object.freeze({
  WELCOME: "WELCOME",
  TESTING: "TESTING",
  RESULTS: "RESULTS",
});

const state = {
  view: VIEWS.WELCOME,
  currentIndex: 0,
  answersById: {},
  isTransitioning: false,
  preloadedSrcs: new Set(),
};

const dom = {
  liveAnnouncer: document.getElementById("live-announcer"),
  viewWelcome: document.getElementById("view-welcome"),
  viewTesting: document.getElementById("view-testing"),
  viewResults: document.getElementById("view-results"),
  welcomeHeading: document.getElementById("welcome-heading"),
  testingHeading: document.getElementById("testing-heading"),
  resultsHeading: document.getElementById("results-heading"),
  startBtn: document.getElementById("start-btn"),
  resetBtn: document.getElementById("reset-btn"),
  restartBtn: document.getElementById("restart-btn"),
  progressLabel: document.getElementById("progress-label"),
  progressTrack: document.querySelector(".progress-track"),
  progressFill: document.getElementById("progress-fill"),
  calibrationBadge: document.getElementById("calibration-badge"),
  testingHint: document.getElementById("testing-hint"),
  plateImage: document.getElementById("plate-image"),
  optionsContainer: document.getElementById("options-container"),
  specialOptionsContainer: document.getElementById("special-options-container"),
  resultsBadge: document.getElementById("results-badge"),
  resultsCard: document.getElementById("results-card"),
  resultsDisclaimer: document.getElementById("results-disclaimer"),
};

function announce(message) {
  if (dom.liveAnnouncer) {
    dom.liveAnnouncer.textContent = "";
    dom.liveAnnouncer.textContent = message;
  }
}

function saveSessionState() {
  try {
    const payload = {
      view: state.view,
      currentIndex: state.currentIndex,
      answersById: state.answersById,
      lastPlateId: PLATES[state.currentIndex]?.id ?? null,
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota or private-mode restrictions
  }
}

function restoreSessionState() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return;

    if (parsed.answersById && typeof parsed.answersById === "object") {
      const validIds = new Set(PLATES.map((p) => p.id));
      for (const [plateId, value] of Object.entries(parsed.answersById)) {
        if (validIds.has(plateId) && typeof value === "string") {
          state.answersById[plateId] = value;
        }
      }
    }

    if (
      typeof parsed.currentIndex === "number" &&
      parsed.currentIndex >= 0 &&
      parsed.currentIndex < PLATES.length
    ) {
      state.currentIndex = parsed.currentIndex;
    }

    if (Object.values(VIEWS).includes(parsed.view)) {
      state.view = parsed.view;
    }
  } catch {
    // Fallback cleanly to initial state if sessionStorage is malformed
  }
}

function preloadUpcomingPlates(currentIndex) {
  const offsets = [1, 2];
  for (const offset of offsets) {
    const nextPlate = PLATES[currentIndex + offset];
    if (nextPlate && !state.preloadedSrcs.has(nextPlate.src)) {
      const img = new Image();
      img.src = nextPlate.src;
      state.preloadedSrcs.add(nextPlate.src);
    }
  }
}

function focusViewHeading(view) {
  const headingMap = {
    [VIEWS.WELCOME]: dom.welcomeHeading,
    [VIEWS.TESTING]: dom.testingHeading,
    [VIEWS.RESULTS]: dom.resultsHeading,
  };
  const target = headingMap[view];
  if (target && typeof target.focus === "function") {
    target.focus();
  }
}

function setActiveView(view) {
  state.view = view;
  dom.viewWelcome.hidden = view !== VIEWS.WELCOME;
  dom.viewTesting.hidden = view !== VIEWS.TESTING;
  dom.viewResults.hidden = view !== VIEWS.RESULTS;
  saveSessionState();
  focusViewHeading(view);
}

function createOptionButton(label, value, className, currentAnswer) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = className;
  btn.dataset.answer = value;
  btn.textContent = label;
  if (currentAnswer === value) {
    btn.classList.add("is-selected");
  }
  btn.addEventListener("click", () => handleAnswerSelection(value));
  return btn;
}

function renderCurrentPlate() {
  const plate = PLATES[state.currentIndex];
  if (!plate) return;

  const stepNumber = state.currentIndex + 1;
  const total = PLATES.length;
  const isControl = plate.kind === "control";
  const currentAnswer = state.answersById[plate.id];

  dom.progressLabel.textContent = `Lámina ${stepNumber} de ${total}`;
  dom.progressTrack.setAttribute("aria-valuenow", String(stepNumber));
  dom.progressTrack.setAttribute("aria-valuemax", String(total));
  dom.progressFill.style.width = `${Math.round((stepNumber / total) * 100)}%`;

  dom.calibrationBadge.hidden = !isControl;
  dom.testingHint.textContent = isControl
    ? "Lámina de control inicial: verifica que puedes distinguir la figura con claridad."
    : "Selecciona el número que percibes o indica si no ves ninguna figura.";

  dom.plateImage.src = plate.src;
  dom.plateImage.alt = plate.label;

  dom.optionsContainer.replaceChildren();
  for (const option of plate.options) {
    dom.optionsContainer.appendChild(
      createOptionButton(option, option, "option-btn", currentAnswer)
    );
  }

  dom.specialOptionsContainer.replaceChildren(
    createOptionButton(
      "No veo ninguna figura",
      SPECIAL_ANSWERS.NOTHING_SEEN,
      "option-btn special-btn",
      currentAnswer
    ),
    createOptionButton(
      "Omitir pregunta",
      SPECIAL_ANSWERS.SKIPPED,
      "option-btn special-btn",
      currentAnswer
    )
  );

  preloadUpcomingPlates(state.currentIndex);
  announce(`Mostrando lámina ${stepNumber} de ${total}.`);
}

function buildStatItem(label, value) {
  const wrapper = document.createElement("div");
  wrapper.className = "stat-item";

  const labelEl = document.createElement("span");
  labelEl.className = "stat-label";
  labelEl.textContent = label;

  const valueEl = document.createElement("span");
  valueEl.className = "stat-value";
  valueEl.textContent = String(value);

  wrapper.append(labelEl, valueEl);
  return wrapper;
}

function renderResults() {
  const evaluation = evaluateTest(PLATES, state.answersById);

  dom.resultsBadge.textContent = evaluation.badge;
  dom.resultsDisclaimer.textContent = evaluation.disclaimer;

  const header = document.createElement("div");
  header.className = "result-header";

  const icon = document.createElement("span");
  icon.className = "result-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = evaluation.icon;

  const title = document.createElement("h2");
  title.className = "result-title";
  title.textContent = evaluation.title;

  header.append(icon, title);

  const message = document.createElement("p");
  message.className = "result-message";
  message.textContent = evaluation.message;

  const statsGrid = document.createElement("div");
  statsGrid.className = "stats-grid";
  statsGrid.append(
    buildStatItem("Aciertos rojo-verde", `${evaluation.correctCount}/${evaluation.evaluatedPlates}`),
    buildStatItem("Porcentaje válido", `${evaluation.validPercentage}%`),
    buildStatItem("Sin figura percibida", evaluation.nothingSeenCount),
    buildStatItem("Preguntas omitidas", evaluation.skippedCount)
  );

  dom.resultsCard.replaceChildren(header, message, statsGrid);
  announce(`Test finalizado. ${evaluation.title}`);
}

function setOptionsDisabled(disabled) {
  const buttons = dom.viewTesting.querySelectorAll("button");
  for (const btn of buttons) {
    btn.disabled = disabled;
  }
}

function handleAnswerSelection(answerValue) {
  if (state.isTransitioning) return;

  const currentPlate = PLATES[state.currentIndex];
  if (!currentPlate) return;

  state.isTransitioning = true;
  setOptionsDisabled(true);

  const plateId = currentPlate.id;
  state.answersById[plateId] = answerValue;
  saveSessionState();

  window.setTimeout(() => {
    if (currentPlate.kind === "control") {
      const controlResult = evaluateTest([currentPlate], state.answersById);
      if (controlResult.status === "invalid_environment") {
        setActiveView(VIEWS.RESULTS);
        renderResults();
        state.isTransitioning = false;
        setOptionsDisabled(false);
        return;
      }
    }

    if (state.currentIndex + 1 < PLATES.length) {
      state.currentIndex += 1;
      saveSessionState();
      renderCurrentPlate();
      focusViewHeading(VIEWS.TESTING);
    } else {
      setActiveView(VIEWS.RESULTS);
      renderResults();
    }

    state.isTransitioning = false;
    setOptionsDisabled(false);
  }, TRANSITION_DELAY_MS);
}

function startTest() {
  if (state.isTransitioning) return;
  state.currentIndex = 0;
  state.answersById = {};
  setActiveView(VIEWS.TESTING);
  renderCurrentPlate();
}

function resetToWelcome() {
  if (state.isTransitioning) return;
  state.currentIndex = 0;
  state.answersById = {};
  setActiveView(VIEWS.WELCOME);
  announce("Volviendo a la pantalla de bienvenida.");
}

function init() {
  restoreSessionState();

  dom.startBtn.addEventListener("click", startTest);
  dom.resetBtn.addEventListener("click", resetToWelcome);
  dom.restartBtn.addEventListener("click", startTest);

  setActiveView(state.view);
  if (state.view === VIEWS.TESTING) {
    renderCurrentPlate();
  } else if (state.view === VIEWS.RESULTS) {
    renderResults();
  }
}

init();
