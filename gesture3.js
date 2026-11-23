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

    // Terima satu atau kedua lengan sepanjang lengan sejajar kamera,
    // baik menunjuk ke kiri maupun ke kanan.
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

export function detectBothArmsSpread(pose) {
    if (!pose || pose.length < 17) {
        return false;
    }

    const leftShoulder = pose[11];
    const rightShoulder = pose[12];
    const leftElbow = pose[13];
    const rightElbow = pose[14];
    const leftWrist = pose[15];
    const rightWrist = pose[16];

    if (
        ![
            leftShoulder,
            rightShoulder,
            leftElbow,
            rightElbow,
            leftWrist,
            rightWrist
        ].every(point => isVisible(point))
    ) {
        return false;
    }

    const armsSpreadOut =
        leftWrist.x < leftShoulder.x - 0.12 &&
        rightWrist.x > rightShoulder.x + 0.12;

    const armsHorizontal =
        Math.abs(leftWrist.y - leftShoulder.y) < 0.22 &&
        Math.abs(rightWrist.y - rightShoulder.y) < 0.22;

    const elbowsExtended =
        Math.abs(leftElbow.x - leftShoulder.x) > 0.08 &&
        Math.abs(rightElbow.x - rightShoulder.x) > 0.08;

    return armsSpreadOut && armsHorizontal && elbowsExtended;
}

export function detectOneHandRaised(pose) {
    if (!pose || pose.length < 17) {
        return false;
    }

    const arms = [
        [pose[11], pose[15]],
        [pose[12], pose[16]]
    ];

    return arms.some(([shoulder, wrist]) => {
        if (![shoulder, wrist].every(point => isVisible(point))) {
            return false;
        }

        return wrist.y < shoulder.y + 0.05;
    });
}

// Telapak tangan terbuka (5 jari), tanpa gerakan
export function detectOpenPalm(hands) {
    if (!hands?.length) {
        return false;
    }

    return hands.some(hand => {
        if (!isHandLandmarks(hand)) {
            return false;
        }

        // Empat jari: ujung harus lebih tinggi dari sendi tengah (PIP)
        const fingersUp =
            hand[8].y < hand[6].y &&
            hand[12].y < hand[10].y &&
            hand[16].y < hand[14].y &&
            hand[20].y < hand[18].y;

        // Jempol: ujung harus menjauh dari pangkal telunjuk (MCP)
        const palmSize = Math.hypot(
            hand[9].x - hand[0].x,
            hand[9].y - hand[0].y
        );
        const thumbSpread =
            Math.hypot(hand[4].x - hand[5].x, hand[4].y - hand[5].y) >
            palmSize * 0.5;

        return fingersUp && thumbSpread;
    });
}