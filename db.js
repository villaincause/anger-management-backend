require('dotenv').config();

const dialect = (process.env.DB_DIALECT || 'tidb').toLowerCase();
let dbEngine;

// Dynamically source the connection logic from the config folder
if (dialect === 'oracle') {
    dbEngine = require('./config/oracle');
} else {
    dbEngine = require('./config/mysql');
}

/**
 * Immediate Connection Test
 * Runs immediately on server startup to visually display connection statuses.
 */
(async () => {
    try {
        await dbEngine.testConnection();
    } catch (err) {
        console.error('❌ [DATABASE] Startup Connection failed!');
        console.error('Error Details:', err.message);
        
        if (dialect === 'oracle') {
            console.error('Tip: Make sure your local Oracle database service (XEPDB1) is currently running.');
        } else {
            if (err.message.includes('getaddrinfo')) {
                console.error('Tip: Check if your TIDB_HOST in .env is correct.');
            } else if (err.message.includes('Access denied')) {
                console.error('Tip: Double-check your TIDB_USER and TIDB_PASSWORD.');
            }
        }
    }
})();

// Export unified engine interface (.query) to protect original server logic
module.exports = dbEngine;