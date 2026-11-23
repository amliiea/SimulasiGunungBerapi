/**
 * SIMULASI MITIGASI ERUPSI GUNUNG SEMERU - APPLICATION CORE ENGINE
 * Implements the simulation screens with MediaPipe Vision & Gesture Detection
 */

import {
    FilesetResolver,
    PoseLandmarker,
    HandLandmarker
} from "./assets/mediapipe/vision_bundle.mjs";

import {
    detectPeaceGesture,
    detectBothHandsRaised,
    detectPointHorizontal,
    detectCrossedArms,
    detectOneHandRaised
} from "./gesture3.js";

import {
    connectSensor,
    getSensorStatus,
    getZoneFromDistance,
    isSensorConnected,
    ZONES as SENSOR_ZONES
} from "./sensor.js";

/* ==========================================================================
   CONSTANTS & CONFIGURATION
   ========================================================================== */
const MEDIAPIPE_WASM_URL = new URL("./assets/mediapipe/wasm/", import.meta.url).href;
const POSE_MODEL_URL = new URL("./assets/models/pose_landmarker_lite.task", import.meta.url).href;
const HAND_MODEL_URL = new URL("./assets/models/hand_landmarker.task", import.meta.url).href;

const GESTURE_HOLD_DURATION_MS = 3000;
const CLOSING_COUNTDOWN_SECONDS = 20;
const PAGE_EXIT_TRANSITION_MS = 600;

const STATES = Object.freeze({
    HOME: "HOME",           // UI-1: Landing / Start
    ERUPTION: "ERUPTION",   // Active eruption warning video
    ZONE1: "ZONE1",         // KRB III: Lontaran Material & Abu (≤5 km)
    ZONE2: "ZONE2",         // UI-2: KRB II: Awan Panas Guguran (≤13 km)
    ZONE3: "ZONE3",         // KRB I: Lahar Hujan (≤17 km)
    SAFE: "SAFE"            // Posko Titik Kumpul
});

const STATE_TO_SENSOR_ZONE = Object.freeze({
    [STATES.ZONE1]: 1,
    [STATES.ZONE2]: 2,
    [STATES.ZONE3]: 3,
    [STATES.SAFE]: 4
});

const AUDIO_FILES = Object.freeze({
    MOVE_FORWARD: "16. VO_16_Maju_Sedikit.mp3",
    MOVE_BACK: "17. VO_17_Mundur_Sedikit.mp3",
    ERUPTION: "04. VO_04_Erupsi_Vulkanik.mp3",
    ZONE1_INSTRUCTION: "05. VO_05_Gestur_Perlindungan_Kepala.mp3",
    TO_ZONE2: "06. VO_06_Menuju_Zona_2.mp3",
    ZONE2_SCENE: "07. VO_07_Awan_Panas.mp3",
    ZONE2_INSTRUCTION: "08. VO_08_Gestur_Arah_Evakuasi.mp3",
    TO_ZONE3: "09. VO_09_Menuju_Zona_3.mp3",
    ZONE3_SCENE: "10. VO_10_Lahar_Hujan.mp3",
    ZONE3_INSTRUCTION: "11. VO_11_Gestur_Larangan_Melintas.mp3",
    TO_SAFE: "12. VO_12_Menuju_Zona_Aman.mp3",
    SAFE_SCENE: "13. VO_13_Zona_Aman.mp3",
    END_SIMULATION: "14. VO_14_Akhiri_Simulasi.mp3",
    CLOSING: "15. VO_15_Penutupan.mp3"
});

const ZONE_INSTRUCTIONS = Object.freeze({
    [STATES.ZONE1]: [AUDIO_FILES.ZONE1_INSTRUCTION],
    [STATES.ZONE2]: [AUDIO_FILES.ZONE2_SCENE, AUDIO_FILES.ZONE2_INSTRUCTION],
    [STATES.ZONE3]: [AUDIO_FILES.ZONE3_SCENE, AUDIO_FILES.ZONE3_INSTRUCTION],
    [STATES.SAFE]: [AUDIO_FILES.SAFE_SCENE, AUDIO_FILES.END_SIMULATION]
});

const VIDEO_SOURCES = Object.freeze({
    HOME: "assets/videos/gunung_normal.mp4",
    ERUPTION: "assets/videos/gunung_meletus.mp4",
    ZONE1: "assets/videos/lontaran_material.mp4",
    ZONE2: "assets/videos/awan_panas.mp4",
    ZONE3: "assets/videos/lahar_hujan.mp4",
    SAFE: "assets/videos/zona_aman.mp4"
});

// Zone Educational Content Specification
const ZONE_CONTENT = Object.freeze({
    ZONE1: {
        krbBadge: "KRB III • Zona Bahaya Sangat Tinggi",
        title: "Zona 1 — Lontaran Material & Abu",
        radius: "Radius bahaya: ≤ 5 km",
        description: "Kawasan rawan bencana paling tinggi yang sering terlanda awan panas, aliran lava, dan lontaran batu pijar.",
        actionEyebrow: "TINDAKAN CEPAT",
        actionBody: "Lindungi kepala dari jatuhan material vulkanik dengan mengangkat kedua tangan di atas kepala.",
        dispersionTarget: "Kawah Jonggring Saloko & Lereng Atas Semeru",
        gestureTitle: "Angkat kedua tangan di atas kepala",
        gestureSubtext: "Tahan posisi selama 3 detik untuk melanjutkan evakuasi",
        holdDuration: GESTURE_HOLD_DURATION_MS,
        stepperId: "stepZone1",
        avatarSvg: "hands-overhead",
        avatarImage: "assets/Gambar/zona1.png",
        avatarImageAlt: "Maskot melindungi kepala dengan kedua tangan di atas kepala"
    },
    ZONE2: {
        krbBadge: "KRB II • Zona Bahaya Menengah",
        title: "Zona 2 — Awan Panas",
        radius: "Radius bahaya: ≤ 13 km",
        description: "Awan panas merupakan aliran material vulkanik bersuhu tinggi yang bergerak cepat menuruni lereng gunung dan sangat berbahaya.",
        actionEyebrow: "TINDAKAN CEPAT",
        actionBody: "Segera menjauh dari jalur aliran awan panas dan ikuti arah evakuasi menuju zona aman.",
        dispersionTarget: "Lembah Besuk Kobokan & Curah Kobokan",
        gestureTitle: "Arahkan satu tangan ke kiri atau kanan",
        gestureSubtext: "Tahan posisi selama 3 detik untuk melanjutkan",
        holdDuration: GESTURE_HOLD_DURATION_MS,
        stepperId: "stepZone2",
        avatarSvg: "point-horizontal",
        avatarImage: "assets/Gambar/zona 2.png",
        avatarImageAlt: "Ilustrasi gesture mengarahkan tangan ke kiri atau kanan"
    },
    ZONE3: {
        krbBadge: "KRB I • Zona Bahaya Aliran Lahar",
        title: "Zona 3 — Lahar Hujan",
        radius: "Radius bahaya: ≤ 17 km",
        description: "Kawasan berpotensi terlanda banjir lahar dingin dan material endapan vulkanik saat hujan deras di hulu Semeru.",
        actionEyebrow: "TINDAKAN CEPAT",
        actionBody: "Jauhi sempadan sungai dan jembatan, waspadai debit air yang meningkat secara tiba-tiba.",
        dispersionTarget: "Daerah Aliran Sungai Besuk Bang, Besuk Kembar & Sarat",
        gestureTitle: "Silangkan kedua tangan di depan dada",
        gestureSubtext: "Tahan posisi selama 3 detik untuk melanjutkan evakuasi",
        holdDuration: GESTURE_HOLD_DURATION_MS,
        stepperId: "stepZone3",
        avatarSvg: "arms-crossed",
        avatarImage: "assets/Gambar/zona 3.png",
        avatarImageAlt: "Ilustrasi gesture menyilangkan kedua tangan"
    },
    SAFE: {
        krbBadge: "🛡️ Kawasan Aman • Di Luar KRB",
        title: "Zona Aman — Titik Kumpul Evakuasi",
        radius: "Radius aman: > 20 km",
        description: "Anda telah mencapai batas aman wilayah pengungsian yang ditetapkan oleh BPBD Jawa Timur.",
        actionEyebrow: "TINDAKAN CEPAT",
        actionBody: "Lapor diri ke posko pengungsian, ikuti pendataan petugas, dan utamakan lansia serta anak-anak.",
        dispersionTarget: "Posko Lapangan Penanggal & Kantor Balai Desa Pasirian",
        gestureTitle: "Angkat satu tangan untuk berpamitan",
        gestureSubtext: "Cukup angkat hingga setinggi bahu dan tahan 3 detik; tidak perlu diayunkan",
        holdDuration: GESTURE_HOLD_DURATION_MS,
        stepperId: "stepSafe",
        avatarSvg: "one-hand-wave",
        avatarImage: "assets/Gambar/zona 4.png",
        avatarImageAlt: "Ilustrasi gesture berpamitan di zona aman"
    }
});

