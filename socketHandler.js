/**
 * socketHandler.js - The Multiplayer & CPU Engine
 */

const { getRoundResult, calculateStateChange, getStatDeltas } = require('./logic/gameLogic');
const { getCPUMove, getCPUAction } = require('./logic/aiLogic');
const PlayerModel = require('./models/playerModel');
const pool = require('./db');

const activeGames = new Map();
const waitingPlayers = []; 
const friendRooms = new Map(); 

const clamp = (val) => Math.max(0, Math.min(100, Math.round(val || 0)));

function handleSocketConnection(ws) {
    console.log('New client connected');

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            const { type, payload } = data;

            switch (type) {
                case 'REGISTER':
                    handleAuth(ws, payload, 'register');
                    break;
                case 'LOGIN':
                    handleAuth(ws, payload, 'login');
                    break;
                case 'START_GAME':
                    handleStartGame(ws, payload);
                    break;
                case 'LEAVE_QUEUE':
                    handleLeaveQueue(ws, payload);
                    break;
                case 'SUBMIT_MOVE':
                    handlePlayerMove(ws, payload);
                    break;
                case 'SUBMIT_ACTION':
                    handlePlayerAction(ws, payload);
                    break;
                case 'GIVE_UP':
                    handleGameOver(ws, 'forfeit', activeGames.get(payload.gameId));
                    break;
                case 'VERIFY_SESSION':
                    handleVerifySession(ws, payload);
                    break;
            }
        } catch (err) {
            console.error('Error processing message:', err);
        }
    });

    ws.on('close', () => {
        // Remove from matchmaking queue
        const idx = waitingPlayers.findIndex(p => p.ws === ws);
        if (idx !== -1) waitingPlayers.splice(idx, 1);
        
        // Cleanup Friend Rooms
        for (const [code, host] of friendRooms.entries()) {
            if (host.ws === ws) {
                friendRooms.delete(code);
                break;
            }
        }
        console.log('Client disconnected');
    });
}

/**
 * Handle user leaving the matchmaking queue
 */
function handleLeaveQueue(ws, { userId }) {
    const idx = waitingPlayers.findIndex(p => p.userId === userId || p.ws === ws);
    if (idx !== -1) {
        waitingPlayers.splice(idx, 1);
        console.log(`User ${userId} left the queue.`);
    }
}

/**
 * Re-validates a game session if the user refreshes
 */
function handleVerifySession(ws, { gameId }) {
    const game = activeGames.get(gameId);
    if (game) {
        // Update the socket reference for the reconnected player
        if (game.p1.ws === null || game.p1.ws.readyState !== 1) game.p1.ws = ws;
        else if (game.p2.mode !== 'local' && (game.p2.ws === null || game.p2.ws.readyState !== 1)) game.p2.ws = ws;

        ws.send(JSON.stringify({ 
            type: 'SESSION_VALID', 
            payload: { gameId, yourRole: (game.p1.ws === ws ? 'p1' : 'p2') } 
        }));
    } else {
        ws.send(JSON.stringify({ type: 'SESSION_INVALID' }));
    }
}

async function handleAuth(ws, payload, type) {
    let result;
    const authData = {
        username: payload.username,
        password: payload.pass || payload.password,
        gender: payload.gender,
        dob: payload.dob
    };

    if (type === 'register') {
        result = await PlayerModel.register(authData);
        if (result.success) {
            const login = await PlayerModel.login(authData.username, authData.password);
            ws.send(JSON.stringify({ type: 'AUTH_SUCCESS', payload: { user: login.user } }));
        }
    } else {
        result = await PlayerModel.login(authData.username, authData.password);
        if (result.success) {
            ws.send(JSON.stringify({ type: 'AUTH_SUCCESS', payload: { user: result.user } }));
        }
    }

    if (result && !result.success) {
        ws.send(JSON.stringify({ type: 'ERROR', payload: { message: result.error } }));
    }
}

