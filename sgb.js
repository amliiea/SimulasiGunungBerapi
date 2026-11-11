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

const MEDIAPIPE_WASM_URL =
    new URL("./assets/mediapipe/wasm/", import.meta.url).href;

const POSE_MODEL_URL =
    new URL("./assets/models/pose_landmarker_lite.task", import.meta.url).href;

const HAND_MODEL_URL =
    new URL("./assets/models/hand_landmarker.task", import.meta.url).href;

const HOLD_DURATION = 2000;
const BODY_LOST_GRACE_PERIOD = 5000;
const INACTIVITY_LIMIT = 180000;
const COOLDOWN_DURATION = 20;
const BRIEFING_DISTANCE_CM = 5;
const POST_THUMBS_UP_DELAY = 2000;

const STATES = Object.freeze({
    HOME: "HOME",
    BRIEFING: "BRIEFING",
    ZONE1: "ZONE1",
    MOVE2: "MOVE2",
    ZONE2: "ZONE2",
    MOVE3: "MOVE3",
    ZONE3: "ZONE3",
    MOVE_SAFE: "MOVE_SAFE",
    SAFE: "SAFE",
    COOLDOWN: "COOLDOWN"
});

const SUBSTATES = Object.freeze({
    MATERI: "MATERI",
    DETEKSI_GESTUR: "DETEKSI_GESTUR",
    TRANSISI_JARAK: "TRANSISI_JARAK",
    JEDA_TRANSISI: "JEDA_TRANSISI",
    FEEDBACK: "FEEDBACK"
});

const videos = Object.freeze({
    HOME: "assets/videos/gunung_normal.mp4",
    BRIEFING: "assets/videos/briefing.mp4",
    ERUPTION: "assets/videos/gunung_meletus.mp4",
    ZONE1: "assets/videos/lontaran_material.mp4",
    ZONE2: "assets/videos/awan_panas.mp4",
    ZONE3: "assets/videos/lahar_hujan.mp4",
    SAFE: "assets/videos/zona_aman.mp4"
});

const videoDetails = Object.freeze({
    HOME: {
        title: "Gunung Semeru",
        message: "Gunung Semeru dalam kondisi normal."
    },
    BRIEFING: {
        title: "Briefing evakuasi",
        message: "Simak arahan awal sebelum memulai proses evakuasi."
    },
    ZONE1: {
        title: "Bahaya Zona 1",
        message: "Waspadai lontaran material vulkanik dan abu. Lindungi kepala."
    },
    ZONE2: {
        title: "Bahaya Zona 2",
        message: "Awan panas guguran dapat meluncur cepat dan membahayakan."
    },
    ZONE3: {
        title: "Bahaya Zona 3",
        message: "Waspadai aliran lahar dingin, terutama di sepanjang sungai."
    },
    SAFE: {
        title: "Posko pengungsian",
        message: "Anda telah berada di zona aman. Tetap ikuti arahan petugas."
    }
});

const videoElement = document.getElementById("outputVideo");
const webcam = document.getElementById("webcam");
const canvas = document.getElementById("poseCanvas");
const ctx = canvas.getContext("2d");
const startCameraButton = document.getElementById("startCamera");
const stopCameraButton = document.getElementById("stopCamera");
const playButton = document.getElementById("playButton");
const stageTitle = document.getElementById("stage-title");
const instruction = document.getElementById("instruction");
const gestureStatus = document.getElementById("gesture-status");
const gestureOutput = document.getElementById("gesture-output");
const cameraStatus = document.getElementById("camera-status");
const systemStatus = document.getElementById("system-status");
const distanceStatus = document.getElementById("distance-status");
const zoneLabel = document.getElementById("zone-label");
const outputPlaceholder = document.getElementById("output-placeholder");
const outputPlaceholderTitle = document.getElementById("output-placeholder-title");
const outputPlaceholderMessage = document.getElementById("output-placeholder-message");
const cameraPlaceholder = document.getElementById("camera-placeholder");
const personStatus = document.getElementById("person-status");

