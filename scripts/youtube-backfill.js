#!/usr/bin/env node

const axios = require('axios');
const channels = require('../resources/youtube-channels');
const { parseFeedEntries, entryToMatch } = require('../lib/providers/youtube');

const API_KEY = process.env.YOUTUBE_API_KEY;

const fetchUploadsPlaylist = async channelId => {
	const response = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
		params: {
			part: 'contentDetails',
			id: channelId,
			key: API_KEY
		},
		timeout: 20000
	});

	const uploadsId = response.data?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
	if (!uploadsId) {
		throw new Error(`No uploads playlist for ${channelId}`);
	}
	return uploadsId;
};

const fetchPlaylistItems = async (playlistId, pageToken) => {
	const response = await axios.get('https://www.googleapis.com/youtube/v3/playlistItems', {
		params: {
			part: 'snippet',
			playlistId,
			maxResults: 50,
			pageToken,
			key: API_KEY
		},
		timeout: 20000
	});
	return response.data;
};

const playlistItemToEntry = item => ({
	videoId: item.snippet?.resourceId?.videoId,
	title: item.snippet?.title,
	published: item.snippet?.publishedAt,
	link: `https://www.youtube.com/watch?v=${item.snippet?.resourceId?.videoId}`,
	thumbnail:
		item.snippet?.thumbnails?.high?.url ||
		item.snippet?.thumbnails?.medium?.url ||
		item.snippet?.thumbnails?.default?.url ||
		''
});

const backfillChannel = async channel => {
	const playlistId = await fetchUploadsPlaylist(channel.channelId);
	let pageToken;
	const matches = [];

	do {
		const payload = await fetchPlaylistItems(playlistId, pageToken);
		for (const item of payload.items || []) {
			const entry = playlistItemToEntry(item);
			const match = entryToMatch(entry, channel);
			if (match) matches.push(match);
		}
		pageToken = payload.nextPageToken;
	} while (pageToken);

	return matches;
};

const main = async () => {
	if (!API_KEY) {
		console.error('Set YOUTUBE_API_KEY to run the backfill script.');
		process.exit(1);
	}

	const allMatches = [];
	for (const channel of channels) {
		try {
			const matches = await backfillChannel(channel);
			console.log(`${channel.competition}: ${matches.length} highlights`);
			allMatches.push(...matches);
		} catch (error) {
			console.error(`${channel.competition}: ${error.message}`);
		}
	}

	console.log(`Total: ${allMatches.length} highlight matches`);
};

main().catch(error => {
	console.error(error.message);
	process.exit(1);
});
