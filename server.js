require('dotenv').config();
const express = require('express');
const path = require('path');
const axios = require('axios'); // We need axios here now

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
// The frontend will call this, and this server will securely call the backend
app.post('/api/download', async (req, res) => {
    if (!BACKEND_URL || !API_KEY) {
        return res.status(500).json({ error: 'Backend service is not configured.' });
    }

    try {
        // Forward the request to the real backend
        const backendResponse = await axios.post(`${BACKEND_URL}/start-download`, req.body, {
            headers: {
                'x-api-key': API_KEY
            }
        });
        res.json(backendResponse.data);
    } catch (error) {
        const status = error.response ? error.response.status : 500;
        const data = error.response ? error.response.data : { error: 'An internal error occurred.' };
        res.status(status).json(data);
    }
});

app.get('/api/status/:jobId', async (req, res) => {
    if (!BACKEND_URL || !API_KEY) {
        return res.status(500).json({ error: 'Backend service is not configured.' });
    }

    try {
        const { jobId } = req.params;
        const backendResponse = await axios.get(`${BACKEND_URL}/status/${jobId}`, {
            headers: {
                'x-api-key': API_KEY
            }
        });
        res.json(backendResponse.data);
    } catch (error) {
        const status = error.response ? error.response.status : 500;
        const data = error.response ? error.response.data : { error: 'An internal error occurred.' };
        res.status(status).json(data);
    }
});


// --- Server Startup ---
app.listen(PORT, () => {
    console.log(`Frontend Server is running on http://localhost:${PORT}`);
});
