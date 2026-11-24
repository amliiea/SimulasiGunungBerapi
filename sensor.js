// sensor.js: menerima jarak dari bridge lewat WebSocket
export const ZONES = [
    // Targets are centered on 50, 80, 110, and 135 cm; midpoint edges avoid gaps/overlap.
    { id: 1, min: 35, max: 65 },
    { id: 2, min: 65, max: 95 },
    { id: 3, min: 95, max: 122.5 },
    { id: 4, min: 122.5, max: Infinity }
];

const WS_URL = 'ws://127.0.0.1:8080';
const STALE_MS = 1500; // data dianggap basi kalau lebih lama dari ini

let latest = { distance: null, time: 0 };
let bridgeConnected = false;
let arduinoConnected = false;
let onUpdate = null;
let started = false;

export function isSensorConnected() {
    return bridgeConnected && arduinoConnected && Date.now() - latest.time < STALE_MS;
}

// 'ok' | 'arduino-off' | 'bridge-off', berguna untuk teks status di HUD
export function getSensorStatus() {
    if (!bridgeConnected) return 'bridge-off';
    if (!arduinoConnected) return 'arduino-off';
    return 'ok';
}

export function getDistance() {
    return isSensorConnected() ? latest.distance : null;
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

    ws.onopen = () => { bridgeConnected = true; };

    ws.onmessage = event => {
        let msg;
        try { msg = JSON.parse(event.data); } catch { return; }

        arduinoConnected = Boolean(msg.arduino);
        const distance = typeof msg.distance === 'number' ? msg.distance : null;
        latest = { distance, time: Date.now() };

        if (onUpdate) onUpdate(distance, getZoneFromDistance(distance));
    };

    ws.onclose = () => {
        bridgeConnected = false;
        arduinoConnected = false;
        setTimeout(openSocket, 2000); // otomatis coba sambung lagi
    };

    ws.onerror = () => ws.close();
}
