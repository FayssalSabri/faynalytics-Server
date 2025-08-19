const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS for your frontend
app.use(cors());
app.use(express.json());

// Google Drive API credentials
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:5000/google/callback'; // Must match your Google Cloud Console setting

const oauth2Client = new google.auth.OAuth2(
    CLIENT_ID,
    CLIENT_SECRET,
    REDIRECT_URI
);

// Stores user tokens (in-memory, for development only!)
const tokens = {};

// --- Authentication Route ---
app.get('/google/auth', (req, res) => {
    const scopes = [
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/userinfo.profile'
    ];
    const url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: scopes,
    });
    res.redirect(url);
});

// --- Authentication Callback Route ---
app.get('/google/callback', async (req, res) => {
    const { code } = req.query;
    try {
        const { tokens: newTokens } = await oauth2Client.getToken(code);
        tokens.access_token = newTokens.access_token;
        tokens.refresh_token = newTokens.refresh_token;

        // Redirect back to your frontend with a success message
        res.redirect('http://localhost:5173/settings?status=success');

    } catch (error) {
        console.error('Authentication failed:', error);
        res.status(500).send('Authentication failed');
    }
});

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
    if (!tokens.access_token) {
        return res.status(401).send('Not authenticated. Please connect to Google Drive first.');
    }
    next();
};

// --- Save Journal to Google Drive ---
app.post('/api/save-journal', isAuthenticated, async (req, res) => {
    try {
        oauth2Client.setCredentials(tokens);
        const drive = google.drive({ version: 'v3', auth: oauth2Client });
        const journalData = JSON.stringify(req.body.journalData, null, 2);

        // Check if the file already exists
        const files = await drive.files.list({ q: "name = 'Faynalytics_Journal.json'" });
        const existingFile = files.data.files[0];

        if (existingFile) {
            // Update existing file
            await drive.files.update({
                fileId: existingFile.id,
                media: {
                    mimeType: 'application/json',
                    body: journalData,
                },
            });
            res.status(200).send({ message: 'Journal updated successfully.' });
        } else {
            // Create a new file
            await drive.files.create({
                requestBody: {
                    name: 'Faynalytics_Journal.json',
                    mimeType: 'application/json',
                },
                media: {
                    mimeType: 'application/json',
                    body: journalData,
                },
            });
            res.status(201).send({ message: 'Journal saved successfully.' });
        }

    } catch (error) {
        console.error('Failed to save journal:', error);
        res.status(500).send('Failed to save journal');
    }
});

// --- Load Journal from Google Drive ---
app.get('/api/load-journal', isAuthenticated, async (req, res) => {
    try {
        oauth2Client.setCredentials(tokens);
        const drive = google.drive({ version: 'v3', auth: oauth2Client });

        // Find the journal file
        const files = await drive.files.list({ q: "name = 'Faynalytics_Journal.json'" });
        const journalFile = files.data.files[0];

        if (!journalFile) {
            return res.status(404).send({ message: 'No journal found on Google Drive.' });
        }

        // Download the file content
        const fileContent = await drive.files.get({
            fileId: journalFile.id,
            alt: 'media',
        });
        
        res.status(200).json(fileContent.data);

    } catch (error) {
        console.error('Failed to load journal:', error);
        res.status(500).send('Failed to load journal');
    }
});

// --- NOUVELLE ROUTE : Récupérer le profil utilisateur ---
app.get('/api/user-profile', isAuthenticated, async (req, res) => {
    try {
        oauth2Client.setCredentials(tokens);
        const userInfo = google.oauth2({ version: 'v2', auth: oauth2Client });
        const profile = await userInfo.userinfo.get();
        res.status(200).json(profile.data);
    } catch (error) {
        console.error('Failed to fetch user profile:', error);
        res.status(500).send('Failed to fetch user profile');
    }
});


app.listen(PORT, () => {
    console.log(`Backend server is running on http://localhost:${PORT}`);
});