async function handleStartGame(ws, { mode, username, userId, roomCode, action }) {
    if (mode === 'local') {
        const gameId = `cpu_${Date.now()}`;
        const gameState = {
            id: gameId,
            mode: 'local',
            p1: { userId: userId || 1, username, stats: { anger: 50, satisfaction: 25, confidence: 0 }, score: 0, move: null, ws },
            p2: { username: 'CPU', stats: { anger: 50, satisfaction: 25, confidence: 0 }, score: 0, move: null },
            status: 'playing'
        };
        activeGames.set(gameId, gameState);
        ws.send(JSON.stringify({ 
            type: 'GAME_STARTED', 
            payload: { ...gameState, yourRole: 'p1' } 
        }));
    } 
    else if (mode === 'friend') {
        if (action === 'create') {
            const code = Math.floor(1000 + Math.random() * 9000).toString();
            friendRooms.set(code, { ws, userId, username });
            ws.send(JSON.stringify({ 
                type: 'ROOM_CREATED', 
                payload: { roomCode: code } 
            }));
        } else if (action === 'join') {
            const host = friendRooms.get(roomCode);
            if (host && host.userId !== userId) {
                friendRooms.delete(roomCode);
                initOnlineGame(host, { ws, userId, username }, 'friend');
            } else {
                ws.send(JSON.stringify({ type: 'ERROR', payload: { message: "Room not found or invalid code!" } }));
            }
        }
    }
    else if (mode === 'online') {
        const alreadyWaiting = waitingPlayers.find(p => p.userId === userId);
        if (alreadyWaiting) {
            ws.send(JSON.stringify({ type: 'WAITING_FOR_OPPONENT' }));
            return;
        }

        if (waitingPlayers.length > 0 && waitingPlayers[0].userId !== userId) {
            const opponent = waitingPlayers.shift();
            initOnlineGame(opponent, { ws, userId, username }, 'online');
        } else {
            waitingPlayers.push({ ws, userId, username });
            ws.send(JSON.stringify({ type: 'WAITING_FOR_OPPONENT' }));
        }
    }
}

async function initOnlineGame(p1Data, p2Data, mode) {
    const gameId = `match_${Date.now()}`;
    const gameState = {
        id: gameId,
        mode,
        p1: { userId: p1Data.userId, username: p1Data.username, stats: { anger: 50, satisfaction: 25, confidence: 0 }, score: 0, move: null, ws: p1Data.ws },
        p2: { userId: p2Data.userId, username: p2Data.username, stats: { anger: 50, satisfaction: 25, confidence: 0 }, score: 0, move: null, ws: p2Data.ws },
        status: 'playing'
    };

    activeGames.set(gameId, gameState);

    try {
        await pool.query(
            'INSERT INTO matches (match_id, p1_id, p2_id, game_mode) VALUES (?, ?, ?, ?)',
            [gameId, p1Data.userId, p2Data.userId, mode]
        );
    } catch (err) {
        console.error("Match Start DB Error:", err);
    }

    const startP1 = JSON.stringify({ type: 'GAME_STARTED', payload: { ...gameState, yourRole: 'p1' } });
    const startP2 = JSON.stringify({ type: 'GAME_STARTED', payload: { ...gameState, yourRole: 'p2' } });

    if (p1Data.ws) p1Data.ws.send(startP1);
    if (p2Data.ws) p2Data.ws.send(startP2);
}

