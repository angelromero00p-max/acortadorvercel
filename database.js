const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { Pool } = require('pg');

let db;
let isPostgres = false;

// Si estamos en Vercel (o tenemos URL de Postgres), usamos Postgres
if (process.env.POSTGRES_URL || process.env.DATABASE_URL) {
    isPostgres = true;
    const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
    
    db = new Pool({
        connectionString: connectionString,
        ssl: {
            rejectUnauthorized: false
        }
    });

    console.log('Connected to PostgreSQL database.');
    
    // Crear tabla en Postgres
    db.query(`CREATE TABLE IF NOT EXISTS links (
        id SERIAL PRIMARY KEY,
        alias TEXT UNIQUE,
        url TEXT,
        clicks INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`).catch(err => console.error('Error creating table in PG', err));

} else {
    // Modo local con SQLite
    const dbPath = path.resolve(__dirname, 'database.sqlite');
    const sqliteDb = new sqlite3.Database(dbPath, (err) => {
        if (err) {
            console.error('Error opening SQLite database', err.message);
        } else {
            console.log('Connected to the SQLite database.');
            sqliteDb.run(`CREATE TABLE IF NOT EXISTS links (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                alias TEXT UNIQUE,
                url TEXT,
                clicks INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`, (err) => {
                if (err) console.error('Error creating table', err.message);
            });
        }
    });
    
    // Wrapper para que SQLite se parezca a la interfaz que usaremos
    db = {
        query: (text, params) => {
            return new Promise((resolve, reject) => {
                // Convertir $1, $2... a ? para SQLite
                const sql = text.replace(/\$\d+/g, '?');
                
                // Detectar tipo de query
                if (text.trim().toUpperCase().startsWith('SELECT')) {
                    if (text.includes('LIMIT 1') || text.includes('WHERE alias =')) {
                         // Asumimos get único si parece un select por ID o alias único
                         // Aunque 'all' funciona siempre, para compatibilidad con pg.query que devuelve rows[]
                         sqliteDb.all(sql, params, (err, rows) => {
                             if (err) reject(err);
                             else resolve({ rows });
                         });
                    } else {
                        sqliteDb.all(sql, params, (err, rows) => {
                            if (err) reject(err);
                            else resolve({ rows });
                        });
                    }
                } else {
                    // INSERT, UPDATE, DELETE
                    sqliteDb.run(sql, params, function(err) {
                        if (err) reject(err);
                        else resolve({ rowCount: this.changes });
                    });
                }
            });
        }
    };
}

module.exports = db;
