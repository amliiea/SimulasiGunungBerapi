function isVisible(point, threshold = 0.35) {
    return Boolean(point && (point.visibility ?? 1) >= threshold);
}

function isHandLandmarks(hand) {
    return Array.isArray(hand) && hand.length >= 21;
}

const POSE_VISIBILITY_THRESHOLD = 0.5;
const RAISED_HAND_TOLERANCE = 0.08;

export function detectPeaceGesture(hands) {
    if (!hands?.length) {
        return false;
    }

    return hands.some(hand => {
        if (!isHandLandmarks(hand)) {
            return false;
        }

        return (
            hand[8].y < hand[6].y &&
            hand[12].y < hand[10].y &&
            hand[16].y > hand[14].y &&
            hand[20].y > hand[18].y
        );
    });
}

export function detectThumbsUp(hands) {
    if (!hands?.length) {
        return false;
    }

    return hands.some(hand => {
        if (!isHandLandmarks(hand)) {
            return false;
        }

        const thumbUp =
            hand[4].y < hand[3].y &&
            hand[3].y < hand[2].y;
        const fingersClosed =
            hand[8].y > hand[6].y &&
            hand[12].y > hand[10].y &&
            hand[16].y > hand[14].y &&
            hand[20].y > hand[18].y;

        return thumbUp && fingersClosed;
    });
}

export function detectBothHandsRaised(pose) {
    if (!pose || pose.length < 17) {
        return false;
    }

    const nose = pose[0];
    const leftWrist = pose[15];
    const rightWrist = pose[16];

    if (
        !isVisible(nose, POSE_VISIBILITY_THRESHOLD) ||
        !isVisible(leftWrist, POSE_VISIBILITY_THRESHOLD) ||
        !isVisible(rightWrist, POSE_VISIBILITY_THRESHOLD)
    ) {
        return false;
    }

    const highestAllowedY = nose.y + RAISED_HAND_TOLERANCE;
    return leftWrist.y < highestAllowedY && rightWrist.y < highestAllowedY;
}

export function detectPointHorizontal(pose) {
    if (!pose || pose.length < 17) {
        return false;
    }

    const arms = [
        [pose[11], pose[13], pose[15]],
        [pose[12], pose[14], pose[16]]
    ];

    return arms.some(([shoulder, elbow, wrist]) => {
        if (![shoulder, elbow, wrist].every(point => isVisible(point))) {
            return false;
        }

        const horizontalReach = Math.abs(wrist.x - shoulder.x);
        const verticalDeviation = Math.abs(wrist.y - shoulder.y);
        const armExtension = Math.hypot(wrist.x - elbow.x, wrist.y - elbow.y);

        return (
            horizontalReach > 0.22 &&
            verticalDeviation < 0.18 &&
            armExtension > 0.12
        );
    });
}

export function detectCrossedArms(pose) {
    if (!pose || pose.length < 17) {
        return false;
    }

    const leftShoulder = pose[11];
    const rightShoulder = pose[12];
    const leftWrist = pose[15];
    const rightWrist = pose[16];

    if (
        ![leftShoulder, rightShoulder, leftWrist, rightWrist]
            .every(point => isVisible(point))
    ) {
        return false;
    }

    const wristsCrossed =
        (leftWrist.x - rightWrist.x) *
        (leftShoulder.x - rightShoulder.x) < 0;
    const chestTop = Math.min(leftShoulder.y, rightShoulder.y);
    const chestBottom = Math.max(leftShoulder.y, rightShoulder.y) + 0.4;
    const handsAtChest =
        leftWrist.y > chestTop &&
        rightWrist.y > chestTop &&
        leftWrist.y < chestBottom &&
        rightWrist.y < chestBottom;

    return wristsCrossed && handsAtChest;
}

let waveHistory = [];

export function detectWave(hands) {
    if (!hands?.length || !isHandLandmarks(hands[0])) {
        waveHistory = [];
        return false;
    }

    const wrist = hands[0][0];
    waveHistory.push({ x: wrist.x, y: wrist.y });
    if (waveHistory.length > 30) {
        waveHistory.shift();
    }
    if (waveHistory.length < 12) {
        return false;
    }

    const xValues = waveHistory.map(point => point.x);
    const yValues = waveHistory.map(point => point.y);
    const horizontalRange = Math.max(...xValues) - Math.min(...xValues);
    const verticalRange = Math.max(...yValues) - Math.min(...yValues);

    if (horizontalRange < 0.12 || verticalRange > horizontalRange * 0.9) {
        return false;
    }

    let directionChanges = 0;
    let previousDirection = 0;
    let anchorX = waveHistory[0].x;

    for (let index = 2; index < waveHistory.length; index++) {
        const delta = waveHistory[index].x - anchorX;
        if (Math.abs(delta) < 0.025) {
            continue;
        }

        const direction = Math.sign(delta);
        if (previousDirection !== 0 && direction !== previousDirection) {
            directionChanges++;
        }
        previousDirection = direction;
        anchorX = waveHistory[index].x;
    }

    return directionChanges >= 3;
}

export function resetWaveDetection() {
    waveHistory = [];
}
