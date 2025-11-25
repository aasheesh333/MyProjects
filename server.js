require('dotenv').config(); // Ensure this is the first line
const express = require('express');
const path = require('path');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 5001;
const BACKEND_URL = process.env.BACKEND_URL;
const API_KEY = process.env.API_KEY;

app.use(express.json());
app.use(express.static('static'));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- API Proxy Endpoint ---
app.post('/api/download', async (req, res) => {
    console.log('Proxy received request for /api/download');
    if (!BACKEND_URL || !API_KEY) {
        console.error('Proxy Error: Backend service is not configured. Check your .env file.');
        return res.status(500).json({ error: 'Backend service is not configured.' });
    }

    try {
        console.log('Proxy is forwarding request to backend:', `${BACKEND_URL}/api/download`);
        const backendResponse = await axios.post(`${BACKEND_URL}/api/download`, req.body, {
            headers: { 'x-api-key': API_KEY }
        });
        console.log('Proxy received response from backend:', backendResponse.data);
        res.json(backendResponse.data);
    } catch (error) {
        console.error('Proxy Error forwarding request:', error.response ? error.response.data : error.message);
        const status = error.response ? error.response.status : 500;
        const data = error.response ? error.response.data : { error: 'An internal error occurred.' };
        res.status(status).json(data);
    }
});

app.get('/api/status/:jobId', async (req, res) => {
    console.log(`Proxy received request for /api/status/${req.params.jobId}`);
    if (!BACKEND_URL || !API_KEY) {
        console.error('Proxy Error: Backend service is not configured. Check your .env file.');
        return res.status(500).json({ error: 'Backend service is not configured.' });
    }

    try {
        const { jobId } = req.params;
        const backendResponse = await axios.get(`${BACKEND_URL}/status/${jobId}`, {
            headers: { 'x-api-key': API_KEY }
        });
        res.json(backendResponse.data);
    } catch (error) {
        console.error('Proxy Error forwarding status request:', error.response ? error.response.data : error.message);
        const status = error.response ? error.response.status : 500;
        const data = error.response ? error.response.data : { error: 'An internal error occurred.' };
        res.status(status).json(data);
    }
});

// --- Server Startup ---
app.listen(PORT, () => {
    console.log(`Frontend Server is running on http://localhost:${PORT}`);
});