/* ==========================================================================
   DOM ELEMENTS
   ========================================================================== */
const bgVideo = document.getElementById("bgVideo");
const videoFallback = document.getElementById("videoFallback");
const calibrationAudio = document.getElementById("calibrationAudio");

// Screens
const screenLanding = document.getElementById("screenLanding");
const screenSimulation = document.getElementById("screenSimulation");
const screenClosing = document.getElementById("screenClosing");
const closingCountdown = document.getElementById("closingCountdown");

// UI-1 Elements
const landingCtaCard = document.getElementById("landingCtaCard");
const landingRingFill = document.getElementById("landingRingFill");
const landingCtaTitle = landingCtaCard.querySelector(".cta-title");
const landingCtaDescription = landingCtaCard.querySelector(".cta-description");
const landingCtaTitleText = landingCtaTitle.textContent;
const landingCtaDescriptionText = landingCtaDescription.textContent;

// UI-2 Elements: Stepper
const stepperItems = {
    ZONE1: document.getElementById("stepZone1"),
    ZONE2: document.getElementById("stepZone2"),
    ZONE3: document.getElementById("stepZone3"),
    SAFE: document.getElementById("stepSafe")
};

// UI-2 Elements: Vision HUD
const webcam = document.getElementById("webcam");
const poseCanvas = document.getElementById("poseCanvas");
const poseCtx = poseCanvas.getContext("2d");
const camOffOverlay = document.getElementById("camOffOverlay");
const hudEngineLabel = document.getElementById("hudEngineLabel");
const hudFpsLabel = document.getElementById("hudFpsLabel");
const labelDistance = document.getElementById("labelDistance");
const txtDistanceFeedback = document.getElementById("txtDistanceFeedback");
const zoneEducationSummary = document.getElementById("zoneEducationSummary");
const hazardInfoCard = document.getElementById("hazardInfoCard");

// UI-2 Elements: Hazard Info Card
const txtKrbLevel = document.getElementById("txtKrbLevel");
const txtZoneTitle = document.getElementById("txtZoneTitle");
const txtQuickActionBody = document.getElementById("txtQuickActionBody");

// UI-2 Elements: Gesture Controller Bar
const gestureAvatarBox = document.getElementById("gestureAvatarBox");
const gestureMascotImage = document.getElementById("gestureMascotImage");
const gestureSilhouetteSvg = document.getElementById("gestureSilhouetteSvg");
const txtGestureTitle = document.getElementById("txtGestureTitle");
const txtGestureSubtext = document.getElementById("txtGestureSubtext");
const txtHoldStatus = document.getElementById("txtHoldStatus");
const txtHoldCounter = document.getElementById("txtHoldCounter");
const gestureProgressBar = document.getElementById("gestureProgressBar");
const btnQuickAdvance = document.getElementById("btnQuickAdvance");

// Dev Menu Elements
const devMenuContainer = document.getElementById("devMenuContainer");
const btnDevMenuToggle = document.getElementById("btnDevMenuToggle");
const btnDevMenuClose = document.getElementById("btnDevMenuClose");
const btnToggleCamera = document.getElementById("btnToggleCamera");
const devCamStatus = document.getElementById("devCamStatus");
const btnToggleSound = document.getElementById("btnToggleSound");
const devSoundStatus = document.getElementById("devSoundStatus");
const btnDevSkip = document.getElementById("btnDevSkip");

/* ==========================================================================
   STATE VARIABLES
   ========================================================================== */
let currentState = STATES.HOME;
let cameraActive = false;
let cameraStarting = false;
let cameraStream = null;
let animationFrame = null;
let lastVideoTime = -1;
let currentPose = null;
let currentHands = [];

let mediapipeReady = false;
let poseLandmarker = null;
let handLandmarker = null;
let mediaPipeInitPromise = null;

let gestureStartTime = null;
let gestureTriggered = false;
let gestureLastDetectedAt = null;
const GESTURE_DETECTION_GRACE_MS = 600;
let sensorStatusInterval = null;
let sensorDistanceCm = null;
let sensorZone = 0;
let audioMuted = true;
let calibrationInstructionComplete =
    !new URLSearchParams(window.location.search).has("fromOpening");
let activeNarration = null;
let activeNarrationFile = null;
let activeNarrationToken = 0;
let initialZoneEntryPending = false;
let pendingZoneTransition = null;
let zoneTransitionReady = false;
let lockedSensorZone = null;
let zoneContentStarted = false;
let zoneGestureReady = false;
let closingCountdownInterval = null;
let closingRedirectTimeout = null;
let gestureAvatarRequestId = 0;
let lastPositionCueFile = null;
let lastPositionCueAt = 0;

// Video player management
let activeVideoRequestId = 0;

/* ==========================================================================
   INITIALIZATION & STARTUP
   ========================================================================== */
