const fs = require('fs');
const path = require('path');

const CACHE_DIR = path.join(__dirname, '..', 'data');
const CACHE_FILE = path.join(CACHE_DIR, 'highlights-cache.json');
const DEFAULT_TTL_MS = Number(process.env.HIGHLIGHTS_CACHE_TTL_MS) || 6 * 60 * 60 * 1000;

const ensureDir = () => {
	if (!fs.existsSync(CACHE_DIR)) {
		fs.mkdirSync(CACHE_DIR, { recursive: true });
	}
};

const readCache = () => {
	try {
		ensureDir();
		if (!fs.existsSync(CACHE_FILE)) {
			return { updatedAt: 0, matches: [] };
		}
		const parsed = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
		return {
			updatedAt: parsed.updatedAt || 0,
			matches: Array.isArray(parsed.matches) ? parsed.matches : []
		};
	} catch (error) {
		console.error('Failed to read highlights cache:', error.message);
		return { updatedAt: 0, matches: [] };
	}
};

const writeCache = matches => {
	try {
		ensureDir();
		fs.writeFileSync(
			CACHE_FILE,
			JSON.stringify(
				{
					updatedAt: Date.now(),
					matchCount: matches.length,
					matches
				},
				null,
				2
			)
		);
	} catch (error) {
		console.error('Failed to write highlights cache:', error.message);
	}
};

const matchKey = match => {
	if (match.url) return match.url;
	return `${match.title || ''}|||${match.date || ''}`;
};

const mergeMatches = (existing, incoming) => {
	const byKey = new Map();
	[...existing, ...incoming].forEach(match => {
		if (!match || !match.title) return;
		byKey.set(matchKey(match), match);
	});
	return Array.from(byKey.values()).sort(
		(a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
	);
};

const isFresh = updatedAt => Date.now() - updatedAt < DEFAULT_TTL_MS;

module.exports = {
	CACHE_FILE,
	DEFAULT_TTL_MS,
	readCache,
	writeCache,
	mergeMatches,
	isFresh,
	matchKey
};
