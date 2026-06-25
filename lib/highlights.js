const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const jimp = require('jimp');
const puppeteer = require('puppeteer');
const leagues = require('../resources/leagues');
const { fetchAllProviders, matchDedupeKey } = require('./providers');

const endpointV3 = 'https://www.scorebat.com/video-api/v3/';
const cachePath =
	process.env.HIGHLIGHTS_CACHE_PATH ||
	path.join(__dirname, '..', 'cache', 'highlights.json');

const genres = [
	'England',
	'Spain',
	'Germany',
	'Italy',
	'France',
	'Netherlands',
	'USA',
	'Argentina',
	'Brazil',
	'Mexico',
	'Australia',
	'Europa League',
	'Other'
];

let data = [];
const youtubeDict = {};
const scorebatEmbedDict = {};
let backgrounds = {};
let dataPromise = null;

const matchKey = object => matchDedupeKey(object);

const dedupeMatches = items => {
	const byKey = new Map();
	for (const item of items) {
		if (item && item.title && item.date) {
			byKey.set(matchKey(item), item);
		}
	}
	return Array.from(byKey.values());
};

const readCache = () => {
	try {
		const raw = fs.readFileSync(cachePath, 'utf8');
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
};

const writeCache = items => {
	try {
		fs.mkdirSync(path.dirname(cachePath), { recursive: true });
		fs.writeFileSync(cachePath, JSON.stringify(items));
	} catch (error) {
		console.error('Failed to write highlights cache:', error.message);
	}
};

const fetchLiveMatches = async () => {
	try {
		const { matches } = await fetchAllProviders();
		if (matches.length) {
			return dedupeMatches(matches);
		}
	} catch (error) {
		console.error('Provider fetch failed:', error.message);
	}
	return [];
};

const loadData = () => {
	if (!dataPromise) {
		dataPromise = (async () => {
			const cached = readCache();
			const live = await fetchLiveMatches();
			data = dedupeMatches([...cached, ...live]);
			writeCache(data);
			return data;
		})().catch(error => {
			console.error('Failed to load highlights:', error.message);
			dataPromise = null;
			data = readCache();
			return data;
		});
	}
	return dataPromise;
};

loadData();

const sanitiseId = strings => {
	return strings.map(string => string.replace(/\s/g, '')).join('|||');
};

const getObject = id => {
	const objectArr = data.filter(obj => sanitiseId([obj.title]) === id);
	return objectArr.length ? objectArr[0] : null;
};

const formatString = string => {
	const lowerCased = string.toLowerCase();
	const words = lowerCased.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1));
	return words.join(' ');
};

const generateDescription = object => {
	const date = new Date(object.date);
	const dateString = date.toDateString();
	const timeString = date.toTimeString();
	return `Kick off on ${dateString} at ${timeString} between ${object.side1.name} and ${
		object.side2.name
	} for ${formatString(object.competition?.name || object.competition || 'Football')}`;
};

const toMeta = async (object, blur) => {
	const id = sanitiseId([object.title]);
	const competitionName = object.competition?.name || object.competition || '';
	const league = competitionName
		? leagues[competitionName] || leagues.default
		: leagues.default;

	const genre =
		league === leagues.default
			? [formatString(competitionName), 'Other']
			: league.genres;

	let background = object.thumbnail;

	if (blur && !backgrounds[id]) {
		const image = await jimp.read(object.thumbnail);
		image.blur(5);
		background = await image.getBase64Async(jimp.MIME_PNG);
		backgrounds[id] = background;
	}

	const countryMatch = /.+?(?=:)/.exec(formatString(competitionName));
	const country = countryMatch ? countryMatch[0] : formatString(competitionName);

	const meta = {
		id,
		type: 'sports',
		name: object.title,
		poster: object.thumbnail,
		posterShape: 'landscape',
		background: background,
		logo: league.image,
		genre: genre,
		description: generateDescription(object),
		cast: [object.side1.name, object.side2.name],
		released: object.date,
		dvdRelease: object.date,
		country,
		website: object.url,
		isPeered: true,
		videos: object.videos.map(video => ({
			id: sanitiseId([object.title, video.title]),
			title: video.title,
			publishedAt: new Date(object.date),
			released: object.date,
			thumbnail: object.thumbnail,
			available: true
		}))
	};

	return blur ? meta : Promise.resolve(meta);
};

