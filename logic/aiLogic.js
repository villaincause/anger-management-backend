/**
 * aiLogic.js - The Secure CPU Brain
 * Determines computer moves based on its internal "State of Mind."
 */

/**
 * Decides the CPU's next RPS move based on emotional "bias."
 * @param {Object} cpuStats - { anger, satisfaction, confidence }
 * @returns {string} - 'rock', 'paper', or 'scissors'
 */
function getCPUMove(cpuStats) {
    const moves = ['rock', 'paper', 'scissors'];
    const anger = cpuStats.anger || 50;
    const satisfaction = cpuStats.satisfaction || 25;

    // 1. Aggressive Strategy: If Anger is high, favor Rock (Physical/Hard).
    if (anger > 70) {
        const rand = Math.random();
        if (rand < 0.6) return 'rock';
        if (rand < 0.8) return 'paper';
        return 'scissors';
    }

    // 2. Defensive/Smug Strategy: If Satisfaction is high, favor Paper (Covering up).
    if (satisfaction > 60) {
        const rand = Math.random();
        if (rand < 0.5) return 'paper';
        if (rand < 0.75) return 'scissors';
        return 'rock';
    }

    // 3. Low Confidence Strategy: If Confidence is low, favor Scissors (Sharp/Reactive).
    if (cpuStats.confidence < 20) {
        const rand = Math.random();
        if (rand < 0.5) return 'scissors';
    }

    // 4. Default: Truly Random Balanced play
    return moves[Math.floor(Math.random() * 3)];
}

/**
 * Decides which "Anger Management" action the CPU takes if it wins the round.
 * Refined to ensure an action is ALWAYS chosen.
 * @param {Object} cpuStats 
 * @returns {string} - 'slap', 'punch', or 'kick'
 */
function getCPUAction(cpuStats) {
    const anger = cpuStats.anger || 50;
    const confidence = cpuStats.confidence || 0;

    // A. The Desperate Kick: High Anger + Low Confidence.
    // The CPU is flailing and wants maximum point impact.
    if (anger > 65 && confidence < 30) {
        return 'kick';
    }
    
    // B. The Calculated Punch: High Anger or moderate confidence.
    // Standard venting move.
    if (anger > 45 || confidence > 50) {
        return 'punch';
    }

    // C. The Disrespectful Slap: Calm or high satisfaction.
    // Default fallback to ensure the AI ALWAYS acts.
    return 'slap';
}

module.exports = { getCPUMove, getCPUAction };