const axios = require('axios');

const V1_ENDPOINT = 'https://www.scorebat.com/video-api/v1/';
const V3_BASE = 'https://www.scorebat.com/video-api/v3';

const COMPETITION_SLUGS = [
	'england-premier-league',
	'england-championship',
	'england-fa-cup',
	'england-league-cup',
	'spain-la-liga',
	'spain-copa-del-rey',
	'germany-bundesliga',
	'germany-dfb-pokal',
	'italy-serie-a',
	'italy-coppa-italia',
	'france-ligue-1',
	'netherlands-eredivisie',
	'usa-major-league-soccer',
	'argentina-primera-division',
	'brazil-serie-a',
	'mexico-liga-mx',
	'australia-a-league',
	'europe-uefa-champions-league',
	'europe-uefa-europa-league',
	'portugal-primeira-liga',
	'scotland-premiership',
	'turkey-super-lig',
	'belgium-first-division-a',
	'saudi-arabia-pro-league',
	'japan-j-league',
	'south-korea-k-league'
];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const fetchJson = async url => {
	const response = await axios.get(url, {
		timeout: 30000,
		headers: {
			'User-Agent': 'Extra-Time/1.0 (+https://highlights.tvflix.co.uk)'
		},
		validateStatus: status => status < 500
	});
	if (response.status >= 400) {
		const message =
			(response.data && response.data.error && response.data.error.text) ||
			`HTTP ${response.status}`;
		throw new Error(message);
	}
	return response.data;
};

const normalizeCompetition = competition => {
	if (!competition) {
		return { name: 'Football', id: null, url: null };
	}
	if (typeof competition === 'string') {
		return { name: competition, id: null, url: null };
	}
	return competition;
};

const normalizeMatch = raw => {
	if (!raw || !raw.title) return null;

	const competition = normalizeCompetition(raw.competition);
	const [fallbackHome, fallbackAway] = String(raw.title)
		.split(' - ')
		.map(part => part.trim());

	const side1 = raw.side1 || {
		name: raw.homeTeam?.name || fallbackHome || 'Home',
		url: raw.homeTeam?.url || ''
	};
	const side2 = raw.side2 || {
		name: raw.awayTeam?.name || fallbackAway || 'Away',
		url: raw.awayTeam?.url || ''
	};

	return {
		title: raw.title,
		embed: raw.embed,
		url: raw.url || raw.matchviewUrl || raw.matchViewUrl || '',
		thumbnail: raw.thumbnail,
		date: raw.date,
		side1,
		side2,
		competition,
		videos: Array.isArray(raw.videos) ? raw.videos : []
	};
};

const extractMatches = payload => {
	if (Array.isArray(payload)) {
		return payload.map(normalizeMatch).filter(Boolean);
	}
	if (payload && Array.isArray(payload.response)) {
		return payload.response.map(normalizeMatch).filter(Boolean);
	}
	return [];
};

const fetchV1Feed = async () => {
	const payload = await fetchJson(V1_ENDPOINT);
	return extractMatches(payload);
};

const fetchV3Endpoint = async (token, endpoint) => {
	const url = `${V3_BASE}/${endpoint}/?token=${encodeURIComponent(token)}`;
	const payload = await fetchJson(url);
	return extractMatches(payload);
};

const fetchAllSources = async token => {
	const sources = [{ name: 'v1', matches: await fetchV1Feed() }];
	const errors = [];

	if (token) {
		const v3Endpoints = ['free-feed', 'featured-feed', ...COMPETITION_SLUGS.map(slug => `competition/${slug}`)];

		for (const endpoint of v3Endpoints) {
			try {
				const matches = await fetchV3Endpoint(token, endpoint);
				if (matches.length) {
					sources.push({ name: endpoint, matches });
				}
				await sleep(150);
			} catch (error) {
				errors.push(`${endpoint}: ${error.message}`);
			}
		}
	}

	const merged = [];
	const seen = new Set();
	sources.forEach(source => {
		source.matches.forEach(match => {
			const key = match.url || `${match.title}|||${match.date}`;
			if (seen.has(key)) return;
			seen.add(key);
			merged.push(match);
		});
	});

	merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

	return {
		matches: merged,
		sources: sources.map(source => ({ name: source.name, count: source.matches.length })),
		errors
	};
};

module.exports = {
	V1_ENDPOINT,
	V3_BASE,
	COMPETITION_SLUGS,
	fetchV1Feed,
	fetchAllSources,
	normalizeMatch,
	extractMatches
};
