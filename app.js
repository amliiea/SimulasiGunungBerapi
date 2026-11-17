/**
 * SIMULASI MITIGASI ERUPSI GUNUNG SEMERU - APPLICATION CORE ENGINE
 * Implements Unified UI-1, UI-2, and UI-3 with MediaPipe Vision & Gesture Detection
 */

import {
    FilesetResolver,
    PoseLandmarker,
    HandLandmarker
} from "./assets/mediapipe/vision_bundle.mjs";

import {
    detectPeaceGesture,
    detectThumbsUp,
    detectBothHandsRaised,
    detectPointHorizontal,
    detectCrossedArms,
    detectWave,
    resetWaveDetection
} from "./gesture3.js";

/* ==========================================================================
   CONSTANTS & CONFIGURATION
   ========================================================================== */
const MEDIAPIPE_WASM_URL = new URL("./assets/mediapipe/wasm/", import.meta.url).href;
const POSE_MODEL_URL = new URL("./assets/models/pose_landmarker_lite.task", import.meta.url).href;
const HAND_MODEL_URL = new URL("./assets/models/hand_landmarker.task", import.meta.url).href;

const HOLD_DURATION_SHORT = 2000;  // 2 seconds for landing and thumbs-up
const HOLD_DURATION_NORMAL = 5000; // 5 seconds matching UI-2 for hazard zones
const COOLDOWN_SECONDS = 20;       // 20 seconds circular timer matching UI-3

const STATES = Object.freeze({
    HOME: "HOME",           // UI-1: Landing / Start
    BRIEFING: "BRIEFING",   // Pre-evacuation briefing
    ERUPTION: "ERUPTION",   // Active eruption warning video
    ZONE1: "ZONE1",         // KRB III: Lontaran Material & Abu (≤5 km)
    ZONE2: "ZONE2",         // UI-2: KRB II: Awan Panas Guguran (≤13 km)
    ZONE3: "ZONE3",         // KRB I: Lahar Hujan (≤17 km)
    SAFE: "SAFE",           // Posko Titik Kumpul (>20 km)
    COOLDOWN: "COOLDOWN"    // UI-3: Completion & Cooldown
});

const VIDEO_SOURCES = Object.freeze({
    HOME: "assets/videos/gunung_normal.mp4",
    BRIEFING: "assets/videos/briefing.mp4",
    ERUPTION: "assets/videos/gunung_meletus.mp4",
    ZONE1: "assets/videos/lontaran_material.mp4",
    ZONE2: "assets/videos/awan_panas.mp4",
    ZONE3: "assets/videos/lahar_hujan.mp4",
    SAFE: "assets/videos/zona_aman.mp4",
    COOLDOWN: "assets/videos/gunung_normal.mp4"
});

