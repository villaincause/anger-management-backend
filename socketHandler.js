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
                case 'SUBMIT_MOVE':
                    handlePlayerMove(ws, payload);
                    break;
                case 'SUBMIT_ACTION':
                    handlePlayerAction(ws, payload);
                    break;
                case 'GIVE_UP':
                    handleGameOver(ws, 'forfeit', activeGames.get(payload.gameId));
                    break;
            }
        } catch (err) {
            console.error('Error processing message:', err);
        }
    });

    ws.on('close', () => {
        const idx = waitingPlayers.findIndex(p => p.ws === ws);
        if (idx !== -1) waitingPlayers.splice(idx, 1);
        
        for (const [code, host] of friendRooms.entries()) {
            if (host.ws === ws) {
                friendRooms.delete(code);
                break;
            }
        }
        console.log('Client disconnected');
    });
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
        ws.send(JSON.stringify({ type: 'AUTH_ERROR', payload: { message: result.error } }));
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
        ws.send(JSON.stringify({ type: 'GAME_STARTED', payload: gameState }));
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
                ws.send(JSON.stringify({ type: 'AUTH_ERROR', payload: { message: "Room not found or invalid code!" } }));
            }
        }
    }
    else if (mode === 'online') {
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

    const startMsg = JSON.stringify({ type: 'GAME_STARTED', payload: gameState });
    if(p1Data.ws) p1Data.ws.send(startMsg);
    if(p2Data.ws) p2Data.ws.send(startMsg);
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
            payload: { p1Move, p2Move, result, p1Score: game.p1.score, p2Score: game.p2.score } 
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
            }, 1200);
        }
    } else {
        const player = (game.p1.userId === userId) ? game.p1 : game.p2;
        if (player) player.move = move;

        if (game.p1.move && game.p2.move) {
            const result = getRoundResult(game.p1.move, game.p2.move);
            const roundData = { type: 'ROUND_RESULT', payload: { p1Move: game.p1.move, p2Move: game.p2.move, result } };
            
            if(game.p1.ws) game.p1.ws.send(JSON.stringify(roundData));
            if(game.p2.ws) game.p2.ws.send(JSON.stringify(roundData));

            if (result === 'draw') {
                game.p1.move = game.p2.move = null;
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

    if (game.mode !== 'local') {
        try {
            await pool.query(
                `INSERT INTO match_actions (match_id, actor_id, target_id, action_type, points_earned, anger_val, confidence_val, satisfaction_val) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [game.id, game[winnerKey].userId, game[loserKey].userId, action, 0, game[winnerKey].stats.anger, game[winnerKey].stats.confidence, game[winnerKey].stats.satisfaction]
            );
        } catch (dbErr) {
            console.error("Match Action DB Error:", dbErr);
        }
    }

    const updatePayload = { 
        type: 'UPDATE_UI', 
        payload: { 
            p1Score: game.p1.score, p1Stats: game.p1.stats,
            p2Score: game.p2.score, p2Stats: game.p2.stats,
            actorRole: winnerKey,
            onlineAction: action  
        } 
    };

    if (game.mode === 'local') {
        ws.send(JSON.stringify(updatePayload));
    } else {
        if(game.p1.ws) game.p1.ws.send(JSON.stringify(updatePayload));
        if(game.p2.ws) game.p2.ws.send(JSON.stringify(updatePayload));
    }

    game.p1.move = game.p2.move = null;

    if (game[winnerKey].score >= 100) {
        handleGameOver(ws, winnerKey === 'p1' ? 'p1_win' : 'p2_win', game);
    }
}

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

async function handleGameOver(ws, reason, game) {
    if (game) {
        if (game.mode !== 'local') {
            const winnerId = reason === 'p1_win' ? game.p1.userId : (reason === 'p2_win' ? game.p2.userId : null);
            try {
                await pool.query('UPDATE matches SET winner_id = ?, p1_score = ?, p2_score = ? WHERE match_id = ?', 
                    [winnerId, game.p1.score, game.p2.score, game.id]);
            } catch (err) {
                console.error("Match End DB Error:", err);
            }
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