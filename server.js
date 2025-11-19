import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const PORT = process.env.PORT || 5001;
// We need to expose these to the client-side script
const { BACKEND_URL, API_KEY } = process.env;

if (!BACKEND_URL || !API_KEY) {
    console.error("FATAL ERROR: BACKEND_URL and API_KEY must be defined in your .env file.");
    process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, 'static')));

// --- Page Routes ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/signup', (req, res) => res.sendFile(path.join(__dirname, 'signup.html')));
app.get('/pricing', (req, res) => res.sendFile(path.join(__dirname, 'pricing.html')));

// --- New Endpoint to provide config to the frontend ---
app.get('/api/config', (req, res) => {
    res.json({
        backendUrl: BACKEND_URL,
        apiKey: API_KEY
    });
});

// --- Server Startup ---
app.listen(PORT, () => {
    console.log(`JusDown Frontend Server is running on http://localhost:${PORT}`);
});