window.addEventListener("DOMContentLoaded", () => {
    setupEventListeners();
    applyState(STATES.HOME);
    try {
        connectSensor(handleSensorUpdate);
    } catch (error) {
        console.error("Sensor jarak gagal dimulai; progres simulasi ditahan sampai sensor tersambung.", error);
    }
    updateSensorDistanceLabel();
    processZonePosition();
    sensorStatusInterval = window.setInterval(() => {
        updateSensorDistanceLabel();
        processZonePosition();
    }, 500);

    if (!calibrationInstructionComplete) {
        landingCtaTitle.textContent = "Menyiapkan Instruksi...";
        landingCtaDescription.textContent = "Instruksi akan diputar otomatis saat kamera aktif.";
        txtHoldStatus.textContent = "Menunggu kamera aktif...";
        txtHoldCounter.textContent = "Aktifkan kamera lewat menu Demo";
    }
    if (document.documentElement.classList.contains("from-opening")) {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                document.documentElement.classList.remove("from-opening");
            });
        });
    }
    // Background attempt to warm up MediaPipe
    warmupMediaPipe().catch(err => console.log("MediaPipe background warmup note:", err.message));
});

function playCalibrationInstruction() {
    if (!cameraActive || !calibrationAudio.paused) {
        return;
    }

    landingCtaTitle.textContent = "Dengarkan Instruksi...";
    landingCtaDescription.textContent = "Gestur dua jari aktif setelah instruksi selesai.";
    txtHoldStatus.textContent = "Dengarkan instruksi posisi...";
    txtHoldCounter.textContent = "Tunggu audio selesai";

    calibrationAudio.play().catch(error => {
        if (error.name === "NotAllowedError") {
            landingCtaTitle.textContent = "Klik untuk Memutar Ulang Instruksi";
            landingCtaDescription.textContent = "Browser belum mengizinkan audio. Klik kartu ini untuk mencoba lagi.";
            txtHoldStatus.textContent = "Klik Mulai untuk memutar instruksi";
            txtHoldCounter.textContent = "Tunggu audio selesai";
            console.warn("Browser memblokir pemutaran otomatis audio kalibrasi.", error);
            return;
        }

        landingCtaTitle.textContent = "Audio Instruksi Gagal Dimuat";
        landingCtaDescription.textContent = "Periksa koneksi atau file audio, lalu muat ulang halaman.";
        txtHoldStatus.textContent = "Audio instruksi gagal diputar.";
        console.error("Audio kalibrasi posisi gagal diputar.", error);
    });
}

function stopNarration() {
    activeNarrationToken++;
    if (!activeNarration) return;
    activeNarration.pause();
    activeNarration.currentTime = 0;
    activeNarration = null;
    activeNarrationFile = null;
}

function playNarration(fileName, onEnded = null) {
    stopNarration();
    const requestToken = activeNarrationToken;
    const audioUrl = new URL(`./assets/Audio/${encodeURIComponent(fileName)}`, import.meta.url);
    const audio = new Audio(audioUrl.href);
    let completed = false;
    activeNarration = audio;
    activeNarrationFile = fileName;

    const complete = () => {
        if (completed || requestToken !== activeNarrationToken) return;
        completed = true;
        activeNarration = null;
        activeNarrationFile = null;
        onEnded?.();
    };

    audio.addEventListener("ended", complete, { once: true });
    audio.addEventListener("error", () => {
        console.error(`Audio gagal dimuat: ${fileName}`, audio.error);
        txtHoldStatus.textContent = `Audio ${fileName} gagal dimuat.`;
        complete();
    }, { once: true });
    audio.play().catch(error => {
        console.error(`Audio gagal diputar: ${fileName}`, error);
        txtHoldStatus.textContent = `Audio ${fileName} gagal diputar.`;
        complete();
    });
}

function playNarrationSequence(fileNames, onComplete) {
    let index = 0;
    const playNext = () => {
        if (index >= fileNames.length) {
            onComplete?.();
            return;
        }
        playNarration(fileNames[index++], playNext);
    };
    playNext();
}

function beginInitialZoneEntry() {
    if (initialZoneEntryPending) return;
    initialZoneEntryPending = true;
    landingCtaTitle.textContent = "Sesuaikan Jarak ke Zona 1";
    landingCtaDescription.textContent = "Ikuti indikator sensor sampai posisi berada di rentang Zona 1.";
    processZonePosition();
}

function startEruptionSequence() {
    if (!initialZoneEntryPending || currentState !== STATES.HOME) return;
    initialZoneEntryPending = false;
    applyState(STATES.ERUPTION, true);
}

function prepareZoneTransition(nextState) {
    pendingZoneTransition = nextState;
    zoneTransitionReady = false;
    lockedSensorZone = null;
    updateSensorDistanceLabel();
}

function requestZoneTransition(nextState) {
    pendingZoneTransition = nextState;
    zoneTransitionReady = true;
    updateSensorDistanceLabel();
    processZonePosition();
}

function startZoneInstructions(state) {
    if (currentState !== state || zoneContentStarted) return;
    zoneContentStarted = true;
    playNarrationSequence(ZONE_INSTRUCTIONS[state] ?? [], () => {
        if (currentState !== state) return;
        zoneGestureReady = true;
        txtHoldStatus.textContent = "Tahan gerakan...";
        txtHoldCounter.textContent = `0 / ${Math.round(ZONE_CONTENT[state].holdDuration / 1000)} detik`;
    });
}

function playPositionCue(targetZone) {
    if (!isSensorConnected() || !Number.isFinite(sensorDistanceCm)) return;
    const zone = SENSOR_ZONES.find(item => item.id === targetZone);
    if (!zone) return;

    const fileName = sensorDistanceCm < zone.min
        ? AUDIO_FILES.MOVE_BACK
        : AUDIO_FILES.MOVE_FORWARD;
    const isPositionCuePlaying = activeNarrationFile === AUDIO_FILES.MOVE_BACK
        || activeNarrationFile === AUDIO_FILES.MOVE_FORWARD;
    if (activeNarration && !isPositionCuePlaying) return;
    if (activeNarrationFile === fileName) return;
    if (lastPositionCueFile === fileName && Date.now() - lastPositionCueAt < 5000) return;

    lastPositionCueFile = fileName;
    lastPositionCueAt = Date.now();
    playNarration(fileName);
}

function formatZoneRange(zone) {
    return Number.isFinite(zone.max)
        ? `${zone.min}–<${zone.max} cm`
        : `≥ ${zone.min} cm`;
}

