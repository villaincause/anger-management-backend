// backend/config/oracle.js
const oracledb = require('oracledb');
require('dotenv').config();

oracledb.autoCommit = true;
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

async function testConnection() {
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASSWORD,
            connectString: process.env.ORACLE_CONNECT_STRING
        });
        console.log('🔌 [DATABASE] Connected to Local Oracle XE 21c successfully.');
        
        const result = await connection.execute(`SELECT table_name FROM user_tables`);
        console.log(`📊 [DATABASE] Found ${result.rows.length} tables in Oracle schema.`);
    } finally {
        if (connection) {
            await connection.close();
        }
    }
}

async function executeOracle(sql, params = []) {
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASSWORD,
            connectString: process.env.ORACLE_CONNECT_STRING
        });

        let formattedSql = sql;
        let formattedParams = params;
        
        // 1. DATE FORMAT COMPATIBILITY HELPER
        if (
            sql.toLowerCase().includes('into players') || 
            sql.toLowerCase().includes('update players')
        ) {
            let matchCount = 0;
            formattedSql = sql.replace(/\?/g, (match) => {
                matchCount++;
                if (matchCount === 4) {
                    return "TO_DATE(?, 'YYYY-MM-DD')";
                }
                return match;
            });
        }

        // 2. LIMIT TO FETCH FIRST ROWS COMPATIBILITY HELPER
        const limitRegex = /limit\s+(\d+)/i;
        if (limitRegex.test(formattedSql)) {
            const match = formattedSql.match(limitRegex);
            const limitValue = match[1];
            formattedSql = formattedSql.replace(limitRegex, '').trim();
            if (formattedSql.endsWith(';')) {
                formattedSql = formattedSql.slice(0, -1).trim();
            }
            formattedSql += ` FETCH FIRST ${limitValue} ROWS ONLY`;
        }

        // 3. MYSQL '?' TO ORACLE POSITIONAL PARAMETER CONVERSION
        if (Array.isArray(formattedParams) && formattedParams.length > 0 && formattedSql.includes('?')) {
            let counter = 1;
            formattedSql = formattedSql.replace(/\?/g, () => `:${counter++}`);
        }

        const result = await connection.execute(formattedSql, formattedParams);

        // 4. MOCK ARRAY FOR DESTRUCTURING & CASE COMPATIBILITY
        let data;
        if (result.rows) {
            // CASE NORMALIZATION HELPER:
            // Oracle returns keys in UPPERCASE (e.g., PASSWORD_HASH).
            // We map them to lowercase (e.g., password_hash) to seamlessly match your MySQL models.
            data = result.rows.map(row => {
                const normalizedRow = {};
                for (const key in row) {
                    normalizedRow[key.toLowerCase()] = row[key];
                }
                return normalizedRow;
            });
        } else {
            data = {
                affectedRows: result.rowsAffected,
                insertId: null 
            };
        }

        return [data, null]; 
    } catch (err) {
        console.error('❌ Oracle Driver Query Error:', err.message);
        throw err;
    } finally {
        if (connection) {
            await connection.close();
        }
    }
}

module.exports = {
    query: executeOracle,
    execute: executeOracle,
    testConnection
};