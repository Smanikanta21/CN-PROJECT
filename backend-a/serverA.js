const express = require('express');
const app = express();
const port = 3001;

// Middleware to add the X-Backend header to all responses
app.use((req, res, next) => {
    res.setHeader('X-Backend', 'A');
    next();
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({ backend: 'A', status: 'ok' });
});

// Status endpoint with Cache-Control header
app.get('/api/status', (req, res) => {
    res.setHeader('Cache-Control', 'max-age=60');
    res.json({ backend: 'A', status: 'ok' });
});

// Handle 404 for other routes
app.use((req, res) => {
    res.status(404).json({ error: 'Not Found' });
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Backend A listening at http://0.0.0.0:${port}`);
});