function processZonePosition() {
    const isInitialEntry = initialZoneEntryPending && currentState === STATES.HOME;
    const transitionState = pendingZoneTransition;
    const targetZone = transitionState
        ? STATE_TO_SENSOR_ZONE[transitionState]
        : isInitialEntry
            ? 1
            : STATE_TO_SENSOR_ZONE[currentState];
    if (!targetZone) return;

    const waitingForZoneEntry = Boolean(transitionState)
        || isInitialEntry
        || ([STATES.ZONE2, STATES.ZONE3, STATES.SAFE].includes(currentState) && !zoneContentStarted);
    const guidingActiveZone = !transitionState && zoneGestureReady;
    const targetZoneLocked = lockedSensorZone === targetZone;
    if (!waitingForZoneEntry && !guidingActiveZone) return;

    if (!targetZoneLocked && !isSensorConnected()) {
        gestureStartTime = null;
        gestureProgressBar.style.width = "0%";
        txtHoldStatus.textContent = "Sensor terputus";
        txtHoldCounter.textContent = "Progres ditahan";
        if (isInitialEntry) {
            landingCtaTitle.textContent = "Menunggu Sensor";
            landingCtaDescription.textContent = "Sambungkan sensor untuk memulai simulasi.";
        }
        return;
    }

    if (transitionState && !zoneTransitionReady) {
        txtHoldStatus.textContent = `Menuju Zona ${targetZone}`;
        txtHoldCounter.textContent = "Dengarkan instruksi";
        return;
    }

    if (targetZoneLocked || sensorZone === targetZone) {
        lockedSensorZone = targetZone;
        if (guidingActiveZone) {
            txtHoldStatus.textContent = "Posisi sesuai";
            txtHoldCounter.textContent = "Gestur siap";
        }
        if (!waitingForZoneEntry) return;

        if (transitionState) {
            txtHoldStatus.textContent = "Posisi sesuai";
            txtHoldCounter.textContent = "Menyiapkan zona...";
            pendingZoneTransition = null;
            applyState(transitionState, true);
            return;
        }

        if (sensorDistanceCm === null) {
            txtHoldStatus.textContent = "Menunggu data sensor";
            txtHoldCounter.textContent = "Progres ditahan";
            if (isInitialEntry) {
                landingCtaTitle.textContent = "Menunggu Sensor";
                landingCtaDescription.textContent = "Menunggu pembacaan jarak untuk melanjutkan.";
            }
            return;
        }

        txtHoldStatus.textContent = "Posisi sesuai";
        txtHoldCounter.textContent = "Menyiapkan zona...";
        if (isInitialEntry) {
            landingCtaTitle.textContent = "Jarak Zona 1 sesuai";
            landingCtaDescription.textContent = `Jarak sensor ${sensorDistanceCm} cm · memulai simulasi...`;
        }
        if (isInitialEntry) {
            startEruptionSequence();
        } else {
            startZoneInstructions(currentState);
        }
        return;
    }

    if (sensorDistanceCm === null) {
        txtHoldStatus.textContent = "Menunggu data sensor";
        txtHoldCounter.textContent = "Progres ditahan";
        if (isInitialEntry) {
            landingCtaTitle.textContent = "Menunggu Sensor";
            landingCtaDescription.textContent = "Menunggu pembacaan jarak untuk melanjutkan.";
        }
        return;
    }

    const zone = SENSOR_ZONES.find(item => item.id === targetZone);
    if (!zone) return;
    const targetRange = formatZoneRange(zone);
    const direction = sensorDistanceCm < zone.min
        ? "Mundur sedikit"
        : "Maju sedikit";
    txtHoldStatus.textContent = "Jarak belum sesuai";
    txtHoldCounter.textContent = "Lihat indikator sensor";
    if (isInitialEntry) {
        landingCtaTitle.textContent = "Sesuaikan Jarak ke Zona 1";
        landingCtaDescription.textContent = sensorDistanceCm === null
            ? `Menunggu data sensor · target ${targetRange}`
            : `Jarak sensor ${sensorDistanceCm} cm · target ${targetRange} · ${direction}`;
    }
    playPositionCue(targetZone);
}

function setupEventListeners() {
    // UI-1: Click CTA card to start
    landingCtaCard.addEventListener("click", () => {
        if (currentState !== STATES.HOME) return;
        if (!calibrationInstructionComplete) {
            if (!cameraActive) {
                txtHoldStatus.textContent = "Kamera belum aktif";
                txtHoldCounter.textContent = "Aktifkan lewat menu Demo";
                return;
            }
            playCalibrationInstruction();
            return;
        }
        handleGestureSuccess();
    });
    landingCtaCard.addEventListener("keydown", event => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        landingCtaCard.click();
    });

    // UI-2: Quick advance button
    btnQuickAdvance?.addEventListener("click", () => {
        handleGestureSuccess();
    });

    // UI-3: Click restart button
    document.getElementById("btnRestartNow")?.addEventListener("click", () => {
        resetSimulation();
    });

    // Dev Menu Toggle & Outside Click
    btnDevMenuToggle?.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleDevMenu();
    });

    btnDevMenuClose?.addEventListener("click", (e) => {
        e.stopPropagation();
        closeDevMenu();
    });

    document.addEventListener("click", (e) => {
        if (devMenuContainer && !devMenuContainer.contains(e.target)) {
            closeDevMenu();
        }
    });

    // Dev Toolbar Actions
    btnToggleCamera?.addEventListener("click", toggleCamera);
    btnToggleSound?.addEventListener("click", toggleSound);
    btnDevSkip?.addEventListener("click", () => handleGestureSuccess());

    // Keyboard Shortcuts
    document.addEventListener("keydown", handleKeyboardShortcut);

    calibrationAudio.addEventListener("ended", () => {
        calibrationInstructionComplete = true;
        landingCtaTitle.textContent = landingCtaTitleText;
        landingCtaDescription.textContent = landingCtaDescriptionText;
        if (!cameraActive && !cameraStarting) {
            txtHoldStatus.textContent = "Kamera belum aktif";
            txtHoldCounter.textContent = "Aktifkan lewat menu Demo";
        } else {
            txtHoldStatus.textContent = "Tahan gerakan...";
            txtHoldCounter.textContent = `0 / ${GESTURE_HOLD_DURATION_MS / 1000} detik`;
        }
    });
    calibrationAudio.addEventListener("error", () => {
        txtHoldStatus.textContent = "Audio instruksi gagal diputar.";
        console.error("Audio kalibrasi posisi gagal dimuat.", calibrationAudio.error);
    });

    // Window Unload Cleanup
    window.addEventListener("beforeunload", () => {
        stopCamera();
        stopNarration();
        clearInterval(sensorStatusInterval);
        poseLandmarker?.close();
        handLandmarker?.close();
    });
}

