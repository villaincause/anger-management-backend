/**
 * gameLogic.js - The Secure Game Engine
 * Implements the Psychorithm and RPS rules.
 */

const RPS_RULES = {
    rock: { beats: 'scissors' },
    paper: { beats: 'rock' },
    scissors: { beats: 'paper' }
};

/**
 * Determines the winner of a Rock-Paper-Scissors round.
 */
function getRoundResult(p1Move, p2Move) {
    if (!p1Move || !p2Move) return 'draw';

    const m1 = p1Move.toLowerCase();
    const m2 = p2Move.toLowerCase();

    if (m1 === m2) return 'draw';
    if (!RPS_RULES[m1]) return 'draw';

    return RPS_RULES[m1].beats === m2 ? 'p1' : 'p2';
}

/**
 * The "Psychorithm" - Ported and Scaled for 100pt games
 * Calculates points based on the emotional state of the winner.
 */
function calculateStateChange(action, stats) {
    const angerScore = Math.max(0, Math.min(100, stats.anger ?? 50));
    const satisfactionScore = Math.max(0, Math.min(100, stats.satisfaction ?? 25));
    const confidenceScore = Math.max(0, Math.min(100, stats.confidence ?? 0));

    let basePoints = 0;
    let additionalScore = 0;
    const actionKey = action.toLowerCase();

    // Percentage-based modifiers from original algorithm
    if (actionKey === 'slap' || actionKey === 'punch') {
        additionalScore = Math.ceil(angerScore * 0.05) - 
                          Math.ceil(satisfactionScore * 0.025) - 
                          Math.ceil(confidenceScore * 0.01);
    } else if (actionKey === 'kick') {
        additionalScore = Math.ceil(angerScore * 0.035) - 
                          Math.ceil(satisfactionScore * 0.025) - 
                          Math.ceil(confidenceScore * 0.01);
    }

    // Scaled base points for 100-point win target
    switch (actionKey) {
        case 'slap':
            basePoints = 5 + additionalScore;
            break;
        case 'punch':
            basePoints = 10 + additionalScore;
            break;
        case 'kick':
            basePoints = 15 + additionalScore;
            break;
        default:
            basePoints = 1;
    }

    return Math.max(1, Math.round(basePoints));
}

/**
 * Determines emotional stat changes based on the Java logic.
 */
function getStatDeltas(role, action) {
    const actionKey = action.toLowerCase();

    if (role === 'winner') {
        switch (actionKey) {
            case 'slap':
                return { satisfaction: 15, anger: -10, confidence: 5 };
            case 'punch':
                return { confidence: 10, anger: -10, satisfaction: 5 };
            case 'kick':
                return { confidence: 5, anger: -15, satisfaction: 5 };
            default:
                return { anger: -5, satisfaction: 5, confidence: 5 };
        }
    } else {
        // Loser Deltas
        switch (actionKey) {
            case 'slap':
                return { confidence: -15, anger: 10, satisfaction: -5 };
            case 'punch':
                return { anger: 15, satisfaction: -10, confidence: -5 };
            case 'kick':
                return { anger: 25, satisfaction: -10, confidence: -10 };
            default:
                return { anger: 10, satisfaction: -5, confidence: -5 };
        }
    }
}

// Export for server use
if (typeof module !== 'undefined') {
    module.exports = { 
        getRoundResult, 
        calculateStateChange, 
        getStatDeltas 
    };
}