const { addonBuilder } = require('stremio-addon-sdk');
const {
	genres,
	data,
	loadData,
	getObject,
	toMeta,
	toMetas,
	filterByGenre,
	fetchAndStoreVideos,
	getStream
} = require('./lib/highlights');

loadData();

const manifest = {
	id: 'extra.time',
	version: '0.0.1',
	catalogs: [
		{
			type: 'sports',
			id: 'extraTimeCatalog',
			name: 'Football',
			extra: [{ name: 'genre', isRequired: false, options: genres }]
		}
	],
	resources: ['catalog', 'stream', 'meta'],
	types: ['sports'],
	name: 'Extra Time',
	description: 'Watch highlights and goals of the latest matches.',
	background:
		'https://images.pexels.com/photos/61143/pexels-photo-61143.jpeg?auto=compress&cs=tinysrgb&dpr=3&h=750&w=1260',
	logo:
		'https://creazilla-store.fra1.digitaloceanspaces.com/silhouettes/2488/female-soccer-player-silhouette-4bb7ee-md.png'
};
const builder = new addonBuilder(manifest);

builder.defineCatalogHandler(({ extra }) => {
	const resolve = async () => {
		await loadData();
		const result = filterByGenre(await toMetas(data()), extra.genre);
		return Promise.resolve({ metas: result });
	};
	return resolve();
});

builder.defineMetaHandler(({ id }) => {
	const object = getObject(id);
	fetchAndStoreVideos(object);

	const resolve = async () => {
		const result = await toMeta(object, true);
		return Promise.resolve({ meta: result });
	};
	return resolve();
});

builder.defineStreamHandler(({ id }) => {
	return getStream(id)
		.then(stream => {
			if (stream.youtubeId) {
				return {
					streams: [
						{
							ytId: stream.youtubeId,
							thumbnail: stream.thumbnail
						}
					]
				};
			}
			return {
				streams: [
					{
						externalUrl: stream.embedUrl,
						title: 'Highlights',
						behaviorHints: { notWebReady: true }
					}
				]
			};
		})
		.catch(() => ({ streams: [] }));
});

module.exports = builder.getInterface();
