const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const { nanoid } = require('nanoid');
const db = require('./database');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = 'ACORTADOR1957'; // Simple password

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static('public'));

// Middleware to protect routes
const requireAuth = (req, res, next) => {
    if (req.cookies.auth === ADMIN_PASSWORD) {
        next();
    } else {
        res.redirect('/login');
    }
};

// Login Routes
app.get('/login', (req, res) => {
    try {
        if (req.cookies.auth === ADMIN_PASSWORD) {
            return res.redirect('/admin');
        }
        res.render('login', { error: null });
    } catch (err) {
        console.error("Login render error:", err);
        res.status(500).send("Error al cargar login: " + err.message);
    }
});

app.post('/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        res.cookie('auth', password, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }); // 1 day
        res.redirect('/admin');
    } else {
        res.render('login', { error: 'Contraseña incorrecta' });
    }
});

app.get('/logout', (req, res) => {
    res.clearCookie('auth');
    res.redirect('/login');
});

// Admin Routes
app.get('/admin', requireAuth, async (req, res) => {
    try {
        const result = await db.query("SELECT * FROM links ORDER BY created_at DESC", []);
        res.render('admin', { links: result.rows, host: req.get('host') });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error de base de datos: " + err.message);
    }
});

// Debug Route
app.get('/debug', async (req, res) => {
    const envVars = {
        POSTGRES_URL: process.env.POSTGRES_URL ? 'Defined' : 'Undefined',
        DATABASE_URL: process.env.DATABASE_URL ? 'Defined' : 'Undefined',
        PORT: process.env.PORT
    };
    
    let dbStatus = 'Unknown';
    try {
        await db.query('SELECT 1');
        dbStatus = 'Connected';
    } catch (e) {
        dbStatus = 'Error: ' + e.message;
    }

    res.json({
        env: envVars,
        dbStatus: dbStatus,
        memory: process.memoryUsage()
    });
});

// Debug/Setup Route
app.get('/setup', async (req, res) => {
    try {
        if (db.query) {
             await db.query(`CREATE TABLE IF NOT EXISTS links (
                id SERIAL PRIMARY KEY,
                alias TEXT UNIQUE,
                url TEXT,
                clicks INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`);
            res.send("Tabla 'links' creada o verificada correctamente. <a href='/'>Volver al inicio</a>");
        } else {
            res.send("Base de datos no inicializada correctamente.");
        }
    } catch (err) {
        res.status(500).send("Error al configurar DB: " + err.message);
    }
});

app.post('/admin/create', requireAuth, async (req, res) => {
    let { alias, url } = req.body;
    if (!url) return res.redirect('/admin');

    if (!url.startsWith('http')) {
        url = 'https://' + url;
    }

    if (!alias) {
        alias = nanoid(6);
    }

    try {
        await db.query("INSERT INTO links (alias, url) VALUES ($1, $2)", [alias, url]);
    } catch (err) {
        // Handle duplicate alias error or others
        console.error(err);
    }
    res.redirect('/admin');
});

app.post('/admin/delete/:id', requireAuth, async (req, res) => {
    const id = req.params.id;
    try {
        await db.query("DELETE FROM links WHERE id = $1", [id]);
    } catch (err) {
        console.error(err);
    }
    res.redirect('/admin');
});

// Redirect Route
app.get('/:alias', async (req, res) => {
    const alias = req.params.alias;
    try {
        const result = await db.query("SELECT * FROM links WHERE alias = $1", [alias]);
        const row = result.rows[0];
        
        if (row) {
            // Update clicks async (don't wait)
            db.query("UPDATE links SET clicks = clicks + 1 WHERE id = $1", [row.id]).catch(console.error);
            res.redirect(row.url);
        } else {
            res.status(404).send("Link not found");
        }
    } catch (err) {
        console.error(err);
        res.status(500).send("Error al redirigir: " + err.message);
    }
});

app.get('/', (req, res) => {
    res.redirect('/login');
});

app.listen(PORT, (err) => {
    if (err) {
        console.error("Error starting server:", err);
    } else {
        console.log(`Server running on http://localhost:${PORT}`);
    }
});
