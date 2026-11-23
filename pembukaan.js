import { FilesetResolver, HandLandmarker } from "./assets/mediapipe/vision_bundle.mjs";
import { detectPeaceGesture } from "./gesture3.js";

const audio = document.getElementById("openingAudio");
const caption = document.getElementById("openingCaption");
const mascot = document.querySelector(".opening-mascot");
const mascotTrigger = document.getElementById("mascotTrigger");
const openingScreen = document.querySelector(".opening-screen");
const openingWebcam = document.getElementById("openingWebcam");
const openingGesturePill = document.getElementById("openingGesturePill");
const openingRingFill = document.getElementById("openingRingFill");
const openingGestureText = document.getElementById("openingGestureText");

const MEDIAPIPE_WASM_URL = "./assets/mediapipe/wasm";
const HAND_MODEL_URL = "./assets/models/hand_landmarker.task";
const GESTURE_HOLD_DURATION_MS = 1400; // 1.4 detik tahan dua jari
const RING_CIRCUMFERENCE = 88; // 2 * PI * 14 ~= 88

const CAPTION_SWITCH_DELAY_MS = 100;
const PAGE_TRANSITION_MS = 600;
const SIMULATION_PROMPT_AUDIO_SRC = "assets/Audio/Ayo%20coba%20simulasi.mp3";

const captions = [
    { time: 0, text: "Selamat datang di simulasi mitigasi erupsi Gunung Semeru." },
    { time: 4, text: "Kamu adalah warga Dusun Supiturang, Lumajang." },
    { time: 7, text: "Rumahmu berada sekitar 7 km dari puncak Gunung Semeru." },
    { time: 10.8, text: "Namun, saat erupsi terjadi, kamu sedang berada di area sekitar 5 km dari puncak Semeru." }
];

let activeCaptionIndex = -1;
let captionTransitionTimer = null;
let narrationStarted = false;
let openingNarrationActive = true;
let simulationPromptStarted = false;
let simulationPromptNeedsUserGesture = false;
let pageTransitionStarted = false;

/* ==========================================================================
   TOUCHLESS GESTURE ENGINE (MEDIA PIPE PEACE SIGN)
   ========================================================================== */
let openingCameraStream = null;
let openingHandLandmarker = null;
let gestureHoldStart = null;
let animationFrameId = null;

function updateGestureProgress(fraction) {
    if (!openingRingFill) return;
    const clamped = Math.max(0, Math.min(1, fraction));
    const offset = RING_CIRCUMFERENCE * (1 - clamped);
    openingRingFill.style.strokeDashoffset = offset;
    if (openingGesturePill) {
        openingGesturePill.classList.toggle("is-active", clamped > 0);
    }
}

async function initOpeningCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
            audio: false
        });
        openingCameraStream = stream;
        openingWebcam.srcObject = stream;
        await openingWebcam.play();

        const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
        openingHandLandmarker = await HandLandmarker.createFromOptions(vision, {
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

        if (openingGestureText) {
            openingGestureText.textContent = "Angkat 2 Jari atau Klik Maskot";
        }
        animationFrameId = requestAnimationFrame(detectOpeningGestureLoop);
    } catch (err) {
        console.warn("Kamera tidak aktif untuk gesture pembukaan, gunakan klik mouse:", err);
        if (openingGestureText) {
            openingGestureText.textContent = "Klik Maskot untuk Mulai";
        }
    }
}

let lastVideoTime = -1;
function detectOpeningGestureLoop() {
    if (narrationStarted) {
        stopOpeningCamera();
        return;
    }

    try {
        if (openingWebcam && openingWebcam.readyState >= 2 && openingWebcam.currentTime !== lastVideoTime) {
            lastVideoTime = openingWebcam.currentTime;
            const now = performance.now();
            const results = openingHandLandmarker.detectForVideo(openingWebcam, now);
            const isPeace = results.landmarks && detectPeaceGesture(results.landmarks);

            if (isPeace) {
                if (!gestureHoldStart) {
                    gestureHoldStart = now;
                }
                const elapsed = now - gestureHoldStart;
                const progress = Math.min(1, elapsed / GESTURE_HOLD_DURATION_MS);
                updateGestureProgress(progress);
                if (openingGestureText) openingGestureText.textContent = "Tahan 2 jari...";

                if (elapsed >= GESTURE_HOLD_DURATION_MS) {
                    updateGestureProgress(1);
                    if (openingGestureText) openingGestureText.textContent = "Memulai...";
                    stopOpeningCamera();
                    mascotTrigger.click();
                    return;
                }
            } else {
                gestureHoldStart = null;
                updateGestureProgress(0);
                if (openingGestureText) openingGestureText.textContent = "Angkat 2 Jari atau Klik Maskot";
            }
        }
    } catch (e) {
        console.warn("Hand tracking frame error:", e);
    }

    if (!narrationStarted) {
        animationFrameId = requestAnimationFrame(detectOpeningGestureLoop);
    }
}

