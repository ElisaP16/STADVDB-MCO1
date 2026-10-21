require('dotenv').config();
const express = require('express');
const path = require('path');
const { connectDB, createTables } = require('./config/db');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public'))); // styles.css, images

// Routes
app.get('/', (req, res) => res.render('index'));
app.use(require('./routes/dice'));
// app.use(require('./routes/rollup'));   // one router per query page
// app.use(require('./routes/drilldown'));
// app.use(require('./routes/slice'));

// 404 and error handling (the controllers pass failures here via next(err))
app.use((req, res) => res.status(404).send('Page not found'));
app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).send('Something went wrong');
});

// Start only after the database is reachable and the schema exists
const PORT = process.env.PORT || 3000;

(async () => {
    try {
        await connectDB();
        await createTables();
        app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
    } catch (err) {
        console.error('Startup failed:', err.message);
        process.exit(1);
    }
})();
