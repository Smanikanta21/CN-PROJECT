const express = require('express');
const app = express();
const port = 3001;

app.use((req, res, next) => {
    console.log(new Date().toISOString(), 'from', req.socket.remoteAddress, req.method, req.url);
    next();
});

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

// Same body on A and B -> same ETag -> a 304 works whichever backend answers
app.get('/api/info', (req, res) => {
    res.setHeader('Cache-Control', 'max-age=60');
    res.json({ service: 'RouteX private API', version: 2 });
});

// Quick liveness check used while troubleshooting
app.get('/health', (req, res) => {
    res.json({ healthy: true });
});

// Handle 404 for other routes
app.use((req, res) => {
    res.status(404).json({ error: 'Not Found' });
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Backend A listening at http://0.0.0.0:${port}`);
});