function handleKeyboardShortcut(e) {
    if (["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;

    switch (e.key.toLowerCase()) {
        case " ":
        case "enter":
            e.preventDefault();
            handleGestureSuccess();
            break;
        case "c":
            toggleCamera();
            break;
        case "d":
            toggleDevMenu();
            break;
        case "r":
            resetSimulation();
            break;
    }
}

function toggleDevMenu() {
    devMenuContainer?.classList.toggle("open");
    const isOpen = devMenuContainer?.classList.contains("open");
    btnDevMenuToggle?.setAttribute("aria-expanded", String(isOpen));
}

function closeDevMenu() {
    devMenuContainer?.classList.remove("open");
    btnDevMenuToggle?.setAttribute("aria-expanded", "false");
}

/* ==========================================================================
   MEDIAPIPE VISION ENGINE
   ========================================================================== */
async function warmupMediaPipe() {
    if (mediapipeReady || mediaPipeInitPromise) return mediaPipeInitPromise;

    mediaPipeInitPromise = (async () => {
        hudEngineLabel.textContent = "Memuat MediaPipe...";
        const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);

        const pose = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: POSE_MODEL_URL,
                delegate: "CPU"
            },
            runningMode: "VIDEO",
            numPoses: 1,
            minPoseDetectionConfidence: 0.5,
            minPosePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5
        });

        const hand = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: HAND_MODEL_URL,
                delegate: "CPU"
            },
            runningMode: "VIDEO",
            numHands: 2,
            minHandDetectionConfidence: 0.45,
            minHandPresenceConfidence: 0.45,
            minTrackingConfidence: 0.45
        });

        poseLandmarker = pose;
        handLandmarker = hand;
        mediapipeReady = true;
        hudEngineLabel.textContent = "MediaPipe Pose v0.5";
        console.log("MediaPipe Vision successfully loaded.");
    })();

    return mediaPipeInitPromise;
}

async function startCamera() {
    if (cameraActive || cameraStarting) return;
    cameraStarting = true;
    hudEngineLabel.textContent = "Mengaktifkan Kamera...";

    try {
        await warmupMediaPipe();

        cameraStream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: "user"
            },
            audio: false
        });

        webcam.srcObject = cameraStream;
        await webcam.play();

        poseCanvas.width = webcam.videoWidth || 640;
        poseCanvas.height = webcam.videoHeight || 480;

        cameraActive = true;
        camOffOverlay.style.display = "none";
        if (devCamStatus) {
            devCamStatus.textContent = "Aktif";
            devCamStatus.style.color = "#10B981";
        }
        hudEngineLabel.textContent = "MediaPipe Pose v0.5";

        if (!calibrationInstructionComplete) {
            playCalibrationInstruction();
        }

        lastVideoTime = -1;
        animationFrame = requestAnimationFrame(detectVideoLoop);
    } catch (err) {
        console.error("Camera activation error:", err);
        camOffOverlay.style.display = "flex";
        if (devCamStatus) {
            devCamStatus.textContent = "Gagal";
            devCamStatus.style.color = "#EF4444";
        }
        hudEngineLabel.textContent = "Kamera Tidak Terhubung";
        alert("Kamera tidak dapat diakses atau diblokir peramban. Anda tetap dapat menggunakan keyboard atau tombol aksi untuk simulasi.");
    } finally {
        cameraStarting = false;
    }
}

function stopCamera() {
    cameraActive = false;
    if (animationFrame) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
    }
    cameraStream?.getTracks().forEach(track => track.stop());
    cameraStream = null;
    webcam.srcObject = null;
    currentPose = null;
    currentHands = [];
    poseCtx.clearRect(0, 0, poseCanvas.width, poseCanvas.height);
    camOffOverlay.style.display = "flex";
    if (devCamStatus) {
        devCamStatus.textContent = "Mati";
        devCamStatus.style.color = "#94a3b8";
    }
}

function toggleCamera() {
    if (cameraActive) {
        stopCamera();
    } else {
        startCamera();
    }
}

function detectVideoLoop() {
    if (!cameraActive) return;

    try {
        if (webcam.readyState >= 2 && webcam.currentTime !== lastVideoTime) {
            lastVideoTime = webcam.currentTime;
            const now = performance.now();

            const poseResults = poseLandmarker.detectForVideo(webcam, now);
            const handResults = handLandmarker.detectForVideo(webcam, now);

            currentPose = poseResults.landmarks?.[0] ?? null;
            currentHands = handResults.landmarks ?? [];

            renderLandmarks(currentPose, currentHands);
            evaluateActiveGesture(now);
        }
    } catch (err) {
        console.error("Detection cycle error:", err);
    }

    if (cameraActive) {
        animationFrame = requestAnimationFrame(detectVideoLoop);
    }
}

/* ==========================================================================
   LANDMARK CANVAS RENDERING
   ========================================================================== */
function isPointVisible(point, threshold = 0.35) {
    return Boolean(point && (point.visibility ?? 1) >= threshold);
}