function stopOpeningCamera() {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    if (openingCameraStream) {
        openingCameraStream.getTracks().forEach(track => track.stop());
        openingCameraStream = null;
    }
}

window.addEventListener("beforeunload", stopOpeningCamera);
initOpeningCamera();

function updateCaption() {
    if (!openingNarrationActive) {
        return;
    }

    const time = audio.currentTime;
    const nextIndex = captions.reduce(
        (latestIndex, item, index) => time >= item.time ? index : latestIndex,
        -1
    );

    if (nextIndex === activeCaptionIndex) {
        return;
    }

    activeCaptionIndex = nextIndex;
    window.clearTimeout(captionTransitionTimer);
    caption.classList.remove("is-visible");
    captionTransitionTimer = window.setTimeout(() => {
        caption.textContent = captions[nextIndex]?.text ?? "";
        if (captions[nextIndex]) {
            caption.classList.add("is-visible");
        }
    }, CAPTION_SWITCH_DELAY_MS);
}

function transitionToSimulation() {
    if (pageTransitionStarted) {
        return;
    }

    pageTransitionStarted = true;
    openingScreen.classList.add("is-leaving");
    window.setTimeout(() => {
        window.location.href = "index.html?fromOpening=1";
    }, PAGE_TRANSITION_MS);
}

function playSimulationPrompt() {
    simulationPromptNeedsUserGesture = false;
    audio.play().catch(error => {
        if (error.name === "NotAllowedError") {
            simulationPromptNeedsUserGesture = true;
            caption.textContent = "Klik maskot untuk melanjutkan simulasi.";
            caption.classList.add("is-visible");
            console.warn("Browser memblokir audio ajakan simulasi.", error);
            return;
        }

        console.error("Audio ajakan simulasi gagal diputar.", error);
        transitionToSimulation();
    });
}

function startSimulationPrompt() {
    simulationPromptStarted = true;
    openingNarrationActive = false;
    window.clearTimeout(captionTransitionTimer);
    caption.classList.remove("is-visible");
    caption.textContent = "";
    audio.src = SIMULATION_PROMPT_AUDIO_SRC;
    audio.load();
    playSimulationPrompt();
}

audio.addEventListener("timeupdate", updateCaption);
audio.addEventListener("play", () => {
    if (openingNarrationActive) {
        updateCaption();
    } else {
        simulationPromptNeedsUserGesture = false;
        caption.classList.remove("is-visible");
    }
});
audio.addEventListener("ended", () => {
    if (!simulationPromptStarted) {
        startSimulationPrompt();
        return;
    }

    transitionToSimulation();
});
audio.addEventListener("error", () => {
    if (simulationPromptStarted) {
        console.error("Audio ajakan simulasi gagal dimuat.", audio.error);
        transitionToSimulation();
        return;
    }

    console.error("Audio pembukaan gagal dimuat.", audio.error);
});

mascotTrigger.addEventListener("click", () => {
    if (simulationPromptNeedsUserGesture) {
        playSimulationPrompt();
        return;
    }

    if (narrationStarted) {
        return;
    }

    narrationStarted = true;
    stopOpeningCamera();
    if (openingGesturePill) {
        openingGesturePill.style.opacity = "0";
        setTimeout(() => { openingGesturePill.style.display = "none"; }, 300);
    }
    mascotTrigger.setAttribute("aria-pressed", "true");
    mascot.classList.add("has-started");

    audio.play().catch(error => {
        console.error("Audio pembukaan gagal diputar setelah maskot diklik.", error);
        narrationStarted = false;
        mascotTrigger.setAttribute("aria-pressed", "false");
        mascot.classList.remove("has-started");
        if (openingGesturePill) {
            openingGesturePill.style.display = "inline-flex";
            openingGesturePill.style.opacity = "1";
        }
    });
});

window.addEventListener("keydown", event => {
    if (event.key === " " || event.key === "Enter") {
        mascotTrigger.click();
    }
});
