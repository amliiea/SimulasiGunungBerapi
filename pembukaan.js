import { FilesetResolver, HandLandmarker } from "./assets/mediapipe/vision_bundle.mjs";

const MEDIAPIPE_WASM_URL = "./assets/mediapipe/wasm";
const HAND_MODEL_URL = "./assets/models/hand_landmarker.task";

const audio = document.getElementById("openingAudio");
const caption = document.getElementById("openingCaption");
const mascot = document.querySelector(".opening-mascot");
const mascotTrigger = document.getElementById("mascotTrigger");
const openingScreen = document.querySelector(".opening-screen");
const touchlessIndicator = document.getElementById("touchlessIndicator");
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
   TOUCHLESS GESTURE TRACKING (2 FINGERS HOVER & PINCH CLICK)
   ========================================================================== */
let handLandmarker = null;
let touchlessVideo = null;
let touchlessStream = null;
let touchlessAnimFrame = null;
let cursorEl = null;
let cursorX = window.innerWidth / 2;
let cursorY = window.innerHeight / 2;
let isHoveringMascot = false;
let hasGestureClicked = false;
let wasOpenBefore = false;
let pinchFrameCount = 0;

function initTouchlessCursor() {
    cursorEl = document.createElement("div");
    cursorEl.id = "virtualCursor";
    cursorEl.className = "virtual-cursor";
    cursorEl.innerHTML = `
        <div class="cursor-dot"></div>
        <div class="cursor-ring"></div>
    `;
    document.body.appendChild(cursorEl);
}

async function startTouchless() {
    initTouchlessCursor();

    touchlessVideo = document.createElement("video");
    touchlessVideo.autoplay = true;
    touchlessVideo.muted = true;
    touchlessVideo.playsInline = true;
    touchlessVideo.style.display = "none";
    document.body.appendChild(touchlessVideo);

    try {
        touchlessStream = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480, facingMode: "user" },
            audio: false
        });
        touchlessVideo.srcObject = touchlessStream;
        await touchlessVideo.play();

        const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
        handLandmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: HAND_MODEL_URL,
                delegate: "CPU"
            },
            runningMode: "VIDEO",
            numHands: 1,
            minHandDetectionConfidence: 0.45,
            minHandPresenceConfidence: 0.45,
            minTrackingConfidence: 0.45
        });

        detectTouchlessLoop();
    } catch (err) {
        console.warn("Touchless Hand Detection tidak dapat diinisialisasi (kamera sibuk/ditolak). Fallback mouse tetap aktif.", err);
        if (touchlessIndicator) touchlessIndicator.classList.add("is-hidden");
    }
}

function stopTouchless() {
    if (touchlessAnimFrame) {
        cancelAnimationFrame(touchlessAnimFrame);
        touchlessAnimFrame = null;
    }
    if (touchlessStream) {
        touchlessStream.getTracks().forEach(track => track.stop());
        touchlessStream = null;
    }
    if (cursorEl) {
        cursorEl.remove();
        cursorEl = null;
    }
    if (touchlessVideo) {
        touchlessVideo.remove();
        touchlessVideo = null;
    }
}

