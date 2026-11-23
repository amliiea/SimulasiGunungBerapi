/**
 * SENSOR.JS: WebSocket Client for Arduino HC-SR04 Ultrasonic Sensor
 * Connects to bridge.js at ws://127.0.0.1:8080
 */

const WS_URL = "ws://127.0.0.1:8080";

export const ZONES = [
    { id: 1, min: 35.0, max: 65.0 },       // Zona 1 (Erupsi): 35 - 65 cm
    { id: 2, min: 65.0, max: 95.0 },       // Zona 2 (Awan Panas): 65 - 95 cm
    { id: 3, min: 95.0, max: 122.5 },      // Zona 3 (Lahar Dingin): 95 - 122.5 cm
    { id: 4, min: 122.5, max: Infinity }   // Zona 4 (Aman): >= 122.5 cm
];

export function getZoneFromDistance(cm) {
    if (cm === null || !Number.isFinite(cm)) return 0;
    for (const z of ZONES) {
        if (cm >= z.min && cm < z.max) return z.id;
    }
    return 0;
}

let socket = null;
let isConnected = false;
let arduinoConnected = false;
let currentDistance = null;
let lastValidDistance = null;
let lastValidTime = 0;
const DROPOUT_GRACE_MS = 750; // Tahan pembacaan terakhir selama 750ms saat ada pantulan ultrasonik yang terlewat
let updateCallback = null;

export function isSensorConnected() {
    return isConnected && arduinoConnected;
}

export function getSensorStatus() {
    if (!isConnected) return "bridge-off";
    if (!arduinoConnected) return "arduino-off";
    return "online";
}

export function connectSensor(onUpdate) {
    updateCallback = onUpdate;
    initWebSocket();
}

function initWebSocket() {
    try {
        socket = new WebSocket(WS_URL);

        socket.onopen = () => {
            isConnected = true;
            console.log("WebSocket terhubung ke bridge sensor HC-SR04 (ws://127.0.0.1:8080)");
        };

        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                arduinoConnected = Boolean(data.arduino);
                
                const now = Date.now();
                if (typeof data.distance === "number" && Number.isFinite(data.distance)) {
                    currentDistance = data.distance;
                    lastValidDistance = data.distance;
                    lastValidTime = now;
                } else {
                    // Jika Arduino kirim null (miss pantulan saat bergerak), beri grace period 750ms
                    if (lastValidDistance !== null && (now - lastValidTime < DROPOUT_GRACE_MS)) {
                        currentDistance = lastValidDistance;
                    } else {
                        currentDistance = null;
                    }
                }

                if (updateCallback) {
                    updateCallback(currentDistance, arduinoConnected);
                }
            } catch (err) {
                console.error("Error parsing data sensor:", err);
            }
        };

        socket.onclose = () => {
            isConnected = false;
            arduinoConnected = false;
            currentDistance = null;
            lastValidDistance = null;
            if (updateCallback) updateCallback(null, false);
            // Reconnect otomatis setiap 2.5 detik jika bridge sempat tertutup
            setTimeout(initWebSocket, 2500);
        };

        socket.onerror = () => {
            // Diserahkan ke onclose untuk auto-retry
        };
    } catch {
        isConnected = false;
        arduinoConnected = false;
        setTimeout(initWebSocket, 2500);
    }
}