function renderLandmarks(pose, hands) {
    poseCtx.clearRect(0, 0, poseCanvas.width, poseCanvas.height);

    // Draw Pose Skeleton Lines (Neon Mint Green)
    if (pose) {
        const connections = [
            [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
            [11, 23], [12, 24], [23, 24]
        ];

        poseCtx.strokeStyle = "#00FF99";
        poseCtx.lineWidth = 3.5;
        poseCtx.lineCap = "round";

        for (const [startIdx, endIdx] of connections) {
            const p1 = pose[startIdx];
            const p2 = pose[endIdx];
            if (!isPointVisible(p1) || !isPointVisible(p2)) continue;

            poseCtx.beginPath();
            poseCtx.moveTo(p1.x * poseCanvas.width, p1.y * poseCanvas.height);
            poseCtx.lineTo(p2.x * poseCanvas.width, p2.y * poseCanvas.height);
            poseCtx.stroke();
        }

        // Draw Pose Joints
        for (const pt of pose) {
            if (!isPointVisible(pt)) continue;
            poseCtx.beginPath();
            poseCtx.arc(pt.x * poseCanvas.width, pt.y * poseCanvas.height, 4, 0, Math.PI * 2);
            poseCtx.fillStyle = "#00FF99";
            poseCtx.fill();
        }
    }

    // Draw Hand Landmarks (Neon Cyan)
    for (const hand of hands) {
        for (const pt of hand) {
            poseCtx.beginPath();
            poseCtx.arc(pt.x * poseCanvas.width, pt.y * poseCanvas.height, 3.5, 0, Math.PI * 2);
            poseCtx.fillStyle = "#00CCFF";
            poseCtx.fill();
        }
    }
}

/* ==========================================================================
   GESTURE DETECTION & HOLD MANAGER
   ========================================================================== */
function evaluateActiveGesture(now) {
    if (gestureTriggered) return;
    if (currentState === STATES.ERUPTION) return;
    if (currentState === STATES.HOME && !calibrationInstructionComplete) return;
    if (STATE_TO_SENSOR_ZONE[currentState] && !zoneGestureReady) return;
    if (!isRequiredSensorZoneReached()) return;

    let isDetected = false;
    let requiredDuration = GESTURE_HOLD_DURATION_MS;

    switch (currentState) {
        case STATES.HOME:
            isDetected = detectPeaceGesture(currentHands);
            break;

        case STATES.ZONE1:
            isDetected = detectBothHandsRaised(currentPose);
            break;

        case STATES.ZONE2:
            isDetected = detectPointHorizontal(currentPose);
            break;

        case STATES.ZONE3:
            isDetected = detectCrossedArms(currentPose);
            break;

        case STATES.SAFE:
            isDetected = detectOneHandRaised(currentPose);
            break;
    }

    // Update Progress and Hold Timer
    if (isDetected) {
        gestureLastDetectedAt = now;
        if (gestureStartTime === null) {
            gestureStartTime = now;
        }

        const elapsed = now - gestureStartTime;
        const progressRatio = Math.min(1, elapsed / requiredDuration);
        const percent = Math.round(progressRatio * 100);

        // Update UI-1 Ring (if in Landing)
        if (currentState === STATES.HOME) {
            landingRingFill.style.strokeDashoffset = String(100 - percent);
        }

        // Update UI-2 Progress Bar & Counter
        gestureProgressBar.style.width = `${percent}%`;
        const elapsedSec = (elapsed / 1000).toFixed(1);
        const totalSec = Math.round(requiredDuration / 1000);
        txtHoldStatus.textContent = "Mempertahankan gerakan...";
        txtHoldCounter.textContent = `${elapsedSec} / ${totalSec} detik`;

        if (elapsed >= requiredDuration) {
            handleGestureSuccess();
        }
    } else {
        const recentlyDetected =
            gestureLastDetectedAt !== null &&
            now - gestureLastDetectedAt < GESTURE_DETECTION_GRACE_MS;

        if (gestureStartTime !== null && recentlyDetected) {
            const elapsed = now - gestureStartTime;
            if (elapsed >= requiredDuration) {
                handleGestureSuccess();
                return;
            }
        } else {
            // Reset after a short grace period so normal pose flicker does not
            // make the progress bar jump back immediately.
            gestureStartTime = null;
            gestureLastDetectedAt = null;
            if (currentState === STATES.HOME) {
                landingRingFill.style.strokeDashoffset = "100";
            }
            gestureProgressBar.style.width = "0%";
            txtHoldStatus.textContent = "Tahan gerakan...";
            const totalSec = Math.round(requiredDuration / 1000);
            txtHoldCounter.textContent = `0 / ${totalSec} detik`;
        }
    }
}

function handleGestureSuccess() {
    if (gestureTriggered) return;
    if (currentState === STATES.ERUPTION) return;
    if (currentState === STATES.HOME && !calibrationInstructionComplete) return;
    if (STATE_TO_SENSOR_ZONE[currentState] && !zoneGestureReady) return;
    if (!isRequiredSensorZoneReached()) {
        gestureTriggered = false;
        return;
    }

    gestureTriggered = true;
    gestureStartTime = null;
    gestureLastDetectedAt = null;
    gestureProgressBar.style.width = "100%";
    txtHoldStatus.textContent = "Gerakan Selesai!";

    // State transition router
    switch (currentState) {
        case STATES.HOME:
            beginInitialZoneEntry();
            return;

        case STATES.ERUPTION:
            return;

        case STATES.ZONE1:
            prepareZoneTransition(STATES.ZONE2);
            playNarration(AUDIO_FILES.TO_ZONE2, () => requestZoneTransition(STATES.ZONE2));
            return;

        case STATES.ZONE2:
            prepareZoneTransition(STATES.ZONE3);
            playNarration(AUDIO_FILES.TO_ZONE3, () => requestZoneTransition(STATES.ZONE3));
            return;

        case STATES.ZONE3:
            prepareZoneTransition(STATES.SAFE);
            playNarration(AUDIO_FILES.TO_SAFE, () => requestZoneTransition(STATES.SAFE));
            return;

        case STATES.SAFE:
            playNarration(AUDIO_FILES.CLOSING, startClosingCountdown);
            return;
    }
}

function startClosingCountdown() {
    screenSimulation.classList.remove("active");
    screenClosing.classList.add("active");

    let secondsRemaining = CLOSING_COUNTDOWN_SECONDS;
    closingCountdown.textContent = String(secondsRemaining);
    const countdownProgress = document.getElementById("closingCountdownProgress");
    const countdownCircumference = 2 * Math.PI * 78;
    countdownProgress.style.strokeDasharray = String(countdownCircumference);
    countdownProgress.style.strokeDashoffset = String(countdownCircumference * 0.25);

    closingCountdownInterval = window.setInterval(() => {
        secondsRemaining -= 1;
        closingCountdown.textContent = String(secondsRemaining);
        const progress = Math.max(0, secondsRemaining) / CLOSING_COUNTDOWN_SECONDS;
        const remainingRingFraction = 0.75 * progress;
        countdownProgress.style.strokeDashoffset = String(countdownCircumference * (1 - remainingRingFraction));

        if (secondsRemaining <= 0) {
            window.clearInterval(closingCountdownInterval);
            closingCountdownInterval = null;
            document.body.classList.add("is-transitioning-out");
            closingRedirectTimeout = window.setTimeout(() => {
                window.location.href = "pembukaan.html";
            }, PAGE_EXIT_TRANSITION_MS);
        }
    }, 1000);
}

/* ==========================================================================
   STATE MACHINE & UI ORCHESTRATION
   ========================================================================== */
function applyState(nextState, zonePositionConfirmed = false) {
    stopNarration();
    currentState = nextState;
    gestureTriggered = false;
    gestureStartTime = null;
    gestureLastDetectedAt = null;
    initialZoneEntryPending = false;
    pendingZoneTransition = null;
    zoneTransitionReady = false;
    if (!zonePositionConfirmed) {
        lockedSensorZone = null;
    } else if (STATE_TO_SENSOR_ZONE[nextState]) {
        lockedSensorZone = STATE_TO_SENSOR_ZONE[nextState];
    }
    zoneContentStarted = false;
    zoneGestureReady = false;
    console.log("Transisi ke state:", nextState);

    // 1. Manage Screen Views
    if (nextState === STATES.HOME) {
        screenClosing.classList.remove("active");
        screenLanding.classList.add("active");
        screenSimulation.classList.remove("active");
        landingCtaTitle.textContent = landingCtaTitleText;
        landingCtaDescription.textContent = landingCtaDescriptionText;
        playBackgroundVideo(VIDEO_SOURCES.HOME, true);
    } else {
        // Active Simulation States
        screenLanding.classList.remove("active");
        screenSimulation.classList.add("active");

        if (nextState === STATES.ERUPTION) {
            updateEruptionUi();
            playBackgroundVideo(VIDEO_SOURCES.ERUPTION, true);
            playNarration(AUDIO_FILES.ERUPTION, () => {
                applyState(STATES.ZONE1, true);
            });
        } else {
            const config = ZONE_CONTENT[nextState];
            if (config) {
                updateSimulationUi(nextState, config);
                if (!(nextState === STATES.ZONE1 && zonePositionConfirmed)) {
                    playBackgroundVideo(VIDEO_SOURCES[nextState], true);
                }
                if (nextState === STATES.ZONE1 || zonePositionConfirmed) {
                    startZoneInstructions(nextState);
                } else {
                    processZonePosition();
                }
            }
        }

        updateSensorDistanceLabel();
    }
}

function updateSimulationUi(stateKey, config) {
    // 1. Update Stepper Breadcrumbs
    updateStepper(config.stepperId);

    // 2. Update Educational Hazard Card
    txtKrbLevel.textContent = config.krbBadge;
    txtZoneTitle.textContent = config.title;
    txtQuickActionBody.textContent = config.actionBody;

    // 3. Update Gesture Controller Bar
    txtGestureTitle.textContent = config.gestureTitle;
    txtGestureSubtext.textContent = config.gestureSubtext;
    gestureProgressBar.style.width = "0%";
    const totalSec = Math.round(config.holdDuration / 1000);
    txtHoldCounter.textContent = `0 / ${totalSec} detik`;
    txtHoldStatus.textContent = "Tahan gerakan...";

    // 4. Update Avatar SVG Silhouette
    renderAvatarSilhouette(config.avatarSvg, config.avatarImage, config.avatarImageAlt);

}

function updateEruptionUi() {
    updateStepper("stepZone1");
    txtKrbLevel.textContent = "PERINGATAN AWAS • STATUS ERUPSI";
    txtZoneTitle.textContent = "Erupsi Gunung Semeru!";
    txtQuickActionBody.textContent = "Perhatikan arahan darurat dan bersiap mengambil langkah evakuasi di Zona 1.";
    txtGestureTitle.textContent = "Bersiap Evakuasi Zona 1";
    txtGestureSubtext.textContent = "Simak situasi erupsi sebelum berpindah rute...";
    renderAvatarSilhouette("warning");
}

function updateStepper(activeId) {
    const stepsInOrder = ["stepZone1", "stepZone2", "stepZone3", "stepSafe"];
    const activeIndex = stepsInOrder.indexOf(activeId);

    stepsInOrder.forEach((id, index) => {
        const el = document.getElementById(id);
        if (!el) return;

        el.classList.remove("active-pill", "completed");

        if (index < activeIndex) {
            el.classList.add("completed");
        } else if (index === activeIndex) {
            el.classList.add("active-pill");
        }
    });
}

function renderAvatarSilhouette(type, imageSrc = null, imageAlt = "") {
    const requestId = ++gestureAvatarRequestId;
    gestureControllerBar.classList.remove("has-zone-mascot");
    gestureMascotImage.hidden = true;
    gestureSilhouetteSvg.hidden = false;
    let svgInner = "";

    switch (type) {
        case "point-horizontal": // Kiri atau kanan
            svgInner = `
                <circle cx="24" cy="8" r="5" fill="#EA580C"/>
                <path d="M20 16H28C29.1 16 30 16.9 30 18V29H18V18C18 16.9 18.9 16 20 16Z" fill="#EA580C"/>
                <path d="M20 29V42M28 29V42" stroke="#EA580C" stroke-width="4" stroke-linecap="round"/>
                <path d="M29 20H39M39 20L34 15M39 20L34 25" stroke="#EA580C" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M19 20H9M9 20L14 15M9 20L14 25" stroke="#10B981" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
                <circle cx="43" cy="20" r="3" fill="#10B981"/>
                <circle cx="5" cy="20" r="3" fill="#10B981"/>
            `;
            break;

        case "hands-overhead":
            svgInner = `
                <circle cx="24" cy="18" r="4.5" fill="#EA580C"/>
                <path d="M23 25H25C26.6 25 28 26.4 28 28V36H20V28C20 26.4 21.4 25 23 25Z" fill="#EA580C"/>
                <path d="M21 36V44M27 36V44" stroke="#EA580C" stroke-width="3" stroke-linecap="round"/>
                <!-- Arms raised overhead -->
                <path d="M20 27L14 18L18 10M28 27L34 18L30 10" stroke="#EA580C" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
            `;
            break;

        case "arms-crossed":
            svgInner = `
                <circle cx="24" cy="12" r="4.5" fill="#EA580C"/>
                <path d="M23 19H25C26.6 19 28 20.4 28 22V32H20V22C20 20.4 21.4 19 23 19Z" fill="#EA580C"/>
                <path d="M21 32V42M27 32V42" stroke="#EA580C" stroke-width="3" stroke-linecap="round"/>
                <!-- Crossed arms X -->
                <path d="M18 22L30 28M30 22L18 28" stroke="#EA580C" stroke-width="3.5" stroke-linecap="round"/>
            `;
            break;

        case "thumbs-up":
            svgInner = `
                <circle cx="24" cy="24" r="16" fill="#FFEDD5"/>
                <path d="M20 30V22H17V30H20ZM30 23C30 21.9 29.1 21 28 21H24.3L24.8 17.6L24.9 17.3C24.9 16.9 24.7 16.5 24.4 16.3L23.4 15.3L18.4 20.4C18.1 20.7 18 21 18 21.5V29C18 30.1 18.9 31 20 31H26.5C27.1 31 27.6 30.6 27.8 30.1L29.9 25.2C30 25 30 24.8 30 24.5V23Z" fill="#EA580C"/>
            `;
            break;

        case "one-hand-wave":
            svgInner = `
                <circle cx="24" cy="16" r="4.5" fill="#EA580C"/>
                <path d="M23 23H25C26.6 23 28 24.4 28 26V34H20V26C20 24.4 21.4 23 23 23Z" fill="#EA580C"/>
                <path d="M21 34V44M27 34V44" stroke="#EA580C" stroke-width="3" stroke-linecap="round"/>
                <!-- One hand raised in a simple farewell -->
                <path d="M27 25L32 17L30 8" stroke="#10B981" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M30 8V3M27 9L25 5M33 9L35 5" stroke="#10B981" stroke-width="2.5" stroke-linecap="round"/>
            `;
            break;

        default:
            svgInner = `
                <circle cx="24" cy="24" r="14" fill="#FFEDD5" stroke="#EA580C" stroke-width="2"/>
                <path d="M24 16V26M24 30V32" stroke="#EA580C" stroke-width="3" stroke-linecap="round"/>
            `;
            break;
    }

    gestureSilhouetteSvg.innerHTML = svgInner;
    gestureMascotImage.onload = () => {
        if (requestId !== gestureAvatarRequestId) return;
        gestureMascotImage.hidden = false;
        gestureSilhouetteSvg.hidden = true;
        gestureControllerBar.classList.add("has-zone-mascot");
    };
    gestureMascotImage.onerror = () => {
        if (requestId !== gestureAvatarRequestId) return;
        gestureMascotImage.hidden = true;
        gestureSilhouetteSvg.hidden = false;
    };

    if (imageSrc) {
        gestureMascotImage.alt = imageAlt;
        gestureMascotImage.src = imageSrc;
    } else {
        gestureMascotImage.removeAttribute("src");
    }
}

/* ==========================================================================
   VIDEO BACKGROUND PLAYBACK
   ========================================================================== */
function playBackgroundVideo(src, loop = true, onEnded = null) {
    activeVideoRequestId++;
    const thisRequestId = activeVideoRequestId;

    bgVideo.loop = loop;
    bgVideo.muted = audioMuted;
    bgVideo.src = src;

    bgVideo.onended = () => {
        if (thisRequestId === activeVideoRequestId && onEnded) {
            onEnded();
        }
    };

    bgVideo.onerror = () => {
        console.warn(`Video gagal dimuat (${src}), beralih ke fallback visual.`);
        videoFallback.style.opacity = "1";
        if (onEnded) setTimeout(onEnded, 3000);
    };

    videoFallback.style.opacity = "0";
    bgVideo.play().catch(err => {
        console.warn("Autoplay notice:", err.message);
    });
}

function toggleSound() {
    audioMuted = !audioMuted;
    bgVideo.muted = audioMuted;
    if (devSoundStatus) {
        devSoundStatus.textContent = audioMuted ? "Mati" : "Aktif";
        devSoundStatus.style.color = audioMuted ? "#94a3b8" : "#10B981";
    }
}

/* ==========================================================================
   TELEMETRY & DISTANCE
   ========================================================================== */
function handleSensorUpdate(distance) {
    sensorDistanceCm = Number.isFinite(distance) ? distance : null;
    sensorZone = getZoneFromDistance(sensorDistanceCm);

    updateSensorDistanceLabel();
    processZonePosition();
}

function updateSensorDistanceLabel() {
    zoneEducationSummary.hidden = true;
    hazardInfoCard.classList.remove("is-position-ready");

    if (isSensorConnected()) {
        if (sensorDistanceCm === null) {
            labelDistance.textContent = "-- cm";
            txtDistanceFeedback.textContent = "Sensor aktif · menunggu jarak";
            return;
        }

        const distanceLabel = Number.isInteger(sensorDistanceCm)
            ? `${sensorDistanceCm} cm`
            : `${sensorDistanceCm.toFixed(1)} cm`;
        labelDistance.textContent = distanceLabel;

        if (currentState === STATES.ERUPTION && !pendingZoneTransition) {
            txtDistanceFeedback.textContent = lockedSensorZone === 1
                ? "Zona 1 · posisi terkunci"
                : sensorZone === 1
                    ? "Zona 1 · posisi sesuai"
                    : "Peringatan erupsi · tujuan Zona 1";
            zoneEducationSummary.hidden = false;
            hazardInfoCard.classList.toggle("is-position-ready", lockedSensorZone === 1 || sensorZone === 1);
            return;
        }

        const requiredZone = pendingZoneTransition
            ? STATE_TO_SENSOR_ZONE[pendingZoneTransition]
            : initialZoneEntryPending
                ? 1
                : currentState === STATES.ERUPTION
                    ? 1
                    : STATE_TO_SENSOR_ZONE[currentState];
        if (!requiredZone) {
            txtDistanceFeedback.textContent = sensorZone > 0 && sensorZone < 9
                ? `Terdeteksi Zona ${sensorZone}`
                : "Jarak di luar rentang zona";
            return;
        }

        if (lockedSensorZone === requiredZone) {
            txtDistanceFeedback.textContent = `Zona ${requiredZone} · posisi terkunci`;
            zoneEducationSummary.hidden = Boolean(pendingZoneTransition);
            hazardInfoCard.classList.add("is-position-ready");
            return;
        }

        if (sensorZone === requiredZone) {
            txtDistanceFeedback.textContent = `Zona ${requiredZone} · posisi sesuai`;
            zoneEducationSummary.hidden = Boolean(pendingZoneTransition);
            hazardInfoCard.classList.add("is-position-ready");
            if (pendingZoneTransition) return;
            zoneEducationSummary.hidden = false;
            return;
        }

        const zone = SENSOR_ZONES.find(item => item.id === requiredZone);
        if (!zone) {
            txtDistanceFeedback.textContent = `Target Zona ${requiredZone}`;
            return;
        }
        const targetRange = formatZoneRange(zone);
        const direction = sensorDistanceCm === null
            ? "menunggu data sensor"
            : sensorDistanceCm < zone.min
                ? "Mundur sedikit"
                : "Maju sedikit";
        txtDistanceFeedback.textContent = `Target Zona ${requiredZone}: ${targetRange} · ${direction}`;
        return;
    }

    const sensorStatus = getSensorStatus();
    const statusText = sensorStatus === "bridge-off"
        ? "Sensor offline"
        : sensorStatus === "arduino-off"
            ? "Arduino offline"
            : "Data sensor terputus";
    const requiredZone = pendingZoneTransition
        ? STATE_TO_SENSOR_ZONE[pendingZoneTransition]
        : initialZoneEntryPending
            ? 1
            : currentState === STATES.ERUPTION
                ? 1
                : STATE_TO_SENSOR_ZONE[currentState];
    const target = SENSOR_ZONES.find(zone => zone.id === requiredZone);
    labelDistance.textContent = "-- cm";
    if (requiredZone && lockedSensorZone === requiredZone) {
        txtDistanceFeedback.textContent = `Zona ${requiredZone} · posisi terkunci (sensor terputus)`;
        zoneEducationSummary.hidden = Boolean(pendingZoneTransition);
        hazardInfoCard.classList.add("is-position-ready");
        return;
    }
    const targetRange = target ? formatZoneRange(target) : null;
    txtDistanceFeedback.textContent = targetRange
        ? `${statusText} · sambungkan untuk lanjut ke Zona ${requiredZone} (${targetRange})`
        : `${statusText} · sambungkan untuk memulai`;
}

function isRequiredSensorZoneReached() {
    const requiredZone = STATE_TO_SENSOR_ZONE[currentState];
    if (!requiredZone) {
        return true;
    }

    if (lockedSensorZone === requiredZone) {
        return true;
    }

    if (!isSensorConnected()) {
        gestureStartTime = null;
        gestureProgressBar.style.width = "0%";
        txtHoldStatus.textContent = "Sensor terputus";
        txtHoldCounter.textContent = "Progres ditahan";
        return false;
    }

    if (sensorZone === requiredZone) {
        lockedSensorZone = requiredZone;
        return true;
    }

    gestureStartTime = null;
    gestureProgressBar.style.width = "0%";
    txtHoldStatus.textContent = "Jarak belum sesuai";
    txtHoldCounter.textContent = "Lihat indikator sensor";
    return false;
}

function resetSimulation() {
    window.clearInterval(closingCountdownInterval);
    window.clearTimeout(closingRedirectTimeout);
    closingCountdownInterval = null;
    closingRedirectTimeout = null;
    document.body.classList.remove("is-transitioning-out");
    applyState(STATES.HOME);
}
