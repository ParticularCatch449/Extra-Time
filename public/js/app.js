(function () {
	const app = document.getElementById('app');
	const loading = document.getElementById('loading');
	const toast = document.getElementById('toast');

	let config = null;
	let genres = [];
	let currentGenre = '';

	function showToast(message) {
		toast.textContent = message;
		toast.classList.remove('hidden');
		clearTimeout(showToast._timer);
		showToast._timer = setTimeout(() => toast.classList.add('hidden'), 2500);
	}

	function formatDate(dateStr) {
		const d = new Date(dateStr);
		return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
	}

	async function fetchJson(url) {
		const res = await fetch(url);
		if (!res.ok) throw new Error('Request failed');
		return res.json();
	}

	function getWatchId() {
		const match = window.location.pathname.match(/^\/watch\/(.+)$/);
		return match ? decodeURIComponent(match[1]) : null;
	}

	function navigate(path) {
		history.pushState(null, '', path);
		render();
	}

	function setupStremioActions(root) {
		const manifestUrl = config.manifestUrl;
		const deepLink = config.stremioDeepLink;

		root.querySelectorAll('#stremio-open, .stremio-open-link').forEach(link => {
			link.href = deepLink;
		});

		root.querySelectorAll('#copy-manifest, .copy-manifest-btn').forEach(btn => {
			btn.addEventListener('click', async () => {
				try {
					await navigator.clipboard.writeText(manifestUrl);
					showToast('Manifest URL copied');
				} catch {
					showToast('Copy failed — select the URL manually');
				}
			});
		});

		const display = root.querySelector('#manifest-display');
		if (display) display.textContent = manifestUrl;
	}

	function renderCard(highlight, template) {
		const node = template.content.cloneNode(true);
		const link = node.querySelector('.card-link');
		const thumb = node.querySelector('.card-thumb');
		const title = node.querySelector('.card-title');
		const meta = node.querySelector('.card-meta');

		link.href = `/watch/${encodeURIComponent(highlight.id)}`;
		link.addEventListener('click', e => {
			e.preventDefault();
			navigate(link.href);
		});

		thumb.src = highlight.thumbnail;
		thumb.alt = highlight.title;
		title.textContent = highlight.title;
		meta.textContent = `${highlight.competition} · ${formatDate(highlight.date)}`;

		return node;
	}

	async function renderHome() {
		const tpl = document.getElementById('home-template');
		app.innerHTML = '';
		app.appendChild(tpl.content.cloneNode(true));
		setupStremioActions(app);

		const select = document.getElementById('genre-filter');
		genres.forEach(g => {
			const opt = document.createElement('option');
			opt.value = g;
			opt.textContent = g;
			if (g === currentGenre) opt.selected = true;
			select.appendChild(opt);
		});

		select.addEventListener('change', () => {
			currentGenre = select.value;
			loadGrid();
		});

		await loadGrid();
	}

	async function loadGrid() {
		const grid = document.getElementById('highlights-grid');
		const empty = document.getElementById('empty-state');
		const cardTpl = document.getElementById('card-template');

		grid.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';

		const url = currentGenre
			? `/api/highlights?genre=${encodeURIComponent(currentGenre)}`
			: '/api/highlights';

		const { highlights } = await fetchJson(url);
		grid.innerHTML = '';

		if (!highlights.length) {
			empty.classList.remove('hidden');
			return;
		}

		empty.classList.add('hidden');
		highlights.forEach(h => grid.appendChild(renderCard(h, cardTpl)));
	}

	async function loadStream(videoId, player, playerLoading) {
		player.classList.add('hidden');
		playerLoading.classList.remove('hidden');
		player.src = '';

		try {
			const stream = await fetchJson(`/api/stream/${encodeURIComponent(videoId)}`);
			player.src = stream.embedUrl;
			player.classList.remove('hidden');
			playerLoading.classList.add('hidden');
		} catch {
			playerLoading.innerHTML = '<p>Could not load stream. Try another clip or install on Stremio.</p>';
		}
	}

	async function renderWatch(id) {
		const tpl = document.getElementById('watch-template');
		app.innerHTML = '';
		app.appendChild(tpl.content.cloneNode(true));
		setupStremioActions(app);

		const highlight = await fetchJson(`/api/highlights/${encodeURIComponent(id)}`);
		const header = document.getElementById('watch-header');
		const clips = document.getElementById('video-clips');
		const player = document.getElementById('player');
		const playerLoading = document.getElementById('player-loading');

		header.innerHTML = `
			<h1>${escapeHtml(highlight.title)}</h1>
			<p>${escapeHtml(highlight.description)}</p>
		`;

		const videos = highlight.videos || [];
		if (!videos.length) {
			playerLoading.innerHTML = '<p>No videos available for this match.</p>';
			return;
		}

		let activeId = videos[0].id;

		videos.forEach(video => {
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 'clip-btn' + (video.id === activeId ? ' active' : '');
			btn.textContent = video.title;
			btn.addEventListener('click', () => {
				activeId = video.id;
				clips.querySelectorAll('.clip-btn').forEach(b => b.classList.remove('active'));
				btn.classList.add('active');
				loadStream(video.id, player, playerLoading);
			});
			clips.appendChild(btn);
		});

		await loadStream(activeId, player, playerLoading);
	}

	function escapeHtml(str) {
		const div = document.createElement('div');
		div.textContent = str;
		return div.innerHTML;
	}

	async function render() {
		loading.classList.remove('hidden');

		try {
			const watchId = getWatchId();
			if (watchId) {
				await renderWatch(watchId);
			} else {
				await renderHome();
			}
		} catch (err) {
			app.innerHTML = `<div class="loading-state"><p>Something went wrong. <a href="/" data-nav>Try again</a></p></div>`;
			console.error(err);
		}

		loading.classList.add('hidden');
	}

	document.addEventListener('click', e => {
		const nav = e.target.closest('[data-nav]');
		if (nav) {
			e.preventDefault();
			navigate(nav.getAttribute('href') || '/');
		}
	});

	window.addEventListener('popstate', render);

	async function init() {
		const [configData, genresData] = await Promise.all([
			fetchJson('/api/config'),
			fetchJson('/api/genres')
		]);
		config = configData;
		genres = genresData.genres;
		await render();
	}

	init();
})();