let poseLandmarker = null;
let handLandmarker = null;
let cameraStream = null;
let cameraActive = false;
let cameraStarting = false;
let mediapipeReady = false;
let animationFrame = null;
let lastVideoTime = -1;
let currentPose = null;
let currentHands = [];
let currentState = STATES.HOME;
let zoneSubstate = null;
let virtualDistanceCm = BRIEFING_DISTANCE_CM;
let gestureStartTime = null;
let gestureAlreadyTriggered = false;
let noPersonSince = null;
let cooldownTimer = null;
let videoFallbackTimer = null;
let transitionTimer = null;
let videoRequestId = 0;
let failedVideoRequestId = null;
let mediaPipeInitialization = null;

function readDistanceCm() {
    return virtualDistanceCm;
}

function setDistanceStatus(distanceCm) {
    distanceStatus.textContent = `${distanceCm} cm ≈ ${distanceCm} km`;
}

function resetGestureHold() {
    gestureStartTime = null;
    gestureAlreadyTriggered = false;
}

function invalidateVideo() {
    videoRequestId++;
    failedVideoRequestId = null;
    clearTimeout(videoFallbackTimer);
    videoFallbackTimer = null;
    videoElement.onended = null;
    videoElement.onerror = null;
    videoElement.pause();
}

function showVideoPlaceholder(title, message) {
    outputPlaceholderTitle.textContent = title;
    outputPlaceholderMessage.textContent = message;
    outputPlaceholder.style.display = "flex";
    videoElement.style.display = "none";
}

function playVideo(source, { loop = false, onEnded = null, state = currentState } = {}) {
    invalidateVideo();
    const requestId = videoRequestId;
    videoElement.loop = loop;
    videoElement.src = new URL(source, import.meta.url).href;
    videoElement.style.display = "block";
    outputPlaceholder.style.display = "none";
    videoElement.onended = () => {
        if (requestId === videoRequestId && currentState === state && onEnded) {
            onEnded();
        }
    };
    videoElement.onerror = () => {
        handleVideoFailure(requestId, source, state, onEnded);
    };
    videoElement.load();

    videoElement.play().catch(error => {
        handleVideoFailure(requestId, source, state, onEnded, error);
    });
}

function handleVideoFailure(requestId, source, state, onEnded, error = null) {
    if (
        requestId !== videoRequestId ||
        currentState !== state ||
        failedVideoRequestId === requestId
    ) {
        return;
    }
    failedVideoRequestId = requestId;

    if (error) {
        console.error(`Video gagal diputar (${source}):`, error);
    } else {
        console.error(`File video tidak dapat dimuat: ${source}`);
    }

    const details = videoDetails[state];
    showVideoPlaceholder(
        details?.title ?? "Video simulasi tidak tersedia",
        `${details?.message ?? "Materi tetap dapat dilanjutkan."} File video tidak ditemukan; simulasi dilanjutkan tanpa video.`
    );

    if (onEnded) {
        videoFallbackTimer = setTimeout(() => {
            if (
                requestId === videoRequestId &&
                currentState === state &&
                onEnded
            ) {
                onEnded();
            }
        }, 0);
    }
}

function stopVideo() {
    invalidateVideo();
    videoElement.removeAttribute("src");
    videoElement.load();
    videoElement.style.display = "none";
}