// Zone Educational Content Specification
const ZONE_CONTENT = Object.freeze({
    BRIEFING: {
        krbBadge: "KRB INFO • Pembekalan Awal",
        title: "Briefing Evakuasi Mandiri",
        radius: "Radius awal: 5 km dari kawah",
        description: "Simak arahan dasar kesiapsiagaan bencana vulkanik sebelum memasuki skenario evakuasi darurat Semeru.",
        actionEyebrow: "PERSIAPAN AWAL",
        actionBody: "Pastikan posisi tubuh menghadap kamera dengan jelas dan berdiri tegak pada jarak 120 cm.",
        dispersionTarget: "Jalur Evakuasi Curah Kobokan & Lapangan Penanggal",
        gestureTitle: "Tunjukkan Gestur Jempol (Thumbs Up)",
        gestureSubtext: "Tahan posisi selama 2 detik untuk memulai simulasi",
        holdDuration: HOLD_DURATION_SHORT,
        stepperId: "stepStart",
        avatarSvg: "thumbs-up"
    },
    ZONE1: {
        krbBadge: "KRB III • Zona Bahaya Sangat Tinggi",
        title: "Zona 1 — Lontaran Material & Abu",
        radius: "Radius bahaya: ≤ 5 km",
        description: "Kawasan rawan bencana paling tinggi yang sering terlanda awan panas, aliran lava, dan lontaran batu pijar.",
        actionEyebrow: "TINDAKAN CEPAT",
        actionBody: "Lindungi kepala dari jatuhan material vulkanik dengan mengangkat kedua tangan di atas kepala.",
        dispersionTarget: "Kawah Jonggring Saloko & Lereng Atas Semeru",
        gestureTitle: "Angkat kedua tangan di atas kepala",
        gestureSubtext: "Tahan posisi selama 5 detik untuk melanjutkan evakuasi",
        holdDuration: HOLD_DURATION_NORMAL,
        stepperId: "stepZone1",
        avatarSvg: "hands-overhead"
    },
    ZONE2: {
        krbBadge: "KRB II • Zona Bahaya Menengah",
        title: "Zona 2 — Awan Panas",
        radius: "Radius bahaya: ≤ 13 km",
        description: "Awan panas merupakan aliran material vulkanik bersuhu tinggi yang bergerak cepat menuruni lereng gunung dan sangat berbahaya.",
        actionEyebrow: "TINDAKAN CEPAT",
        actionBody: "Segera menjauh dari jalur aliran awan panas dan ikuti arah evakuasi menuju zona aman.",
        dispersionTarget: "Lembah Besuk Kobokan & Curah Kobokan",
        gestureTitle: "Arahkan satu tangan ke kanan",
        gestureSubtext: "Tahan posisi selama 5 detik untuk melanjutkan",
        holdDuration: HOLD_DURATION_NORMAL,
        stepperId: "stepZone2",
        avatarSvg: "point-right"
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
        gestureSubtext: "Tahan posisi selama 5 detik untuk melanjutkan evakuasi",
        holdDuration: HOLD_DURATION_NORMAL,
        stepperId: "stepZone3",
        avatarSvg: "arms-crossed"
    },
    SAFE: {
        krbBadge: "🛡️ Kawasan Aman • Di Luar KRB",
        title: "Zona Aman — Titik Kumpul Evakuasi",
        radius: "Radius aman: > 20 km",
        description: "Anda telah mencapai batas aman wilayah pengungsian yang ditetapkan oleh BPBD Jawa Timur.",
        actionEyebrow: "TINDAKAN CEPAT",
        actionBody: "Lapor diri ke posko pengungsian, ikuti pendataan petugas, dan utamakan lansia serta anak-anak.",
        dispersionTarget: "Posko Lapangan Penanggal & Kantor Balai Desa Pasirian",
        gestureTitle: "Lambaikan satu tangan ke kamera",
        gestureSubtext: "Lambaikan tangan untuk menyelesaikan simulasi mitigasi",
        holdDuration: 0, // Wave triggered by dynamic frequency
        stepperId: "stepSafe",
        avatarSvg: "wave"
    }
});

/* ==========================================================================
   DOM ELEMENTS
   ========================================================================== */
const bgVideo = document.getElementById("bgVideo");
const videoFallback = document.getElementById("videoFallback");

// Screens
const screenLanding = document.getElementById("screenLanding");
const screenSimulation = document.getElementById("screenSimulation");
const screenCooldown = document.getElementById("screenCooldown");

// UI-1 Elements
const landingCtaCard = document.getElementById("landingCtaCard");
const landingRingFill = document.getElementById("landingRingFill");

