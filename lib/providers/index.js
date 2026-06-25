const axios = require('axios');
const { fetchV1Feed } = require('../scorebat');
const { fetchYoutubeMatches } = require('./youtube');

const V3_ENDPOINT = 'https://www.scorebat.com/video-api/v3/';

const normalizeV3Match = item => ({
	title: item.title,
	embed: item.matchviewUrl || '',
	url: (item.matchviewUrl || '').replace('/embed/matchview/', '/').replace(/\/$/, '/'),
	thumbnail: item.thumbnail,
	date: item.date,
	side1: {
		name: item.homeTeam?.name || 'Home',
		url: item.homeTeam?.slug
			? `https://www.scorebat.com/live-stream/${item.homeTeam.slug}/`
			: ''
	},
	side2: {
		name: item.awayTeam?.name || 'Away',
		url: item.awayTeam?.slug
			? `https://www.scorebat.com/live-stream/${item.awayTeam.slug}/`
			: ''
	},
	competition: {
		name: item.competition,
		id: 0,
		url: item.competitionUrl || ''
	},
	videos: (item.videos || []).map(video => ({
		title: video.title,
		embed: video.embed,
		scorebatId: video.id
	}))
});

const fetchScorebatFree = async () => {
	const [fromV1, fromV3] = await Promise.all([
		fetchV1Feed().catch(() => []),
		axios
			.get(V3_ENDPOINT, { timeout: 20000 })
			.then(response => (response.data.response || []).map(normalizeV3Match))
			.catch(() => [])
	]);

	return [...fromV1, ...fromV3];
};

const matchDedupeKey = match => {
	const home = match.side1?.name;
	const away = match.side2?.name;
	const date = match.date ? new Date(match.date).toISOString().slice(0, 10) : '';

	if (home && away && date && home !== 'Home' && away !== 'Away') {
		return `${home}|||${away}|||${date}`.toLowerCase();
	}

	return (match.url || `${match.title}|||${match.date}`).toLowerCase();
};

const mergeMatches = (...lists) => {
	const byKey = new Map();

	for (const list of lists) {
		for (const match of list) {
			if (!match?.title || !match?.date) continue;
			const key = matchDedupeKey(match);
			if (!byKey.has(key)) {
				byKey.set(key, match);
			}
		}
	}

	return Array.from(byKey.values()).sort(
		(a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
	);
};

const fetchAllProviders = async () => {
	const [scorebatMatches, youtubeMatches] = await Promise.all([
		fetchScorebatFree().catch(error => {
			console.error('ScoreBat free feed failed:', error.message);
			return [];
		}),
		fetchYoutubeMatches().catch(error => {
			console.error('YouTube feed failed:', error.message);
			return [];
		})
	]);

	const matches = mergeMatches(scorebatMatches, youtubeMatches);

	return {
		matches,
		sources: [
			{ name: 'scorebat', count: scorebatMatches.length },
			{ name: 'youtube', count: youtubeMatches.length }
		]
	};
};

module.exports = {
	fetchScorebatFree,
	fetchAllProviders,
	matchDedupeKey,
	mergeMatches
};
