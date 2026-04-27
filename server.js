/**
 * server.js - Vanilla Node.js Server
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws'); 

// --- DATABASE CONNECTION ---
// Requiring db.js here triggers the connection test and success message
const pool = require('./db'); 

// --- LOGIC IMPORTS ---
const { handleSocketConnection } = require('./socketHandler');
const PlayerModel = require('./models/playerModel');

const PORT = 3000;

const server = http.createServer(async (req, res) => {
    // 1. Handle API Requests
    if (req.url === '/api/leaderboard' && req.method === 'GET') {
        try {
            const players = await PlayerModel.getTopPlayers();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(players));
        } catch (err) {
            console.error("Leaderboard API Error:", err);
            res.writeHead(500);
            return res.end(JSON.stringify({ error: "DB connection failed" }));
        }
    }

    // 2. Optimized Static File Server
    let requestPath = req.url === '/' ? '/index.html' : req.url;
    
    // Path logic: server.js is in /backend, so we go up one then into /frontend
    const filePath = path.join(__dirname, '..', 'frontend', requestPath);

    const extname = path.extname(filePath);
    const contentType = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.svg': 'image/svg+xml',
    }[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404);
                res.end("File not found");
            } else {
                res.writeHead(500);
                res.end(`Server Error: ${error.code}`);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

// 3. Initialize WebSocket Server
const wss = new WebSocketServer({ server });
wss.on('connection', (ws) => {
    // You might want to pass the 'pool' to the socket handler 
    // later if it needs direct DB access
    handleSocketConnection(ws);
});

server.listen(PORT, () => {
    console.log(`
    -------------------------------------------
    ANGER MANAGEMENT: SERVER ACTIVE
    URL: http://localhost:${PORT}
    DB Status: Initializing connection...
    -------------------------------------------
    `);
});