async function handlePlayerMove(ws, { gameId, move, userId }) {
    const game = activeGames.get(gameId);
    if (!game) return;

    if (game.mode === 'local') {
        const p1Move = move;
        const p2Move = getCPUMove(game.p2.stats);
        const result = getRoundResult(p1Move, p2Move);

        ws.send(JSON.stringify({ 
            type: 'ROUND_RESULT', 
            payload: { p1Move, p2Move, result, yourRole: 'p1', p1Score: game.p1.score, p2Score: game.p2.score } 
        }));

        if (result === 'draw') {
            setTimeout(() => ws.send(JSON.stringify({ type: 'RESET_ROUND' })), 1500);
        } else if (result === 'p2') {
            setTimeout(() => {
                const action = getCPUAction(game.p2.stats);
                processAction(game, 'p2', action);
                ws.send(JSON.stringify({ 
                    type: 'UPDATE_UI', 
                    payload: { p1Score: game.p1.score, p1Stats: game.p1.stats, p2Score: game.p2.score, p2Stats: game.p2.stats, cpuAction: action } 
                }));
                if (game.p2.score >= 100) handleGameOver(ws, 'p2_win', game);
            }, 1200);
        }
    } else {
        const player = (game.p1.userId === userId) ? game.p1 : game.p2;
        if (player) player.move = move;

        if (game.p1.move && game.p2.move) {
            const result = getRoundResult(game.p1.move, game.p2.move);
            const res1 = JSON.stringify({ type: 'ROUND_RESULT', payload: { p1Move: game.p1.move, p2Move: game.p2.move, result, yourRole: 'p1' } });
            const res2 = JSON.stringify({ type: 'ROUND_RESULT', payload: { p1Move: game.p1.move, p2Move: game.p2.move, result, yourRole: 'p2' } });
            
            if(game.p1.ws) game.p1.ws.send(res1);
            if(game.p2.ws) game.p2.ws.send(res2);

            if (result === 'draw') {
                game.p1.move = null; game.p2.move = null;
                setTimeout(() => {
                    const reset = JSON.stringify({ type: 'RESET_ROUND' });
                    if(game.p1.ws) game.p1.ws.send(reset); 
                    if(game.p2.ws) game.p2.ws.send(reset);
                }, 1500);
            }
        }
    }
}

async function handlePlayerAction(ws, { gameId, action, userId }) {
    const game = activeGames.get(gameId);
    if (!game || !action) return;

    const winnerKey = (game.mode === 'local') ? 'p1' : (game.p1.userId === userId ? 'p1' : 'p2');
    const loserKey = winnerKey === 'p1' ? 'p2' : 'p1';

    processAction(game, winnerKey, action);

    const updatePayload = JSON.stringify({ 
        type: 'UPDATE_UI', 
        payload: { p1Score: game.p1.score, p1Stats: game.p1.stats, p2Score: game.p2.score, p2Stats: game.p2.stats, actorRole: winnerKey, onlineAction: action } 
    });

    if (game.mode === 'local') ws.send(updatePayload);
    else {
        if(game.p1.ws) game.p1.ws.send(updatePayload);
        if(game.p2.ws) game.p2.ws.send(updatePayload);
    }

    game.p1.move = null; game.p2.move = null;
    if (game[winnerKey].score >= 100) handleGameOver(ws, winnerKey === 'p1' ? 'p1_win' : 'p2_win', game);
}

function processAction(game, winnerKey, action) {
    const loserKey = winnerKey === 'p1' ? 'p2' : 'p1';
    const winner = game[winnerKey];
    const loser = game[loserKey];

    const points = calculateStateChange(action, winner.stats) || 0;
    winner.score += points;

    const winDeltas = getStatDeltas('winner', action);
    winner.stats.anger = clamp(winner.stats.anger + winDeltas.anger);
    winner.stats.satisfaction = clamp(winner.stats.satisfaction + winDeltas.satisfaction);
    winner.stats.confidence = clamp(winner.stats.confidence + winDeltas.confidence);

    const loseDeltas = getStatDeltas('loser', action);
    loser.stats.anger = clamp(loser.stats.anger + loseDeltas.anger);
    loser.stats.satisfaction = clamp(loser.stats.satisfaction + loseDeltas.satisfaction);
    loser.stats.confidence = clamp(loser.stats.confidence + loseDeltas.confidence);
}

async function handleGameOver(ws, reason, game) {
    if (game) {
        if (game.mode !== 'local') {
            const winnerId = reason === 'p1_win' ? game.p1.userId : (reason === 'p2_win' ? game.p2.userId : null);
            try {
                await pool.query('UPDATE matches SET winner_id = ?, p1_score = ?, p2_score = ? WHERE match_id = ?', 
                    [winnerId, game.p1.score, game.p2.score, game.id]);
            } catch (err) { console.error("Match End DB Error:", err); }
        }
        
        const overMsg = JSON.stringify({ type: 'GAME_OVER', payload: { reason } });
        if (game.mode === 'local') ws.send(overMsg);
        else { 
            if(game.p1.ws) game.p1.ws.send(overMsg); 
            if(game.p2.ws) game.p2.ws.send(overMsg); 
        }
        activeGames.delete(game.id);
    }
}

module.exports = { handleSocketConnection };