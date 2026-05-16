const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.TIDB_HOST,
    port: process.env.TIDB_PORT || 4000,
    user: process.env.TIDB_USER,
    password: process.env.TIDB_PASSWORD,
    database: process.env.TIDB_DATABASE,
    ssl: {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true 
    },
    waitForConnections: true,
    connectionLimit: 10, 
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000
});

async function testConnection() {
    const connection = await pool.getConnection();
    console.log('✅ [DATABASE] Connected to TiDB Cloud successfully.');
    
    const [tables] = await connection.query('SHOW TABLES');
    console.log(`📊 [DATABASE] Found ${tables.length} tables in TiDB schema.`);
    
    connection.release();
}

// Pass-through functions preserve the native [rows, fields] array destructuring
async function query(sql, params = []) {
    return pool.query(sql, params);
}

async function execute(sql, params = []) {
    return pool.execute(sql, params);
}

module.exports = {
    query,
    execute,
    testConnection,
    pool 
};