const toMetas = async items => {
	return Promise.all(items.map(object => toMeta(object)));
};

const filterByGenre = (metas, genre) => {
	if (genre === 'Other') {
		return metas.filter(meta => !meta.genre.some(g => genres.includes(g)));
	}
	return genre ? metas.filter(meta => meta.genre.includes(genre)) : metas;
};

const parseEmbed = embed => {
	const $ = cheerio.load(embed);
	return $('iframe').attr('src') || $('a').attr('href');
};

const parseScorebatVideoId = embedOrUrl => {
	if (!embedOrUrl) return null;
	const match = String(embedOrUrl).match(/\/embed\/v\/([a-f0-9]+)/i);
	return match ? match[1] : null;
};

const scorebatEmbedUrl = scorebatId =>
	`https://www.scorebat.com/embed/v/${scorebatId}/?utm_source=extra-time&utm_medium=viewer`;

const SCOREBAT_HEADERS = {
	'User-Agent':
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
	Accept: 'text/html,application/xhtml+xml'
};

const YOUTUBE_ID_PATTERN =
	/(?:https?:\/\/)?(?:www\.)?youtube\.com\/(?:embed\/|watch\?v=)([a-zA-Z0-9_-]{11})|youtu\.be\/([a-zA-Z0-9_-]{11})/;

const parseYoutubeId = html => {
	if (!html) return null;
	const match = String(html).match(YOUTUBE_ID_PATTERN);
	return match ? match[1] || match[2] : null;
};

let browserPromise = null;

const getBrowser = () => {
	if (!browserPromise) {
		const launchOptions = {
			headless: true,
			args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
		};
		if (process.env.PUPPETEER_EXECUTABLE_PATH) {
			launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
		}
		browserPromise = puppeteer.launch(launchOptions).catch(error => {
			browserPromise = null;
			throw error;
		});
	}
	return browserPromise;
};

const extractYoutubeIdWithPuppeteer = async url => {
	let page;
	try {
		const browser = await getBrowser();
		page = await browser.newPage();
		await page.setUserAgent(SCOREBAT_HEADERS['User-Agent']);
		await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
		try {
			await page.waitForSelector('iframe[src*="youtube"]', { timeout: 12000 });
		} catch {
			// ScoreBat may inject the iframe slightly later.
		}
		const html = await page.content();
		const iframeSrc = cheerio.load(html)('iframe[src*="youtube"]').attr('src');
		return parseYoutubeId(iframeSrc) || parseYoutubeId(html);
	} catch (error) {
		console.error('Puppeteer stream extraction failed:', error.message);
		return null;
	} finally {
		if (page) {
			await page.close().catch(() => {});
		}
	}
};

const extractLinks = async url => {
	if (!url) return null;
	try {
		const response = await axios.get(url, {
			timeout: 15000,
			headers: SCOREBAT_HEADERS,
			maxRedirects: 5
		});
		const youtubeId = parseYoutubeId(response.data);
		if (youtubeId) {
			return youtubeId;
		}
	} catch (error) {
		console.error('Error fetching or parsing the webpage:', error.message);
	}
	return extractYoutubeIdWithPuppeteer(url);
};

const registerVideo = (object, video) => {
	const videoId = sanitiseId([object.title, video.title]);

	if (video.youtubeId) {
		youtubeDict[videoId] = video.youtubeId;
		return;
	}

	const scorebatId =
		video.scorebatId || parseScorebatVideoId(video.embed) || parseScorebatVideoId(parseEmbed(video.embed));

	if (scorebatId) {
		scorebatEmbedDict[videoId] = scorebatEmbedUrl(scorebatId);
	}

	if (youtubeDict[videoId]) return;

	const embedUrl = parseEmbed(video.embed);
	const targetUrl = embedUrl || scorebatEmbedDict[videoId];
	if (!targetUrl) return;

	extractLinks(targetUrl).then(youtubeId => {
		if (youtubeId) {
			youtubeDict[videoId] = youtubeId;
		}
	});
};

