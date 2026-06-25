const axios = require('axios');
const cheerio = require('cheerio');
const jimp = require('jimp');
const leagues = require('../resources/leagues');

const endpoint = 'https://www.scorebat.com/video-api/v1/';

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
	'Europa League',
	'Other'
];

let data = [];
let youtubeDict = {};
let backgrounds = {};
let dataPromise = null;

const loadData = () => {
	if (!dataPromise) {
		dataPromise = axios
			.get(endpoint)
			.then(response => {
				data = response.data;
				return data;
			})
			.catch(error => {
				console.error('Failed to load highlights:', error.message);
				dataPromise = null;
				return [];
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
	} for ${formatString(object.competition.name)}`;
};

const toMeta = async (object, blur) => {
	const id = sanitiseId([object.title]);
	const league = object.competition
		? leagues[object.competition.name] || leagues.default
		: leagues.default;

	const genre =
		league === leagues.default
			? [formatString(object.competition.name), 'Other']
			: league.genres;

	let background = object.thumbnail;

	if (blur && !backgrounds[id]) {
		const image = await jimp.read(object.thumbnail);
		image.blur(5);
		background = await image.getBase64Async(jimp.MIME_PNG);
		backgrounds[id] = background;
	}

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
		country: /.+?(?=:)/.exec(formatString(object.competition.name))[0],
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

const extractLinks = async url => {
	try {
		const response = await axios.get(url);
		const youtubeIdPattern = /(?:https?:\/\/)?(?:www\.)?youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)?([a-zA-Z0-9_-]{11})/;
		const match = response.data.match(youtubeIdPattern);
		if (match && match[1]) {
			return match[1];
		}
		return null;
	} catch (error) {
		console.error('Error fetching or parsing the webpage:', error.message);
		return null;
	}
};

const fetchAndStoreVideos = object => {
	if (!object || !object.videos) return;

	object.videos.forEach(video => {
		const videoId = sanitiseId([object.title, video.title]);
		if (youtubeDict[videoId]) return;

		const url1 = parseEmbed(video.embed);
		extractLinks(url1).then(youtubeId => {
			if (youtubeId) {
				youtubeDict[videoId] = youtubeId;
			}
		});
	});
};

const sleep = ms => {
	return new Promise(resolve => {
		setTimeout(resolve, ms);
	});
};

const resolveYoutubeId = async (videoId, timeoutMs = 30000) => {
	const object = findObjectByVideoId(videoId);
	if (object) fetchAndStoreVideos(object);

	const deadline = Date.now() + timeoutMs;
	while (!youtubeDict[videoId]) {
		if (Date.now() > deadline) {
			throw new Error('Stream resolution timed out');
		}
		await sleep(100);
	}
	return youtubeDict[videoId];
};

const findObjectByVideoId = videoId => {
	const matchId = videoId.split('|||')[0];
	return getObject(matchId);
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
	if (object) fetchAndStoreVideos(object);

	const ytId = await resolveYoutubeId(videoId);
	return {
		youtubeId: ytId,
		embedUrl: `https://www.youtube.com/embed/${ytId}?autoplay=1&rel=0`,
		thumbnail: `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`
	};
};

module.exports = {
	endpoint,
	genres,
	data: () => data,
	loadData,
	sanitiseId,
	getObject,
	toMeta,
	toMetas,
	filterByGenre,
	parseEmbed,
	extractLinks,
	fetchAndStoreVideos,
	sleep,
	resolveYoutubeId,
	youtubeDict,
	getHighlights,
	getHighlight,
	getStream
};
