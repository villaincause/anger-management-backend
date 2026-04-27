/**
 * playerModel.js - Database Queries
 * Handles interaction between the game logic and the SQL databases.
 */
const pool = require('../db'); // Using our optimized pool
const bcrypt = require('bcrypt');

const PlayerModel = {
    /**
     * Account Registration
     * Hashes password and stores personal details
     */
    async register({ username, password, gender, dob }) {
        const hashedPassword = await bcrypt.hash(password, 10);
        const sql = `
            INSERT INTO players (username, password_hash, gender, dob) 
            VALUES (?, ?, ?, ?)
        `;

        try {
            const [result] = await pool.execute(sql, [username, hashedPassword, gender, dob]);
            return { success: true, userId: result.insertId };
        } catch (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                return { success: false, error: 'Username already taken' };
            }
            console.error(`[DB Error] Registration: ${err.message}`);
            throw err;
        }
    },

    /**
     * Account Login
     * Verifies user and returns basic profile
     */
    async login(username, password) {
        const sql = "SELECT * FROM players WHERE username = ? LIMIT 1";
        
        try {
            const [rows] = await pool.execute(sql, [username]);
            if (rows.length === 0) return { success: false, error: 'User not found' };

            const user = rows[0];
            const isMatch = await bcrypt.compare(password, user.password_hash);
            
            if (isMatch) {
                return { 
                    success: true, 
                    user: { 
                        id: user.player_id, 
                        username: user.username, 
                        wins: user.wins, 
                        losses: user.losses 
                    } 
                };
            }
            return { success: false, error: 'Incorrect password' };
        } catch (err) {
            console.error(`[DB Error] Login: ${err.message}`);
            throw err;
        }
    },

    /**
     * Updates stats after a game.
     */
    async saveGameResult(playerId, isWin) {
        const columnToUpdate = isWin ? 'wins' : 'losses';
        const sql = `
            UPDATE players 
            SET ${columnToUpdate} = ${columnToUpdate} + 1, xp = xp + 10 
            WHERE player_id = ?
        `;

        try {
            await pool.execute(sql, [playerId]);
            console.log(`[DB] Stats updated for player ID: ${playerId}`);
        } catch (err) {
            console.error(`[DB Error] Failed to save result: ${err.message}`);
            throw err;
        }
    },

    /**
     * Fetches the top 5 players for the Home Screen leaderboard
     */
    async getTopPlayers() {
        const sql = "SELECT username, wins, xp FROM players ORDER BY wins DESC LIMIT 5";
        
        try {
            const [rows] = await pool.execute(sql);
            return rows;
        } catch (err) {
            console.error(`[DB Error] Fetching leaderboard: ${err.message}`);
            return [];
        }
    }
};

module.exports = PlayerModel;