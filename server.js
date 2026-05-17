/**
 * server.js - Vanilla Node.js Server (Optimized for Local & Hosting Environments)
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

// Dynamic port assignment for production platforms, falling back to 3000 locally
const PORT = process.env.PORT || 3000;

const server = http.createServer(async (req, res) => {
    // 1. Handle API Requests
    if (req.url === '/api/leaderboard' && req.method === 'GET') {
        try {
            const players = await PlayerModel.getTopPlayers();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(players));
        } catch (err) {
            console.error("Leaderboard API Error:", err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: "DB connection failed" }));
        }
    }

    // 2. Optimized Static File Server with Path Security Check
    let requestPath = req.url === '/' ? '/index.html' : req.url;
    
    // Target directory containing structural files
    const publicDir = path.resolve(__dirname, '..', 'frontend');
    const filePath = path.join(publicDir, requestPath);

    // Security Verification: Prevent directory traversal vulnerability on public hosts
    if (!filePath.startsWith(publicDir)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        return res.end("Forbidden");
    }

    const extname = path.extname(filePath);
    const contentType = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
        '.json': 'application/json',
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
    }[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end("File not found");
            } else {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
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
    // Pass the pool configuration or query access internally within the execution tree if needed
    handleSocketConnection(ws);
});

server.listen(PORT, () => {
    console.log(`
    -------------------------------------------
    ANGER MANAGEMENT: SERVER ACTIVE
    PORT: ${PORT}
    URL: http://localhost:${PORT}
    DB Status: Initializing connection...
    -------------------------------------------
    `);
});