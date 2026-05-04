/**
 * playerModel.js - Database Queries
 */
const pool = require('../db'); 
const bcrypt = require('bcrypt');

const PlayerModel = {
    /**
     * Account Registration
     */
    async register({ username, password, gender, dob }) {
        if (!password) return { success: false, error: 'Password is required' };
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const sql = `
            INSERT INTO players (username, password_hash, gender, dob) 
            VALUES (?, ?, ?, ?)
        `;

        try {
            const [result] = await pool.execute(sql, [username, hashedPassword, gender, dob]);
            return { success: true, userId: result.insertId };
        } catch (err) {
            if (err.code === 'ER_DUP_ENTRY' || err.errno === 1062) {
                return { success: false, error: 'Username already taken' };
            }
            console.error(`[DB Error] Registration: ${err.message}`);
            throw err;
        }
    },

    /**
     * Account Login
     */
    async login(username, password) {
        if (!username || !password) {
            return { success: false, error: 'Username and password are required' };
        }

        const sql = "SELECT * FROM players WHERE username = ? LIMIT 1";
        
        try {
            const [rows] = await pool.execute(sql, [username]);
            if (rows.length === 0) return { success: false, error: 'User not found' };

            const user = rows[0];
            
            // Safety check for bcrypt to prevent "data and hash arguments required" crash
            if (!user.password_hash) {
                console.error(`[Security] User ${username} found but has no password_hash in DB.`);
                return { success: false, error: 'Invalid account data' };
            }

            const isMatch = await bcrypt.compare(password, user.password_hash);
            
            if (isMatch) {
                return { 
                    success: true, 
                    user: { 
                        id: user.player_id, 
                        username: user.username, 
                        wins: user.wins || 0, 
                        losses: user.losses || 0 
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
    }
};

module.exports = PlayerModel;