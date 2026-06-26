const axios = require('axios');
const cheerio = require('cheerio');
const { normalizeMatch } = require('../scorebat');
const { parseTeamsFromTitle } = require('./youtube');

const REDDIT_SEARCH_RSS =
	'https://www.reddit.com/r/soccer/search.rss?q=flair%3AMedia+site%3Ayoutube.com&restrict_sr=on&sort=new';

const YOUTUBE_ID_PATTERN = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

const parseYoutubeId = text => {
	const match = String(text || '').match(YOUTUBE_ID_PATTERN);
	return match ? match[1] : null;
};

const buildMatchTitle = (home, away) => `${home} - ${away}`;

const entryToMatch = entry => {
	const title = entry.title?.trim();
	const link = entry.link?.trim();
	const published = entry.published?.trim();
	const youtubeId = parseYoutubeId(link) || parseYoutubeId(entry.content);

	if (!title || !youtubeId || !published) {
		return null;
	}

	const teams = parseTeamsFromTitle(title);
	if (!teams) {
		return null;
	}

	return normalizeMatch({
		title: buildMatchTitle(teams.home, teams.away),
		url: `https://www.youtube.com/watch?v=${youtubeId}`,
		thumbnail: `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`,
		date: published,
		side1: { name: teams.home, url: '' },
		side2: { name: teams.away, url: '' },
		competition: 'REDDIT: r/soccer',
		videos: [
			{
				title: title,
				embed: '',
				youtubeId
			}
		]
	});
};

const parseRedditFeed = xml => {
	const $ = cheerio.load(xml, { xmlMode: true });
	const entries = [];

	$('entry').each((_index, element) => {
		const entry = $(element);
		const title = entry.find('title').first().text().trim();
		const link =
			entry.find('link').attr('href') ||
			entry.find('link').first().text().trim();
		const published = entry.find('updated').first().text().trim() || entry.find('published').first().text().trim();
		const content = entry.find('content').first().text();

		if (title && link) {
			entries.push({ title, link, published, content });
		}
	});

	return entries;
};

const fetchRedditMatches = async () => {
	try {
		const response = await axios.get(REDDIT_SEARCH_RSS, {
			timeout: 20000,
			headers: {
				'User-Agent': 'Extra-Time/1.0 (+https://highlights.tvflix.co.uk)'
			},
			validateStatus: status => status < 500
		});

		if (response.status >= 400 || !response.data) {
			throw new Error(`Reddit RSS failed: HTTP ${response.status}`);
		}

		return parseRedditFeed(response.data).map(entryToMatch).filter(Boolean);
	} catch (error) {
		console.error('Reddit feed failed:', error.message);
		return [];
	}
};

module.exports = {
	REDDIT_SEARCH_RSS,
	fetchRedditMatches,
	entryToMatch,
	parseRedditFeed
};
