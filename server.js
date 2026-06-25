#!/usr/bin/env node

const express = require('express');
const path = require('path');
const { getRouter } = require('stremio-addon-sdk');
const cors = require('cors');
const addonInterface = require('./addon');
const { genres, getHighlights, getHighlight, getStream } = require('./lib/highlights');

const port = Number(process.env.PORT) || 7000;
const publicUrl = process.env.PUBLIC_URL || `http://127.0.0.1:${port}`;
const manifestUrl = `${publicUrl.replace(/\/$/, '')}/manifest.json`;

const app = express();
app.set('trust proxy', 1);

app.use('/api', cors());

app.get('/api/config', (_req, res) => {
	res.json({
		manifestUrl,
		stremioDeepLink: manifestUrl.replace(/^https?:\/\//, 'stremio://'),
		name: 'Extra Time'
	});
});

app.get('/api/genres', (_req, res) => {
	res.json({ genres });
});

app.get('/api/highlights', async (req, res) => {
	try {
		const highlights = await getHighlights(req.query.genre || null);
		res.json({ highlights });
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: 'Failed to load highlights' });
	}
});

app.get('/api/highlights/:id', async (req, res) => {
	try {
		const highlight = await getHighlight(req.params.id);
		if (!highlight) {
			res.status(404).json({ error: 'Highlight not found' });
			return;
		}
		res.json(highlight);
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: 'Failed to load highlight' });
	}
});

app.get('/api/stream/:videoId', async (req, res) => {
	try {
		const stream = await getStream(req.params.videoId);
		res.json(stream);
	} catch (err) {
		console.error(err);
		res.status(504).json({ error: err.message || 'Failed to resolve stream' });
	}
});

app.use(getRouter(addonInterface));

app.use(express.static(path.join(__dirname, 'public')));

app.get(['/', '/watch', '/watch/:id'], (_req, res) => {
	res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = app.listen(port, () => {
	console.log('Extra Time running at:', publicUrl);
	console.log('Stremio manifest:', manifestUrl);
	console.log('Web viewer:', `${publicUrl}/`);
});

module.exports = server;
