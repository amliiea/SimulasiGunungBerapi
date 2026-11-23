// bridge.js: Arduino (USB Serial) → WebSocket
const { SerialPort, ReadlineParser } = require('serialport');
const { WebSocketServer } = require('ws');

const BAUD_RATE = 9600;
const WS_PORT = 8080;
const FIXED_PORT = process.env.SERIAL_PORT || null; // opsional: paksa port tertentu

const wss = new WebSocketServer({ port: WS_PORT, host: '127.0.0.1' });
wss.on('listening', () => console.log(`WebSocket siap di ws://127.0.0.1:${WS_PORT}`));
wss.on('error', err => {
    console.error('WebSocket gagal start:', err.message);
    console.error('Kemungkinan bridge lain masih jalan. Tutup dulu (Ctrl+C).');
    process.exit(1);
});

let lastMessage = { arduino: false, distance: null };

function broadcast(msg) {
    lastMessage = msg;
    const data = JSON.stringify(msg);
    wss.clients.forEach(client => {
        if (client.readyState === 1) client.send(data);
    });
}

// Klien baru langsung dapat status terakhir
wss.on('connection', ws => ws.send(JSON.stringify(lastMessage)));

async function findArduinoPort() {
    if (FIXED_PORT) return FIXED_PORT;
    const ports = await SerialPort.list();

    // 1. Prioritaskan perangkat USB fisik asli (bukan link Bluetooth)
    const usbMatch = ports.find(p => {
        const desc = ((p.friendlyName || '') + ' ' + (p.pnpId || '')).toLowerCase();
        const isBluetooth = desc.includes('bluetooth') || desc.includes('bthenum');
        const isUsb = Boolean(p.vendorId) || /usb/i.test(p.pnpId || '') || /usbmodem|usbserial|wchusbserial|ttyACM|ttyUSB/i.test(p.path);
        return isUsb && !isBluetooth;
    });
    if (usbMatch) return usbMatch.path;

    // 2. Fallback: Port COM apa pun asalkan bukan Bluetooth
    const fallbackMatch = ports.find(p => {
        const desc = ((p.friendlyName || '') + ' ' + (p.pnpId || '')).toLowerCase();
        const isBluetooth = desc.includes('bluetooth') || desc.includes('bthenum');
        return !isBluetooth && /COM\d+|usbmodem|usbserial|wchusbserial|ttyACM|ttyUSB/i.test(p.path);
    });
    return fallbackMatch ? fallbackMatch.path : null;
}

function handleLine(line) {
    const text = line.trim();
    if (!text) return;

    console.log(`Serial Arduino: ${text}`);
    const m = text.match(/Jarak:\s*([\d.]+)\s*cm/);
    if (m) {
        broadcast({ arduino: true, distance: parseFloat(m[1]) });
    } else if (text.includes('tidak terdeteksi')) {
        broadcast({ arduino: true, distance: null });
    }
}

let retryTimer = null;
let lastReason = '';

function retry(reason) {
    if (reason && reason !== lastReason) console.log(reason);
    lastReason = reason;
    if (retryTimer) return;
    retryTimer = setTimeout(() => {
        retryTimer = null;
        connectArduino();
    }, 2000);
}

function connectArduino() {
    findArduinoPort()
        .then(path => {
            if (!path) return retry('Arduino tidak ditemukan. Colok USB-nya...');

            const port = new SerialPort({ path, baudRate: BAUD_RATE }, err => {
                if (err) return retry(`Gagal membuka ${path}: ${err.message} (Serial Monitor masih terbuka?)`);

                console.log(`Arduino terhubung di ${path}`);
                lastReason = '';
                broadcast({ arduino: true, distance: null });

                const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));
                parser.on('data', handleLine);
            });

            port.on('error', err => console.error('Serial error:', err.message));
            port.on('close', () => {
                broadcast({ arduino: false, distance: null });
                retry('Koneksi Arduino terputus, mencoba lagi...');
            });
        })
        .catch(err => retry(`Error: ${err.message}`));
}

connectArduino();