let lastVideoTime = -1;
function detectTouchlessLoop() {
    if (pageTransitionStarted) return;

    try {
        if (touchlessVideo && touchlessVideo.readyState >= 2 && touchlessVideo.currentTime !== lastVideoTime) {
            lastVideoTime = touchlessVideo.currentTime;
            const now = performance.now();
            const results = handLandmarker.detectForVideo(touchlessVideo, now);

            if (results && results.landmarks && results.landmarks.length > 0) {
                const lm = results.landmarks[0];
                const indexTip = lm[8];
                const thumbTip = lm[4];
                const middleTip = lm[12];
                const wrist = lm[0];
                const middleMcp = lm[9];

                // Ukuran telapak tangan sebagai acuan skala dinamis (jarak pergelangan ke pangkal jari)
                const handScale = Math.hypot(middleMcp.x - wrist.x, middleMcp.y - wrist.y) || 0.2;

                const rawDistThumb = Math.hypot(indexTip.x - thumbTip.x, indexTip.y - thumbTip.y);
                const rawDistMiddle = Math.hypot(indexTip.x - middleTip.x, indexTip.y - middleTip.y);

                const relDistThumb = rawDistThumb / handScale;
                const relDistMiddle = rawDistMiddle / handScale;

                let midX = 0;
                let midY = 0;
                let relDist = 0;

                if (relDistMiddle < relDistThumb) {
                    midX = (indexTip.x + middleTip.x) / 2;
                    midY = (indexTip.y + middleTip.y) / 2;
                    relDist = relDistMiddle;
                } else {
                    midX = (indexTip.x + thumbTip.x) / 2;
                    midY = (indexTip.y + thumbTip.y) / 2;
                    relDist = relDistThumb;
                }

                // Rasio normal: terbuka > 0.30, dirapatkan < 0.16
                const isOpen = relDist > 0.28;
                const isClosed = relDist < 0.15;

                if (isOpen) {
                    wasOpenBefore = true;
                    pinchFrameCount = 0;
                } else if (isClosed) {
                    pinchFrameCount++;
                }

                // Klik hanya valid jika sebelumnya posisi 2 jari terbuka lalu sengaja dirapatkan
                const isPinching = wasOpenBefore && isClosed && pinchFrameCount >= 2;

                // Cermin X agar intuitif seperti melihat cermin
                const targetX = (1 - midX) * window.innerWidth;
                const targetY = midY * window.innerHeight;

                cursorX += (targetX - cursorX) * 0.42;
                cursorY += (targetY - cursorY) * 0.42;

                if (cursorEl) {
                    cursorEl.style.transform = `translate3d(${cursorX}px, ${cursorY}px, 0)`;
                    cursorEl.classList.add("is-active");
                    cursorEl.classList.toggle("is-pinching", isPinching);
                }

                const rect = mascotTrigger.getBoundingClientRect();
                const inMascot = cursorX >= (rect.left - 30) && cursorX <= (rect.right + 30) &&
                                 cursorY >= (rect.top - 30) && cursorY <= (rect.bottom + 30);

                if (inMascot && !hasGestureClicked) {
                    if (!isHoveringMascot) {
                        isHoveringMascot = true;
                        mascotTrigger.classList.add("is-touchless-hovered");
                        if (cursorEl) cursorEl.classList.add("is-hovering");
                    }

                    // KLIK HANYA SAAT 2 UJUNG JARI DIRAPATKAN (PINCH)
                    if (isPinching) {
                        triggerTouchlessClick();
                    }
                } else {
                    if (isHoveringMascot) {
                        isHoveringMascot = false;
                        mascotTrigger.classList.remove("is-touchless-hovered");
                        if (cursorEl) cursorEl.classList.remove("is-hovering");
                    }
                }
            } else {
                wasOpenBefore = false;
                pinchFrameCount = 0;
                if (cursorEl) {
                    cursorEl.classList.remove("is-active", "is-hovering", "is-pinching");
                }
                if (isHoveringMascot) {
                    isHoveringMascot = false;
                    mascotTrigger.classList.remove("is-touchless-hovered");
                }
            }
        }
    } catch (e) {
        console.error("Touchless loop error:", e);
    }

    if (!pageTransitionStarted && !hasGestureClicked) {
        touchlessAnimFrame = requestAnimationFrame(detectTouchlessLoop);
    }
}

function triggerTouchlessClick() {
    if (hasGestureClicked) return;
    hasGestureClicked = true;

    if (cursorEl) cursorEl.classList.add("is-clicked");
    mascotTrigger.classList.add("is-clicked-pulse");

    if (touchlessIndicator) {
        touchlessIndicator.classList.add("is-hidden");
    }

    mascotTrigger.click();

    setTimeout(() => {
        stopTouchless();
    }, 800);
}

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
    stopTouchless();
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
    mascotTrigger.setAttribute("aria-pressed", "true");
    mascot.classList.add("has-started");

    audio.play().catch(error => {
        console.error("Audio pembukaan gagal diputar setelah maskot diklik.", error);
        narrationStarted = false;
        mascotTrigger.setAttribute("aria-pressed", "false");
        mascot.classList.remove("has-started");
    });
});

if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", startTouchless);
} else {
    startTouchless();
}
