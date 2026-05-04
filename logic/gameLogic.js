/**
 * gameLogic.js - The Secure Game Engine
 * Ports the "Psychorithm" and RPS rules from Java.
 */

const RPS_RULES = {
    rock: { beats: 'scissors' },
    paper: { beats: 'rock' },
    scissors: { beats: 'paper' }
};

/**
 * Determines the winner of a Rock-Paper-Scissors round.
 * Improved robustness for multiplayer by normalizing moves.
 */
function getRoundResult(p1Move, p2Move) {
    if (!p1Move || !p2Move) return 'draw';

    // Normalize to lowercase to prevent "Paper" vs "paper" mismatch glitches
    const m1 = p1Move.toLowerCase();
    const m2 = p2Move.toLowerCase();

    if (m1 === m2) return 'draw';

    // Verify move exists in rules to prevent crashes
    if (!RPS_RULES[m1]) return 'draw';

    return RPS_RULES[m1].beats === m2 ? 'p1' : 'p2';
}

/**
 * The "Psychorithm" - Refined Algorithm
 * Calculates points based on the emotional state of the winner.
 */
function calculateStateChange(action, stats) {
    // 1. Ensure stats are valid numbers and clamped
    const anger = Math.max(0, Math.min(100, stats.anger ?? 50));
    const satisfaction = Math.max(0, Math.min(100, stats.satisfaction ?? 25));
    const confidence = Math.max(0, Math.min(100, stats.confidence ?? 0));

    // 2. Modifiers: These represent how emotions scale the physical action
    // Anger is the primary driver of points (venting)
    const angerMod = Math.floor(anger / 10); // 0-10 scale
    const satisfactionMod = Math.floor(satisfaction / 20); // 0-5 scale
    const confidenceMod = Math.floor(confidence / 25); // 0-4 scale

    let basePoints = 0;
    let finalPoints = 0;

    switch (action) {
        case 'slap':
            basePoints = 5;
            // Slaps are consistent and low effort
            finalPoints = basePoints + angerMod;
            break;
        case 'punch':
            basePoints = 10;
            // Punching is harder; high satisfaction reduces the "release" value
            finalPoints = basePoints + angerMod - satisfactionMod;
            break;
        case 'kick':
            basePoints = 15;
            // Kicking is high risk; high confidence/satisfaction reduces the point gain
            finalPoints = basePoints + angerMod - satisfactionMod - confidenceMod;
            break;
        default:
            finalPoints = 0;
    }

    // Return at least 1 point to ensure the scoreboard ALWAYS updates on a win
    return Math.max(1, Math.round(finalPoints));
}

/**
 * Determines stat changes after an action.
 * Winner vents (Anger down), Loser gets frustrated (Anger up).
 */
function getStatDeltas(role, action) {
    // Base deltas adjusted for the specific action type
    const intensity = { slap: 1, punch: 2, kick: 3 }[action] || 1;

    if (role === 'winner') {
        return {
            anger: -(5 * intensity),        // More intense actions vent more anger
            satisfaction: 5 * intensity,    // More intense actions give more satisfaction
            confidence: 3 * intensity       // Success builds confidence
        };
    } else {
        return {
            anger: 4 * intensity,           // Getting hit increases anger
            satisfaction: -(2 * intensity), // Decreases satisfaction
            confidence: -(1 * intensity)    // Decreases confidence
        };
    }
}

module.exports = { 
    getRoundResult, 
    calculateStateChange, 
    getStatDeltas 
};