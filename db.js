
const mysql = require('mysql2/promise');
require('dotenv').config();

/**
 * TiDB Connection Pool
 * Using a pool is essential for multiplayer games to handle 
 * multiple concurrent requests without crashing the server.
 */
const pool = mysql.createPool({
    host: process.env.TIDB_HOST,
    port: process.env.TIDB_PORT || 4000,
    user: process.env.TIDB_USER,
    password: process.env.TIDB_PASSWORD,
    database: process.env.TIDB_DATABASE,
    ssl: {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true // TiDB Cloud requires secure SSL connections
    },
    waitForConnections: true,
    connectionLimit: 10, // Adjust based on your traffic needs
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000
});

/**
 * Immediate Connection Test
 * This self-invoking function checks the database status on server startup.
 */
(async () => {
    try {
        const connection = await pool.getConnection();
        console.log('✅ [DATABASE] Connected to TiDB Cloud successfully.');
        
        // Check if our tables exist
        const [tables] = await connection.query('SHOW TABLES');
        console.log(`📊 [DATABASE] Found ${tables.length} tables in schema.`);
        
        connection.release();
    } catch (err) {
        console.error('❌ [DATABASE] Connection failed!');
        console.error('Error Details:', err.message);
        
        // Helpful tip for common TiDB errors
        if (err.message.includes('getaddrinfo')) {
            console.error('Tip: Check if your TIDB_HOST in .env is correct.');
        } else if (err.message.includes('Access denied')) {
            console.error('Tip: Double-check your TIDB_USER and TIDB_PASSWORD.');
        }
    }
})();

module.exports = pool;