// sensor.js: menerima jarak dari bridge lewat WebSocket
export const ZONES = [
    // Targets are centered on 50, 80, 110, and 135 cm; midpoint edges avoid gaps/overlap.
    { id: 1, min: 35, max: 65 },
    { id: 2, min: 65, max: 95 },
    { id: 3, min: 95, max: 122.5 },
    { id: 4, min: 122.5, max: Infinity }
];

const WS_URL = 'ws://127.0.0.1:8080';

let latest = { distance: null, time: 0 };
let lastValidDistance = null;
let lastValidTime = 0;
const DROPOUT_GRACE_MS = 1500; // Tahan jarak terakhir jika ada pantulan ultrasonik yang terlewat

let bridgeConnected = false;
let arduinoConnected = false;
let onUpdate = null;
let started = false;

export function isSensorConnected() {
    return bridgeConnected && arduinoConnected;
}

// 'ok' | 'arduino-off' | 'bridge-off', berguna untuk teks status di HUD
export function getSensorStatus() {
    if (!bridgeConnected) return 'bridge-off';
    if (!arduinoConnected) return 'arduino-off';
    return 'ok';
}

export function getDistance() {
    return isSensorConnected() ? (latest.distance ?? lastValidDistance) : null;
}

export function getZoneFromDistance(cm) {
    if (!Number.isFinite(cm)) return 0;
    const zone = ZONES.find(z => cm >= z.min && cm < z.max);
    return zone ? zone.id : 9;
}

export function connectSensor(callback) {
    onUpdate = callback;
    if (started) return;
    started = true;
    openSocket();
}

function openSocket() {
    const ws = new WebSocket(WS_URL);

    ws.onopen = () => {
        bridgeConnected = true;
        console.log("WebSocket terhubung ke bridge sensor.");
    };

    ws.onmessage = event => {
        let msg;
        try { msg = JSON.parse(event.data); } catch { return; }

        arduinoConnected = Boolean(msg.arduino);
        const now = Date.now();

        let dist = null;
        if (typeof msg.distance === 'number' && Number.isFinite(msg.distance)) {
            dist = msg.distance;
            lastValidDistance = dist;
            lastValidTime = now;
        } else {
            // Jika pantulan ultrasonik miss sesaat saat tubuh bergerak, tahan nilai terakhir
            if (lastValidDistance !== null && (now - lastValidTime < DROPOUT_GRACE_MS)) {
                dist = lastValidDistance;
            } else {
                dist = null;
            }
        }

        latest = { distance: dist, time: now };

        if (onUpdate) {
            onUpdate(dist, getZoneFromDistance(dist));
        }
    };

    ws.onclose = () => {
        bridgeConnected = false;
        arduinoConnected = false;
        if (onUpdate) onUpdate(null, 0);
        setTimeout(openSocket, 2000); // otomatis coba sambung lagi
    };

    ws.onerror = () => ws.close();
}