// UI-2 Elements: Stepper
const stepperItems = {
    START: document.getElementById("stepStart"),
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
const labelFacing = document.getElementById("labelFacing");

// UI-2 Elements: Hazard Info Card
const txtKrbLevel = document.getElementById("txtKrbLevel");
const txtZoneTitle = document.getElementById("txtZoneTitle");
const txtDangerRadius = document.getElementById("txtDangerRadius");
const txtZoneDescription = document.getElementById("txtZoneDescription");
const txtQuickActionBody = document.getElementById("txtQuickActionBody");
const txtDispersionTarget = document.getElementById("txtDispersionTarget");

// UI-2 Elements: Gesture Controller Bar
const gestureAvatarBox = document.getElementById("gestureAvatarBox");
const txtGestureTitle = document.getElementById("txtGestureTitle");
const txtGestureSubtext = document.getElementById("txtGestureSubtext");
const txtHoldStatus = document.getElementById("txtHoldStatus");
const txtHoldCounter = document.getElementById("txtHoldCounter");
const gestureProgressBar = document.getElementById("gestureProgressBar");
const btnQuickAdvance = document.getElementById("btnQuickAdvance");

// UI-3 Elements: Cooldown
const cooldownNumber = document.getElementById("cooldownNumber");
const cooldownProgressRing = document.getElementById("cooldownProgressRing");
const btnRestartNow = document.getElementById("btnRestartNow");

// Dev Menu Elements
const devMenuContainer = document.getElementById("devMenuContainer");
const btnDevMenuToggle = document.getElementById("btnDevMenuToggle");
const btnDevMenuClose = document.getElementById("btnDevMenuClose");
const btnToggleCamera = document.getElementById("btnToggleCamera");
const devCamStatus = document.getElementById("devCamStatus");
const btnToggleSound = document.getElementById("btnToggleSound");
const devSoundStatus = document.getElementById("devSoundStatus");
const btnDevSkip = document.getElementById("btnDevSkip");
const distButtons = document.querySelectorAll(".dev-dist-btn");

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
let cooldownInterval = null;
let virtualDistanceKm = 5;
let audioMuted = true;

// Video player management
let activeVideoRequestId = 0;

/* ==========================================================================
   INITIALIZATION & STARTUP
   ========================================================================== */
window.addEventListener("DOMContentLoaded", () => {
    setupEventListeners();
    applyState(STATES.HOME);
    // Background attempt to warm up MediaPipe
    warmupMediaPipe().catch(err => console.log("MediaPipe background warmup note:", err.message));
});

function setupEventListeners() {
    // UI-1: Click CTA card to start
    landingCtaCard.addEventListener("click", () => {
        if (currentState === STATES.HOME) {
            handleGestureSuccess();
        }
    });

    // UI-3: Click restart button
    btnRestartNow.addEventListener("click", () => {
        resetSimulation();
    });

    // UI-2: Quick advance button
    btnQuickAdvance?.addEventListener("click", () => {
        handleGestureSuccess();
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

    distButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            const dist = parseInt(btn.dataset.dist, 10);
            setVirtualDistance(dist);
        });
    });

    // Keyboard Shortcuts
    document.addEventListener("keydown", handleKeyboardShortcut);

    // Window Unload Cleanup
    window.addEventListener("beforeunload", () => {
        stopCamera();
        clearInterval(cooldownInterval);
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
        case "1":
            setVirtualDistance(5);
            break;
        case "2":
            setVirtualDistance(13);
            break;
        case "3":
            setVirtualDistance(17);
            break;
        case "4":
            setVirtualDistance(21);
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
            evaluatePosePresence(currentPose);
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

function evaluatePosePresence(pose) {
    if (!pose) {
        labelFacing.textContent = "Menunggu Pengguna...";
        return;
    }

    const nose = pose[0];
    const leftEye = pose[2];
    const rightEye = pose[5];

    if (isPointVisible(nose, 0.4) && (isPointVisible(leftEye, 0.3) || isPointVisible(rightEye, 0.3))) {
        labelFacing.textContent = "Menghadap Layar";
    } else {
        labelFacing.textContent = "Harap Menghadap Layar";
    }
}

/* ==========================================================================
   GESTURE DETECTION & HOLD MANAGER
   ========================================================================== */
function evaluateActiveGesture(now) {
    if (gestureTriggered || currentState === STATES.COOLDOWN) return;

    let isDetected = false;
    let requiredDuration = HOLD_DURATION_NORMAL;

    switch (currentState) {
        case STATES.HOME:
            isDetected = detectPeaceGesture(currentHands);
            requiredDuration = HOLD_DURATION_SHORT;
            break;

        case STATES.BRIEFING:
            isDetected = detectThumbsUp(currentHands);
            requiredDuration = HOLD_DURATION_SHORT;
            break;

        case STATES.ZONE1:
            isDetected = detectBothHandsRaised(currentPose);
            requiredDuration = HOLD_DURATION_NORMAL;
            break;

        case STATES.ZONE2:
            isDetected = detectPointHorizontal(currentPose);
            requiredDuration = HOLD_DURATION_NORMAL;
            break;

        case STATES.ZONE3:
            isDetected = detectCrossedArms(currentPose);
            requiredDuration = HOLD_DURATION_NORMAL;
            break;

        case STATES.SAFE:
            isDetected = detectWave(currentHands);
            if (isDetected) {
                handleGestureSuccess();
                return;
            }
            break;
    }

    // Update Progress and Hold Timer
    if (isDetected) {
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
            gestureTriggered = true;
            handleGestureSuccess();
        }
    } else {
        // Reset hold
        gestureStartTime = null;
        if (currentState === STATES.HOME) {
            landingRingFill.style.strokeDashoffset = "100";
        }
        gestureProgressBar.style.width = "0%";
        txtHoldStatus.textContent = "Tahan gerakan...";
        const totalSec = Math.round(requiredDuration / 1000);
        txtHoldCounter.textContent = `0 / ${totalSec} detik`;
    }
}

function handleGestureSuccess() {
    gestureTriggered = true;
    gestureStartTime = null;
    gestureProgressBar.style.width = "100%";
    txtHoldStatus.textContent = "Gerakan Selesai!";

    // State transition router
    switch (currentState) {
        case STATES.HOME:
            // Auto activate camera on starting simulation if not yet active
            if (!cameraActive) {
                startCamera();
            }
            applyState(STATES.BRIEFING);
            break;

        case STATES.BRIEFING:
            applyState(STATES.ERUPTION);
            break;

        case STATES.ERUPTION:
            applyState(STATES.ZONE1);
            break;

        case STATES.ZONE1:
            applyState(STATES.ZONE2);
            break;

        case STATES.ZONE2:
            applyState(STATES.ZONE3);
            break;

        case STATES.ZONE3:
            applyState(STATES.SAFE);
            break;

        case STATES.SAFE:
            applyState(STATES.COOLDOWN);
            break;

        case STATES.COOLDOWN:
            resetSimulation();
            break;
    }
}

/* ==========================================================================
   STATE MACHINE & UI ORCHESTRATION
   ========================================================================== */
function applyState(nextState) {
    currentState = nextState;
    gestureTriggered = false;
    gestureStartTime = null;
    resetWaveDetection();
    clearInterval(cooldownInterval);

    console.log("Transisi ke state:", nextState);

    // 1. Manage Screen Views
    if (nextState === STATES.HOME) {
        screenLanding.classList.add("active");
        screenSimulation.classList.remove("active");
        screenCooldown.classList.remove("active");
        playBackgroundVideo(VIDEO_SOURCES.HOME, true);
    } else if (nextState === STATES.COOLDOWN) {
        screenLanding.classList.remove("active");
        screenSimulation.classList.remove("active");
        screenCooldown.classList.add("active");
        playBackgroundVideo(VIDEO_SOURCES.COOLDOWN, true);
        startCooldownTimer();
    } else {
        // Active Simulation States
        screenLanding.classList.remove("active");
        screenSimulation.classList.add("active");
        screenCooldown.classList.remove("active");

        if (nextState === STATES.ERUPTION) {
            playBackgroundVideo(VIDEO_SOURCES.ERUPTION, false, () => {
                applyState(STATES.ZONE1);
            });
            updateEruptionUi();
        } else {
            const config = ZONE_CONTENT[nextState];
            if (config) {
                updateSimulationUi(nextState, config);
                playBackgroundVideo(VIDEO_SOURCES[nextState], true);
            }
        }
    }
}

function updateSimulationUi(stateKey, config) {
    // 1. Update Stepper Breadcrumbs
    updateStepper(config.stepperId);

    // 2. Update Educational Hazard Card
    txtKrbLevel.textContent = config.krbBadge;
    txtZoneTitle.textContent = config.title;
    txtDangerRadius.textContent = config.radius;
    txtZoneDescription.textContent = config.description;
    txtQuickActionBody.textContent = config.actionBody;
    txtDispersionTarget.textContent = config.dispersionTarget;

    // 3. Update Gesture Controller Bar
    txtGestureTitle.textContent = config.gestureTitle;
    txtGestureSubtext.textContent = config.gestureSubtext;
    gestureProgressBar.style.width = "0%";
    const totalSec = Math.round(config.holdDuration / 1000);
    txtHoldCounter.textContent = `0 / ${totalSec} detik`;
    txtHoldStatus.textContent = "Tahan gerakan...";

    // 4. Update Avatar SVG Silhouette
    renderAvatarSilhouette(config.avatarSvg);

    // 5. Update Telemetry Distance display
    const distMap = {
        BRIEFING: 5,
        ZONE1: 5,
        ZONE2: 13,
        ZONE3: 17,
        SAFE: 22
    };
    if (distMap[stateKey]) {
        setVirtualDistance(distMap[stateKey]);
    }
}

function updateEruptionUi() {
    updateStepper("stepStart");
    txtKrbLevel.textContent = "PERINGATAN AWAS • STATUS ERUPSI";
    txtZoneTitle.textContent = "Erupsi Gunung Semeru!";
    txtDangerRadius.textContent = "Aktivitas Vulkanik Meningkat Cepat";
    txtZoneDescription.textContent = "Kawah Semeru meluncurkan awan panas dan lontaran material pijar. Segera lakukan evakuasi menjauhi puncak!";
    txtQuickActionBody.textContent = "Perhatikan arahan darurat dan bersiap mengambil langkah evakuasi di Zona 1.";
    txtDispersionTarget.textContent = "Puncak Jonggring Saloko & Lereng Tenggara";
    txtGestureTitle.textContent = "Bersiap Evakuasi Zona 1";
    txtGestureSubtext.textContent = "Simak situasi erupsi sebelum berpindah rute...";
    renderAvatarSilhouette("warning");
}

function updateStepper(activeId) {
    const stepsInOrder = ["stepStart", "stepZone1", "stepZone2", "stepZone3", "stepSafe"];
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

function renderAvatarSilhouette(type) {
    let svgInner = "";

    switch (type) {
        case "point-right": // UI-2 Style
            svgInner = `
                <circle cx="20" cy="12" r="4.5" fill="#EA580C"/>
                <path d="M19 19H21C22.6 19 24 20.4 24 22V32H16V22C16 20.4 17.4 19 19 19Z" fill="#EA580C"/>
                <path d="M17 32V42M23 32V42" stroke="#EA580C" stroke-width="3" stroke-linecap="round"/>
                <path d="M22 22L36 22M36 22L31 17M36 22L31 27" stroke="#EA580C" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
                <circle cx="41" cy="22" r="2.5" fill="#10B981"/>
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

        case "wave":
            svgInner = `
                <circle cx="24" cy="16" r="4.5" fill="#EA580C"/>
                <path d="M23 23H25C26.6 23 28 24.4 28 26V34H20V26C20 24.4 21.4 23 23 23Z" fill="#EA580C"/>
                <path d="M21 34V44M27 34V44" stroke="#EA580C" stroke-width="3" stroke-linecap="round"/>
                <!-- Waving hand -->
                <path d="M28 25L35 18L32 12" stroke="#EA580C" stroke-width="3" stroke-linecap="round"/>
                <path d="M37 10C39 12 39 16 37 18" stroke="#10B981" stroke-width="2.5" stroke-linecap="round"/>
            `;
            break;

        default:
            svgInner = `
                <circle cx="24" cy="24" r="14" fill="#FFEDD5" stroke="#EA580C" stroke-width="2"/>
                <path d="M24 16V26M24 30V32" stroke="#EA580C" stroke-width="3" stroke-linecap="round"/>
            `;
            break;
    }

    gestureAvatarBox.innerHTML = `
        <svg class="gesture-silhouette-svg" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            ${svgInner}
        </svg>
    `;
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
function setVirtualDistance(distKm) {
    virtualDistanceKm = distKm;
    const cmEstimate = distKm * 10;
    labelDistance.textContent = `Zona Sesuai (${cmEstimate} cm ≈ ${distKm} km)`;
}

/* ==========================================================================
   UI-3: CIRCULAR COUNTDOWN TIMER & RESET
   ========================================================================== */
function startCooldownTimer() {
    let remaining = COOLDOWN_SECONDS;
    cooldownNumber.textContent = String(remaining);

    // Circumference for r=66 is 414.7
    const circumference = 414.7;
    cooldownProgressRing.style.strokeDashoffset = "0";

    clearInterval(cooldownInterval);
    cooldownInterval = setInterval(() => {
        remaining--;
        cooldownNumber.textContent = String(remaining);

        const fraction = (COOLDOWN_SECONDS - remaining) / COOLDOWN_SECONDS;
        const offset = fraction * circumference;
        cooldownProgressRing.style.strokeDashoffset = String(offset);

        if (remaining <= 0) {
            clearInterval(cooldownInterval);
            resetSimulation();
        }
    }, 1000);
}

function resetSimulation() {
    clearInterval(cooldownInterval);
    applyState(STATES.HOME);
}