const fetchAndStoreVideos = object => {
	if (!object || !object.videos) return;
	object.videos.forEach(video => registerVideo(object, video));
};

const sleep = ms => {
	return new Promise(resolve => {
		setTimeout(resolve, ms);
	});
};

const findObjectByVideoId = videoId => {
	const matchId = videoId.split('|||')[0];
	return getObject(matchId);
};

const findVideoById = (object, videoId) => {
	if (!object?.videos) return null;
	return object.videos.find(video => sanitiseId([object.title, video.title]) === videoId) || null;
};

const resolveYoutubeId = async (videoId, timeoutMs = 45000) => {
	const object = findObjectByVideoId(videoId);
	if (object) fetchAndStoreVideos(object);

	const deadline = Date.now() + timeoutMs;
	while (!youtubeDict[videoId]) {
		if (Date.now() > deadline) {
			return null;
		}
		await sleep(100);
	}
	return youtubeDict[videoId];
};

const toWebHighlight = meta => ({
	id: meta.id,
	title: meta.name,
	thumbnail: meta.poster,
	competition: meta.genre[0] || 'Football',
	genre: meta.genre,
	date: meta.released,
	description: meta.description,
	teams: meta.cast,
	videos: meta.videos.map(v => ({ id: v.id, title: v.title }))
});

const getHighlights = async genre => {
	await loadData();
	const metas = await toMetas(data);
	return filterByGenre(metas, genre).map(toWebHighlight);
};

const getHighlight = async id => {
	await loadData();
	const object = getObject(id);
	if (!object) return null;
	const meta = await toMeta(object, false);
	return toWebHighlight(meta);
};

const getStream = async videoId => {
	await loadData();
	const object = findObjectByVideoId(videoId);
	const video = object ? findVideoById(object, videoId) : null;

	if (object && video) {
		registerVideo(object, video);
	}

	let embedPageUrl = scorebatEmbedDict[videoId];
	if (!embedPageUrl && video) {
		const scorebatId =
			video.scorebatId || parseScorebatVideoId(video.embed) || parseScorebatVideoId(parseEmbed(video.embed));
		if (scorebatId) {
			embedPageUrl = scorebatEmbedUrl(scorebatId);
			scorebatEmbedDict[videoId] = embedPageUrl;
		}
	}

	if (youtubeDict[videoId]) {
		const ytId = youtubeDict[videoId];
		return {
			youtubeId: ytId,
			embedUrl: `https://www.youtube.com/embed/${ytId}?autoplay=1&rel=0`,
			thumbnail: `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`,
			provider: 'youtube'
		};
	}

	if (embedPageUrl) {
		return {
			embedUrl: embedPageUrl,
			thumbnail: object?.thumbnail,
			provider: 'scorebat'
		};
	}

	const ytId = await resolveYoutubeId(videoId, 12000);
	if (ytId) {
		return {
			youtubeId: ytId,
			embedUrl: `https://www.youtube.com/embed/${ytId}?autoplay=1&rel=0`,
			thumbnail: `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`,
			provider: 'youtube'
		};
	}

	throw new Error('Stream resolution timed out');
};

module.exports = {
	endpoint: endpointV3,
	genres,
	data: () => data,
	loadData,
	sanitiseId,
	getObject,
	toMeta,
	toMetas,
	filterByGenre,
	parseEmbed,
	parseScorebatVideoId,
	extractLinks,
	fetchAndStoreVideos,
	registerVideo,
	sleep,
	resolveYoutubeId,
	youtubeDict,
	scorebatEmbedDict,
	getHighlights,
	getHighlight,
	getStream
};
