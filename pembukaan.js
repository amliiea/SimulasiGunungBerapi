const audio = document.getElementById("openingAudio");
const caption = document.getElementById("openingCaption");
const mascot = document.querySelector(".opening-mascot");
const mascotTrigger = document.getElementById("mascotTrigger");
const openingScreen = document.querySelector(".opening-screen");
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
    mascotTrigger.setAttribute("aria-pressed", "true");
    mascot.classList.add("has-started");

    audio.play().catch(error => {
        console.error("Audio pembukaan gagal diputar setelah maskot diklik.", error);
        narrationStarted = false;
        mascotTrigger.setAttribute("aria-pressed", "false");
        mascot.classList.remove("has-started");
    });
});