async function initializeMediaPipe() {
    if (mediapipeReady) {
        return;
    }

    if (!mediaPipeInitialization) {
        mediaPipeInitialization = (async () => {
            systemStatus.textContent = "MEMUAT MEDIAPIPE...";
            const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
            let pose = null;

            try {
                pose = await PoseLandmarker.createFromOptions(vision, {
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
                const hand = await HandLandmarker.createFromOptions(
                    vision,
                    {
                        baseOptions: {
                            modelAssetPath: HAND_MODEL_URL,
                            delegate: "CPU"
                        },
                        runningMode: "VIDEO",
                        numHands: 2,
                        minHandDetectionConfidence: 0.45,
                        minHandPresenceConfidence: 0.45,
                        minTrackingConfidence: 0.45
                    }
                );
                poseLandmarker = pose;
                handLandmarker = hand;
            } catch (error) {
                pose?.close();
                throw error;
            }

            mediapipeReady = true;
            systemStatus.textContent = "MEDIAPIPE SIAP";
            console.log("MediaPipe Pose dan Hand Landmarker siap.");
        })();
    }

    try {
        await mediaPipeInitialization;
    } catch (error) {
        mediaPipeInitialization = null;
        systemStatus.textContent = "MEDIA PIPE ERROR";
        cameraStatus.textContent = "MEDIA PIPE ERROR";
        gestureStatus.textContent = `MediaPipe gagal dimuat: ${error.message}`;
        console.error("Gagal memuat MediaPipe:", error);
        alert(
            `MediaPipe gagal dimuat: ${error.message}\n\n` +
            "Pastikan koneksi internet aktif dan model tersedia di assets/models."
        );
        throw error;
    }
}

async function startCamera() {
    if (cameraActive || cameraStarting) {
        return;
    }

    cameraStarting = true;
    startCameraButton.disabled = true;
    cameraStatus.textContent = "MEMUAT MEDIAPIPE...";

    try {
        await initializeMediaPipe();
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
        canvas.width = webcam.videoWidth;
        canvas.height = webcam.videoHeight;
        cameraActive = true;
        lastVideoTime = -1;
        noPersonSince = null;
        cameraPlaceholder.style.display = "none";
        cameraStatus.textContent = "KAMERA AKTIF";
        systemStatus.textContent = "SISTEM AKTIF";
        personStatus.textContent = "Menunggu pengguna...";
        stopCameraButton.disabled = false;
        animationFrame = requestAnimationFrame(detectFrame);
    } catch (error) {
        cameraStream?.getTracks().forEach(track => track.stop());
        cameraStream = null;
        webcam.srcObject = null;
        startCameraButton.disabled = false;
        cameraStatus.textContent = mediapipeReady
            ? "KAMERA OFF"
            : "MEDIA PIPE ERROR";
        console.error("Kamera gagal diaktifkan:", error);
        if (mediapipeReady) {
            alert(`Kamera tidak dapat diakses: ${error.message}`);
        }
    } finally {
        cameraStarting = false;
    }
}

function stopCamera() {
    cameraActive = false;
    if (animationFrame !== null) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
    }
    cameraStream?.getTracks().forEach(track => track.stop());
    cameraStream = null;
    webcam.srcObject = null;
    currentPose = null;
    currentHands = [];
    noPersonSince = null;
    resetGestureHold();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    cameraPlaceholder.style.display = "flex";
    cameraStatus.textContent = "KAMERA OFF";
    personStatus.textContent = "Menunggu pengguna...";
    startCameraButton.disabled = false;
    stopCameraButton.disabled = true;
    systemStatus.textContent = mediapipeReady
        ? "MEDIAPIPE SIAP"
        : "SISTEM STANDBY";
}

function pointVisible(point, threshold = 0.35) {
    return Boolean(point && (point.visibility ?? 1) >= threshold);
}

function isBodyDetected(pose) {
    if (!pose) {
        return false;
    }
    return [11, 12, 23, 24].every(index =>
        pointVisible(pose[index], 0.3)
    );
}

function isFaceDetected(pose) {
    if (!pose) {
        return false;
    }
    const noseVisible = pointVisible(pose[0], 0.4);
    const eyeOrEarVisible = [2, 5, 7, 8].some(index =>
        pointVisible(pose[index], 0.3)
    );
    return noseVisible && eyeOrEarVisible;
}

function drawLandmarks(pose, hands) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (pose) {
        const connections = [
            [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
            [11, 23], [12, 24], [23, 24]
        ];
        ctx.strokeStyle = "#00ff99";
        ctx.lineWidth = 4;
        for (const [start, end] of connections) {
            const first = pose[start];
            const second = pose[end];
            if (!pointVisible(first) || !pointVisible(second)) {
                continue;
            }
            ctx.beginPath();
            ctx.moveTo(first.x * canvas.width, first.y * canvas.height);
            ctx.lineTo(second.x * canvas.width, second.y * canvas.height);
            ctx.stroke();
        }
        for (const point of pose) {
            if (!pointVisible(point)) {
                continue;
            }
            ctx.beginPath();
            ctx.arc(
                point.x * canvas.width,
                point.y * canvas.height,
                5,
                0,
                Math.PI * 2
            );
            ctx.fillStyle = "#00ff99";
            ctx.fill();
        }
    }

    for (const hand of hands) {
        for (const point of hand) {
            ctx.beginPath();
            ctx.arc(
                point.x * canvas.width,
                point.y * canvas.height,
                4,
                0,
                Math.PI * 2
            );
            ctx.fillStyle = "#00ccff";
            ctx.fill();
        }
    }
}

function detectFrame() {
    if (!cameraActive) {
        return;
    }

    try {
        if (webcam.readyState >= 2 && webcam.currentTime !== lastVideoTime) {
            lastVideoTime = webcam.currentTime;
            const timestamp = performance.now();
            const poseResults = poseLandmarker.detectForVideo(webcam, timestamp);
            const handResults = handLandmarker.detectForVideo(webcam, timestamp);
            currentPose = poseResults.landmarks?.[0] ?? null;
            currentHands = handResults.landmarks ?? [];
            drawLandmarks(currentPose, currentHands);
            processDetection(timestamp);
        }
    } catch (error) {
        console.error("Kesalahan deteksi MediaPipe:", error);
        systemStatus.textContent = "ERROR DETEKSI MEDIAPIPE";
        gestureStatus.textContent = `Deteksi gagal: ${error.message}`;
        stopCamera();
        return;
    }

    if (cameraActive) {
        animationFrame = requestAnimationFrame(detectFrame);
    }
}

function updatePresence(now) {
    const bodyDetected = isBodyDetected(currentPose);

    if (bodyDetected) {
        noPersonSince = null;
        personStatus.textContent = isFaceDetected(currentPose)
            ? "Pengguna terdeteksi."
            : "Wajah tidak terdeteksi. Harap tetap menghadap layar.";
        return true;
    }

    if (noPersonSince === null) {
        noPersonSince = now;
    }

    const missingFor = now - noPersonSince;
    if (missingFor >= INACTIVITY_LIMIT) {
        resetSimulation("Pengguna tidak terdeteksi selama 180 detik.");
        return false;
    }

    if (missingFor < BODY_LOST_GRACE_PERIOD) {
        personStatus.textContent = "Tubuh sementara tidak terdeteksi...";
    } else {
        personStatus.textContent = "Pengguna tidak terdeteksi.";
    }
    return false;
}

function updateBriefingPosition() {
    const distance = readDistanceCm();
    if (distance < BRIEFING_DISTANCE_CM) {
        gestureStatus.textContent = "Mundur sedikit";
        return false;
    }
    if (distance > BRIEFING_DISTANCE_CM) {
        gestureStatus.textContent = "Maju sedikit";
        return false;
    }
    gestureStatus.textContent = "Posisi sesuai";
    return true;
}

function getGestureForCurrentState() {
    if (currentState === STATES.HOME) {
        return {
            name: "PEACE",
            detected: detectPeaceGesture(currentHands)
        };
    }

    if (currentState === STATES.BRIEFING) {
        if (zoneSubstate !== SUBSTATES.DETEKSI_GESTUR) {
            return null;
        }
        if (!updateBriefingPosition()) {
            return { name: "THUMBS UP", detected: false };
        }
        return {
            name: "THUMBS UP",
            detected: detectThumbsUp(currentHands)
        };
    }

    if (zoneSubstate !== SUBSTATES.DETEKSI_GESTUR) {
        return null;
    }

    switch (currentState) {
        case STATES.ZONE1:
            return {
                name: "KEDUA TANGAN DI ATAS KEPALA",
                detected: detectBothHandsRaised(currentPose)
            };
        case STATES.ZONE2:
            return {
                name: "TANGAN MENUNJUK KE SAMPING",
                detected: detectPointHorizontal(currentPose)
            };
        case STATES.ZONE3:
            return {
                name: "TANGAN MENYILANG",
                detected: detectCrossedArms(currentPose)
            };
        case STATES.SAFE:
            return {
                name: "MELAMBAIKAN TANGAN",
                detected: detectWave(currentHands),
                holdDuration: 0
            };
        default:
            return null;
    }
}

function processDetection(now) {
    if (!cameraActive) {
        return;
    }

    const bodyDetected = updatePresence(now);
    if (currentState === STATES.COOLDOWN) {
        return;
    }
    if (!bodyDetected) {
        resetGestureHold();
        detectWave([]);
        if (now - noPersonSince >= BODY_LOST_GRACE_PERIOD) {
            gestureOutput.textContent = "Gestur dijeda karena tubuh tidak terdeteksi.";
        }
        return;
    }

    const gesture = getGestureForCurrentState();
    if (!gesture) {
        return;
    }

    if (!gesture.detected) {
        gestureOutput.textContent = "Belum ada gestur yang sesuai.";
        resetGestureHold();
        updateBriefingPositionIfNeeded();
        return;
    }

    gestureOutput.textContent = `Gestur: ${gesture.name}`;
    handleGestureHold(now, gesture.holdDuration ?? HOLD_DURATION);
}

function updateBriefingPositionIfNeeded() {
    if (currentState === STATES.BRIEFING) {
        updateBriefingPosition();
    }
}

function handleGestureHold(now, requiredDuration = HOLD_DURATION) {
    if (gestureAlreadyTriggered) {
        return;
    }

    if (gestureStartTime === null) {
        gestureStartTime = now;
    }

    const elapsed = now - gestureStartTime;
    const remaining = Math.max(0, Math.ceil((requiredDuration - elapsed) / 1000));
    if (requiredDuration > 0) {
        gestureStatus.textContent = `Pertahankan gestur ${remaining} detik...`;
    }

    if (elapsed < requiredDuration) {
        return;
    }

    gestureAlreadyTriggered = true;
    handleGestureSuccess();
}

function handleGestureSuccess() {
    gestureOutput.textContent = "Gestur berhasil!";

    switch (currentState) {
        case STATES.HOME:
            startSimulation();
            break;
        case STATES.BRIEFING:
            startPostBriefingTransition();
            break;
        case STATES.ZONE1:
            showZone1SuccessFeedback();
            break;
        case STATES.ZONE2:
            setState(STATES.MOVE3);
            break;
        case STATES.ZONE3:
            setState(STATES.MOVE_SAFE);
            break;
        case STATES.SAFE:
            setState(STATES.COOLDOWN);
            break;
    }
}

function showZone1SuccessFeedback() {
    zoneSubstate = SUBSTATES.FEEDBACK;
    resetGestureHold();
    gestureOutput.textContent = "SIP! Kedua tangan berhasil terdeteksi!";
    gestureStatus.textContent = "Bersiap mundur menuju Zona 2...";

    clearTimeout(transitionTimer);
    transitionTimer = setTimeout(() => {
        transitionTimer = null;
        if (
            currentState === STATES.ZONE1 &&
            zoneSubstate === SUBSTATES.FEEDBACK
        ) {
            setState(STATES.MOVE2);
        }
    }, 1500);
}

function startPostBriefingTransition() {
    zoneSubstate = SUBSTATES.JEDA_TRANSISI;
    resetGestureHold();
    gestureOutput.textContent = "Gestur Thumbs Up berhasil!";
    gestureStatus.textContent = "Video gunung meletus dimulai dalam 2 detik...";

    clearTimeout(transitionTimer);
    transitionTimer = setTimeout(() => {
        transitionTimer = null;
        if (
            currentState !== STATES.BRIEFING ||
            zoneSubstate !== SUBSTATES.JEDA_TRANSISI
        ) {
            return;
        }

        stageTitle.textContent = "Gunung Meletus";
        instruction.textContent = "Gunung Semeru mengalami erupsi.";
        gestureStatus.textContent = "Perhatikan kondisi erupsi...";
        playVideo(videos.ERUPTION, {
            loop: false,
            state: STATES.BRIEFING,
            onEnded: () => setState(STATES.ZONE1)
        });
    }, POST_THUMBS_UP_DELAY);
}

function setZoneSubstate(substate) {
    zoneSubstate = substate;

    if (substate === SUBSTATES.MATERI) {
        gestureOutput.textContent = "Materi simulasi sedang berlangsung.";
        gestureStatus.textContent = "Perhatikan materi...";
        return;
    }

    if (substate === SUBSTATES.DETEKSI_GESTUR) {
        resetGestureHold();
        gestureOutput.textContent = "Belum ada gestur yang sesuai.";
        gestureStatus.textContent = "Menunggu gestur...";
        instruction.textContent = getZoneGestureInstruction(currentState);
        return;
    }

    resetGestureHold();
    gestureOutput.textContent = "Gestur berhasil!";
    gestureStatus.textContent = "Berhasil! Mundur ke jarak berikutnya.";
}

function getZoneGestureInstruction(state) {
    switch (state) {
        case STATES.ZONE1:
            return "Lindungi kepala dengan mengangkat kedua tangan di atas kepala selama 2 detik.";
        case STATES.ZONE2:
            return "Rentangkan satu tangan secara horizontal ke kiri atau kanan selama 2 detik.";
        case STATES.ZONE3:
            return "Silangkan kedua tangan membentuk X di depan dada selama 2 detik.";
        case STATES.BRIEFING:
            return "Posisi awal 5 km: setelah video briefing, tahan gestur Thumbs Up selama 2 detik.";
        case STATES.SAFE:
            return "Tetap ikuti arahan petugas. Lambaikan satu tangan untuk mengakhiri simulasi.";
        default:
            return "";
    }
}

function startZoneMaterial(state) {
    const details = videoDetails[state];
    stageTitle.textContent = details.title;
    instruction.textContent = details.message;
    setZoneSubstate(SUBSTATES.MATERI);
    playVideo(videos[state], {
        loop: false,
        state,
        onEnded: () => setZoneSubstate(SUBSTATES.DETEKSI_GESTUR)
    });
}

function enterDistanceTransition(state, videoState, targetDistance) {
    currentState = state;
    zoneSubstate = SUBSTATES.TRANSISI_JARAK;
    resetGestureHold();
    zoneLabel.textContent = state;
    const radius = targetDistance > 20 ? ">20" : String(targetDistance);
    const key = targetDistance > 20
        ? "4"
        : targetDistance === 13
            ? "2"
            : "3";
    stageTitle.textContent = state === STATES.MOVE_SAFE
        ? "MENUJU TITIK AMAN"
        : `EVAKUASI MENUJU ZONA ${targetDistance === 13 ? "2" : "3"}`;
    instruction.textContent =
        `Berhasil! Mundur menuju radius ${radius} km. Tekan tombol ${key} untuk simulasi jarak.`;
    gestureOutput.textContent = "Gestur berhasil!";
    gestureStatus.textContent = `Menunggu jarak ${radius} km...`;
    const requestState = state;
    playVideo(videos[videoState], {
        loop: true,
        state: requestState
    });
}

function setState(newState) {
    clearTimeout(transitionTimer);
    transitionTimer = null;
    clearInterval(cooldownTimer);
    cooldownTimer = null;
    invalidateVideo();
    resetWaveDetection();
    currentState = newState;
    zoneSubstate = null;
    resetGestureHold();
    zoneLabel.textContent = newState;

    switch (newState) {
        case STATES.HOME:
            stageTitle.textContent = "Gunung Semeru";
            instruction.textContent =
                "Aktifkan kamera, lalu tunjukkan gestur Peace selama 2 detik untuk memulai.";
            gestureOutput.textContent = "Belum ada gestur terdeteksi.";
            gestureStatus.textContent = "Menunggu pengguna...";
            playVideo(videos.HOME, { loop: true, state: STATES.HOME });
            break;

        case STATES.BRIEFING:
            stageTitle.textContent = videoDetails.BRIEFING.title;
            instruction.textContent =
                videoDetails.BRIEFING.message;
            gestureOutput.textContent = "Menunggu posisi awal...";
            setZoneSubstate(SUBSTATES.MATERI);
            playVideo(videos.BRIEFING, {
                loop: false,
                state: STATES.BRIEFING,
                onEnded: () => setZoneSubstate(SUBSTATES.DETEKSI_GESTUR)
            });
            break;

        case STATES.ZONE1:
        case STATES.ZONE2:
        case STATES.ZONE3:
        case STATES.SAFE:
            startZoneMaterial(newState);
            break;

        case STATES.MOVE2:
            enterDistanceTransition(STATES.MOVE2, STATES.ZONE1, 13);
            break;

        case STATES.MOVE3:
            enterDistanceTransition(STATES.MOVE3, STATES.ZONE2, 17);
            break;

        case STATES.MOVE_SAFE:
            enterDistanceTransition(STATES.MOVE_SAFE, STATES.ZONE3, 21);
            break;

        case STATES.COOLDOWN:
            stageTitle.textContent = "SIMULASI SELESAI";
            instruction.textContent =
                "Terima kasih telah berpartisipasi. Simulasi akan kembali ke awal.";
            gestureOutput.textContent = "Simulasi selesai.";
            gestureStatus.textContent =
                `Reset otomatis dalam ${COOLDOWN_DURATION} detik`;
            playVideo(videos.SAFE, { loop: true, state: STATES.COOLDOWN });
            startCooldown();
            break;
    }
}

function startSimulation() {
    virtualDistanceCm = BRIEFING_DISTANCE_CM;
    setDistanceStatus(virtualDistanceCm);
    setState(STATES.BRIEFING);
}

function updateDistanceFromKeyboard(distanceCm) {
    virtualDistanceCm = distanceCm;
    setDistanceStatus(distanceCm);

    if (currentState === STATES.BRIEFING) {
        updateBriefingPosition();
        return;
    }

    if (zoneSubstate !== SUBSTATES.TRANSISI_JARAK) {
        return;
    }

    if (currentState === STATES.MOVE2) {
        if (distanceCm === 13) {
            setState(STATES.ZONE2);
        } else {
            gestureStatus.textContent = "Untuk masuk Zona 2, atur jarak ke 13 km (tombol 2).";
        }
        return;
    }

    if (currentState === STATES.MOVE3) {
        if (distanceCm === 17) {
            setState(STATES.ZONE3);
        } else {
            gestureStatus.textContent = "Untuk masuk Zona 3, atur jarak ke 17 km (tombol 3).";
        }
        return;
    }

    if (currentState === STATES.MOVE_SAFE) {
        if (distanceCm > 20) {
            setState(STATES.SAFE);
        } else {
            gestureStatus.textContent = "Untuk masuk Zona Aman, atur jarak lebih dari 20 km (tombol 4).";
        }
    }
}

function startCooldown() {
    let remaining = COOLDOWN_DURATION;
    cooldownTimer = setInterval(() => {
        remaining--;
        gestureStatus.textContent = `Reset otomatis dalam ${remaining} detik`;
        if (remaining <= 0) {
            resetSimulation();
        }
    }, 1000);
}

function resetSimulation(reason = "Simulasi kembali ke awal.") {
    clearInterval(cooldownTimer);
    cooldownTimer = null;
    noPersonSince = null;
    virtualDistanceCm = BRIEFING_DISTANCE_CM;
    distanceStatus.textContent = "Belum diatur";
    gestureOutput.textContent = "Belum ada gestur terdeteksi.";
    personStatus.textContent = "Menunggu pengguna...";
    resetGestureHold();
    setState(STATES.HOME);
    systemStatus.textContent = cameraActive ? "SISTEM AKTIF" : "SISTEM STANDBY";
    console.log(reason);
}

function handleDistanceKey(event) {
    if (
        event.target instanceof HTMLElement &&
        (event.target.isContentEditable ||
            ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName))
    ) {
        return;
    }

    const distances = {
        "1": 5,
        "2": 13,
        "3": 17,
        "4": 21
    };
    const distance = distances[event.key];
    if (distance === undefined) {
        return;
    }
    event.preventDefault();
    updateDistanceFromKeyboard(distance);
}

startCameraButton.addEventListener("click", startCamera);
stopCameraButton.addEventListener("click", stopCamera);
playButton?.addEventListener("click", () => {
    if (!cameraActive) {
        gestureStatus.textContent = "Aktifkan kamera sebelum memulai simulasi.";
        return;
    }
    if (currentState === STATES.HOME) {
        startSimulation();
    }
});
document.addEventListener("keydown", handleDistanceKey);
window.addEventListener("beforeunload", () => {
    stopCamera();
    invalidateVideo();
    clearTimeout(transitionTimer);
    clearInterval(cooldownTimer);
    poseLandmarker?.close();
    handLandmarker?.close();
});

setState(STATES.HOME);
console.log("Simulasi Mitigasi Gunung Semeru siap dijalankan.");
