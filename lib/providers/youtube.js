const axios = require('axios');
const cheerio = require('cheerio');
const channels = require('../../resources/youtube-channels');
const { normalizeMatch } = require('../scorebat');

const RSS_URL = 'https://www.youtube.com/feeds/videos.xml';

const HIGHLIGHTS_PATTERN =
	/\b(highlights?|extended highlights?|official highlights?|match highlights?|full match highlights?|all goals|resumen|résumé|resume|summary)\b/i;

const SKIP_PATTERN =
	/\b(press conference|training|preview|interview|behind the scenes|documentary|podcast|draw|trophy|ceremony|skills|best of the season|top \d+|every \w+ goal|goal collection|round up|all highlights\s*\||matchday \d+\s*all highlights|classic highlights|road to the|world cup|24\/7 live stream)\b/i;

const parseTeamsFromTitle = title => {
	const cleaned = String(title).trim();

	let match = cleaned.match(/^HIGHLIGHTS:\s*(.+?)\s+(?:vs\.?|v\.?)\s+(.+?)(?:\s*\||\s*$)/i);
	if (match) {
		return { home: match[1].trim(), away: match[2].trim() };
	}

	match = cleaned.match(/^(.+?)\s+\d+\s*-\s*\d+\s+(.+?)(?:\s*\||\s*$)/);
	if (match) {
		return { home: match[1].trim(), away: match[2].trim() };
	}

	match = cleaned.match(/\|\s*([A-Za-z][A-Za-z0-9\s]+-[A-Za-z][A-Za-z0-9\s]+)\s*\|/);
	if (match) {
		const parts = match[1].split('-').map(part => part.trim());
		if (parts.length === 2) {
			return { home: parts[0], away: parts[1] };
		}
	}

	match = cleaned.match(/(.+?)\s+(?:vs\.?|v\.?)\s+(.+?)(?:\s*\||\s*$)/i);
	if (match) {
		return { home: match[1].trim(), away: match[2].trim() };
	}

	match = cleaned.match(/^(.+?)\s+[-–]\s+(.+?)\s*\|/);
	if (match) {
		return { home: match[1].trim(), away: match[2].trim() };
	}

	return null;
};

const buildMatchTitle = (home, away) => `${home} - ${away}`;

const fetchChannelFeed = async channel => {
	const params = channel.playlistId
		? { playlist_id: channel.playlistId }
		: { channel_id: channel.channelId };

	const response = await axios.get(RSS_URL, {
		params,
		timeout: 20000,
		headers: {
			'User-Agent': 'Extra-Time/1.0 (+https://highlights.tvflix.co.uk)'
		},
		validateStatus: status => status < 500
	});

	if (response.status >= 400 || !response.data) {
		const source = channel.playlistId || channel.channelId;
		throw new Error(`RSS feed failed for ${source}: HTTP ${response.status}`);
	}

	return response.data;
};

const parseFeedEntries = xml => {
	const $ = cheerio.load(xml, { xmlMode: true });
	const entries = [];

	$('entry').each((_index, element) => {
		const entry = $(element);
		const videoId = entry.find('yt\\:videoId').first().text() || entry.find('videoId').first().text();
		const title = entry.find('title').first().text().trim();
		const published = entry.find('published').first().text().trim();
		const link =
			entry.find('link[rel="alternate"]').attr('href') ||
			(videoId ? `https://www.youtube.com/watch?v=${videoId}` : '');
		const thumbnail =
			entry.find('media\\:thumbnail').attr('url') ||
			(videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '');

		if (videoId && title && published) {
			entries.push({ videoId, title, published, link, thumbnail });
		}
	});

	return entries;
};

const entryToMatch = (entry, channel) => {
	if (!HIGHLIGHTS_PATTERN.test(entry.title) || SKIP_PATTERN.test(entry.title)) {
		return null;
	}

	const teams = parseTeamsFromTitle(entry.title);
	if (!teams) {
		return null;
	}

	const home = teams.home;
	const away = teams.away;

	return normalizeMatch({
		title: buildMatchTitle(home, away),
		url: entry.link,
		thumbnail: entry.thumbnail,
		date: entry.published,
		side1: { name: home, url: '' },
		side2: { name: away, url: '' },
		competition: channel.competition,
		videos: [
			{
				title: entry.title,
				embed: '',
				youtubeId: entry.videoId
			}
		]
	});
};

const fetchChannelMatches = async channel => {
	try {
		const xml = await fetchChannelFeed(channel);
		return parseFeedEntries(xml)
			.map(entry => entryToMatch(entry, channel))
			.filter(Boolean);
	} catch (error) {
		console.error(`YouTube feed failed (${channel.competition}):`, error.message);
		return [];
	}
};

const fetchYoutubeMatches = async () => {
	const results = await Promise.all(channels.map(fetchChannelMatches));
	return results.flat();
};

module.exports = {
	channels,
	HIGHLIGHTS_PATTERN,
	parseTeamsFromTitle,
	fetchChannelFeed,
	parseFeedEntries,
	entryToMatch,
	fetchChannelMatches,
	fetchYoutubeMatches
};
