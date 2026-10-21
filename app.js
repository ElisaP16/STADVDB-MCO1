require('dotenv').config();
const express = require('express');
const path = require('path');
const { connectDB, createTables } = require('./config/db');

function createApp() {
    const app = express();

    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, 'views'));
    app.use(express.json());
    app.use(express.static(path.join(__dirname, 'public')));

    app.get('/', (req, res) => res.render('index'));
    app.use(require('./routes/dice'));
    app.use(require('./routes/rollup'));
    app.use(require('./routes/drilldown'));

    app.use((req, res) => res.status(404).send('Page not found'));
    app.use((err, req, res, next) => {
        console.error(err);
        res.status(500).send('Something went wrong');
    });

    return app;
}

const PORT = process.env.PORT || 3000;

if (require.main === module) {
    (async () => {
        try {
            await connectDB();
            await createTables();
            const app = createApp();
            app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
        } catch (err) {
            console.error('Startup failed:', err.message);
            process.exit(1);
        }
    })();
}

module.exports = { createApp, connectDB, createTables };
