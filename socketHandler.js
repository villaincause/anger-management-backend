/**
 * socketHandler.js - The Communication Bridge
 */

const { getRoundResult, calculateStateChange, getStatDeltas } = require('./logic/gameLogic');
const { getCPUMove, getCPUAction } = require('./logic/aiLogic');
const PlayerModel = require('./models/playerModel'); // Import our new DB model

const activeGames = new Map();

const clamp = (val) => Math.max(0, Math.min(100, Math.round(val || 0)));

function handleSocketConnection(ws) {
    console.log('New client connected');

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            const { type, payload } = data;

            switch (type) {
                // --- AUTHENTICATION HANDLERS ---
                case 'REGISTER':
                    const regResult = await PlayerModel.register({
                        username: payload.username,
                        password: payload.pass,
                        gender: payload.gender,
                        dob: payload.dob
                    });
                    if (regResult.success) {
                        // After registration, log them in automatically
                        const user = await PlayerModel.login(payload.username, payload.pass);
                        ws.send(JSON.stringify({ type: 'AUTH_SUCCESS', payload: { user: user.user } }));
                    } else {
                        ws.send(JSON.stringify({ type: 'AUTH_ERROR', payload: { message: regResult.error } }));
                    }
                    break;

                case 'LOGIN':
                    const loginResult = await PlayerModel.login(payload.username, payload.pass);
                    if (loginResult.success) {
                        ws.send(JSON.stringify({ type: 'AUTH_SUCCESS', payload: { user: loginResult.user } }));
                    } else {
                        ws.send(JSON.stringify({ type: 'AUTH_ERROR', payload: { message: loginResult.error } }));
                    }
                    break;

                // --- GAMEPLAY HANDLERS ---
                case 'START_GAME':
                    handleStartGame(ws, payload);
                    break;
                case 'SUBMIT_MOVE':
                    handlePlayerMove(ws, payload);
                    break;
                case 'SUBMIT_ACTION':
                    handlePlayerAction(ws, payload);
                    break;
                case 'GIVE_UP':
                    handleGameOver(ws, 'forfeit');
                    break;
            }
        } catch (err) {
            console.error('Error processing message:', err);
        }
    });

    ws.on('close', () => console.log('Client disconnected'));
}

/**
 * Initializes a game session
 */
function handleStartGame(ws, { mode, username }) {
    const gameId = `game_${Date.now()}`;
    const gameState = {
        id: gameId,
        mode,
        p1: { username, stats: { anger: 50, satisfaction: 25, confidence: 0 }, score: 0 },
        p2: { username: mode === 'local' ? 'CPU' : 'Waiting...', stats: { anger: 50, satisfaction: 25, confidence: 0 }, score: 0 },
        status: 'playing'
    };

    activeGames.set(gameId, gameState);
    ws.send(JSON.stringify({ type: 'GAME_STARTED', payload: gameState }));
}

/**
 * Processes RPS move and handles phase transitions
 */
function handlePlayerMove(ws, { gameId, move }) {
    const game = activeGames.get(gameId);
    if (!game) return;

    const p1Move = move;
    const p2Move = getCPUMove(game.p2.stats);
    const result = getRoundResult(p1Move, p2Move);

    ws.send(JSON.stringify({ 
        type: 'ROUND_RESULT', 
        payload: { p1Move, p2Move, result, p1Score: game.p1.score, p2Score: game.p2.score } 
    }));

    if (result === 'draw') {
        setTimeout(() => ws.send(JSON.stringify({ type: 'RESET_ROUND' })), 1500);
    } 
    else if (game.mode === 'local' && result === 'p2') {
        setTimeout(() => {
            const action = getCPUAction(game.p2.stats);
            processAction(game, 'p2', action);
            
            ws.send(JSON.stringify({ 
                type: 'UPDATE_UI', 
                payload: { 
                    p1Score: game.p1.score, p1Stats: game.p1.stats,
                    p2Score: game.p2.score, p2Stats: game.p2.stats,
                    cpuAction: action 
                } 
            }));
        }, 1200); 
    }
}

/**
 * Processes the Action Phase for Player 1
 */
function handlePlayerAction(ws, { gameId, action }) {
    const game = activeGames.get(gameId);
    if (!game || !action) return;

    processAction(game, 'p1', action);

    // Check Win Condition (e.g., reaching 100 points)
    if (game.p1.score >= 100) {
        return handleGameOver(ws, 'p1_win', game);
    }

    ws.send(JSON.stringify({ 
        type: 'UPDATE_UI', 
        payload: { 
            p1Score: game.p1.score, p1Stats: game.p1.stats,
            p2Score: game.p2.score, p2Stats: game.p2.stats
        } 
    }));
}

/**
 * Shared logic to update scores and "Psychorithm" states
 */
function processAction(game, winnerKey, action) {
    const loserKey = winnerKey === 'p1' ? 'p2' : 'p1';
    const winner = game[winnerKey];
    const loser = game[loserKey];

    const points = calculateStateChange(action, winner.stats) || 0;
    winner.score += points;

    const winDeltas = getStatDeltas('winner', action) || {};
    winner.stats.anger = clamp(winner.stats.anger + (winDeltas.anger || 0));
    winner.stats.satisfaction = clamp(winner.stats.satisfaction + (winDeltas.satisfaction || 0));
    winner.stats.confidence = clamp(winner.stats.confidence + (winDeltas.confidence || 0));

    const loseDeltas = getStatDeltas('loser', action) || {};
    loser.stats.anger = clamp(loser.stats.anger + (loseDeltas.anger || 0));
    loser.stats.satisfaction = clamp(loser.stats.satisfaction + (loseDeltas.satisfaction || 0));
    loser.stats.confidence = clamp(loser.stats.confidence + (loseDeltas.confidence || 0));
}

/**
 * Handles Game Over and DB updates
 */
async function handleGameOver(ws, reason, game = null) {
    // If the player was logged in, we should update their stats in TiDB
    if (game && game.mode === 'local') {
        // Logic to update wins/losses could go here using PlayerModel.saveGameResult
    }
    
    ws.send(JSON.stringify({ type: 'GAME_OVER', payload: { reason } }));
}

module.exports = { handleSocketConnection };