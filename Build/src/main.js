(function () {
  'use strict';

  // Backend proxy URL - Cloudflare Worker
  const API_BASE = 'https://lrcgetter-backend.neeljaiswal23.workers.dev/api';

  // DOM helpers
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // State
  let currentChallenge = null;
  let solverWorking = false;
  let solverCancel = false;

  // Navigation
  $$('.nav-link[data-view]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const view = link.dataset.view;

      $$('.nav-link').forEach(l => l.classList.remove('active'));
      link.classList.add('active');

      $$('.view').forEach(v => v.classList.remove('active'));
      $(`#view-${view}`).classList.add('active');
    });
  });

  // Tabs in Get view
  $$('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;

      $$('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      $$('.tab-content').forEach(tc => tc.classList.remove('active'));
      $(`#tab-${tabName}`).classList.add('active');
    });
  });

  // API helpers
  async function apiFetch(endpoint, options = {}) {
    const url = API_BASE + endpoint;
    const headers = {
      'Accept': 'application/json',
      ...options.headers
    };

    let res;
    try {
      res = await fetch(url, { ...options, headers });
    } catch (networkError) {
      console.error('Network error:', networkError);
      throw { status: 0, data: { message: 'Network error - check your connection or the API may be down' } };
    }

    const text = await res.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text || 'Unknown error' };
    }

    if (!res.ok) {
      throw { status: res.status, data };
    }

    return data;
  }

  function buildQueryString(params) {
    return Object.entries(params)
      .filter(([_, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
  }

  // UI helpers
  function showLoading(container) {
    container.innerHTML = `
      <div class="loading">
        <div class="spinner"></div>
        <span>Loading...</span>
      </div>
    `;
  }

  function showError(container, message) {
    container.innerHTML = `<div class="message error">${escapeHtml(message)}</div>`;
  }

  function showSuccess(container, message) {
    container.innerHTML = `<div class="message success">${escapeHtml(message)}</div>`;
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  function formatDuration(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function getErrorMessage(err) {
    if (err.data?.message) return err.data.message;
    if (err.data?.error) return err.data.error;
    if (typeof err.data === 'string' && err.data) return err.data;
    if (err.message) return err.message;
    if (err.status) return `HTTP Error ${err.status}`;
    return 'An unknown error occurred';
  }

  function renderLyrics(data, container) {
    if (!data) {
      showError(container, 'No lyrics found');
      return;
    }

    const hasSynced = data.syncedLyrics && data.syncedLyrics.trim();
    const hasPlain = data.plainLyrics && data.plainLyrics.trim();

    let syncedHtml = '';
    if (hasSynced) {
      const lines = data.syncedLyrics.split('\n').filter(l => l.trim());
      syncedHtml = lines.map(line => {
        const match = line.match(/^\[(\d{2}:\d{2}\.\d{2})\]\s*(.*)$/);
        if (match) {
          return `<div class="synced-line"><span class="timestamp">[${match[1]}]</span><span>${escapeHtml(match[2])}</span></div>`;
        }
        return `<div>${escapeHtml(line)}</div>`;
      }).join('');
    }

    const plainHtml = hasPlain ? `<pre>${escapeHtml(data.plainLyrics)}</pre>` : '<p class="muted">No plain lyrics available</p>';

    container.innerHTML = `
      <div class="lyrics-display">
        <div class="lyrics-header">
          <h2>${escapeHtml(data.trackName)}</h2>
          <p>${escapeHtml(data.artistName)} — ${escapeHtml(data.albumName)}</p>
          <div class="result-meta" style="margin-top: 12px;">
            <span class="result-badge">${formatDuration(data.duration)}</span>
            ${hasSynced ? '<span class="result-badge synced">Synced</span>' : ''}
            ${data.instrumental ? '<span class="result-badge instrumental">Instrumental</span>' : ''}
            <span class="result-badge">ID: ${data.id}</span>
          </div>
        </div>
        <div class="lyrics-tabs">
          <button class="lyrics-tab ${hasSynced ? 'active' : ''}" data-lyrics="synced" ${!hasSynced ? 'disabled' : ''}>Synchronized</button>
          <button class="lyrics-tab ${!hasSynced ? 'active' : ''}" data-lyrics="plain">Plain</button>
        </div>
        <div class="lyrics-content">
          <div id="lyrics-synced" ${!hasSynced ? 'style="display: none"' : ''}>${syncedHtml || '<p class="muted">No synchronized lyrics available</p>'}</div>
          <div id="lyrics-plain" ${hasSynced ? 'style="display: none"' : ''}>${plainHtml}</div>
        </div>
      </div>
    `;

    container.querySelectorAll('.lyrics-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        if (tab.disabled) return;
        container.querySelectorAll('.lyrics-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        const type = tab.dataset.lyrics;
        container.querySelector('#lyrics-synced').style.display = type === 'synced' ? 'block' : 'none';
        container.querySelector('#lyrics-plain').style.display = type === 'plain' ? 'block' : 'none';
      });
    });
  }

  function renderSearchResults(results, container) {
    if (!results || results.length === 0) {
      container.innerHTML = '<div class="message info">No results found. Try different search terms.</div>';
      return;
    }

    container.innerHTML = results.map(item => {
      const hasSynced = item.syncedLyrics && item.syncedLyrics.trim();
      return `
        <div class="result-card" data-id="${item.id}">
          <div class="result-header">
            <div>
              <div class="result-title">${escapeHtml(item.trackName)}</div>
              <div class="result-artist">${escapeHtml(item.artistName)}</div>
            </div>
            <div class="result-meta">
              <span class="result-badge">${formatDuration(item.duration)}</span>
              ${hasSynced ? '<span class="result-badge synced">Synced</span>' : ''}
              ${item.instrumental ? '<span class="result-badge instrumental">Instrumental</span>' : ''}
            </div>
          </div>
          <div class="result-album">${escapeHtml(item.albumName)}</div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.result-card').forEach(card => {
      card.addEventListener('click', async () => {
        const id = card.dataset.id;
        showLoading(container);
        try {
          const data = await apiFetch(`/get/${id}`);
          renderLyrics(data, container);
        } catch (err) {
          showError(container, getErrorMessage(err));
        }
      });
    });
  }

  // Search form
  $('#form-search').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);
    const params = Object.fromEntries(formData.entries());

    if (!params.q && !params.track_name) {
      showError($('#search-results'), 'Please provide at least a search query or track name');
      return;
    }

    const container = $('#search-results');
    showLoading(container);

    try {
      const qs = buildQueryString(params);
      const data = await apiFetch(`/search?${qs}`);
      renderSearchResults(data, container);
    } catch (err) {
      console.error('Search error:', err);
      showError(container, getErrorMessage(err));
    }
  });

  // Get by signature form
  $('#form-get-signature').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);
    const params = Object.fromEntries(formData.entries());
    const cached = params.cached;
    delete params.cached;

    const container = $('#get-results');
    showLoading(container);

    try {
      const endpoint = cached ? '/get-cached' : '/get';
      const qs = buildQueryString(params);
      const data = await apiFetch(`${endpoint}?${qs}`);
      renderLyrics(data, container);
    } catch (err) {
      if (err.status === 404) {
        showError(container, 'Track not found. Make sure all fields match exactly, including duration (±2 seconds).');
      } else {
        showError(container, getErrorMessage(err));
      }
    }
  });

  // Get by ID form
  $('#form-get-id').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = new FormData(e.target).get('id').trim();

    const container = $('#get-results');
    showLoading(container);

    try {
      const data = await apiFetch(`/get/${encodeURIComponent(id)}`);
      renderLyrics(data, container);
    } catch (err) {
      if (err.status === 404) {
        showError(container, 'Lyrics not found with this ID.');
      } else {
        showError(container, getErrorMessage(err));
      }
    }
  });

  // Publish - Challenge
  $('#btn-challenge').addEventListener('click', async () => {
    const status = $('#challenge-status');
    status.className = 'challenge-status working';
    status.textContent = 'Requesting challenge...';

    try {
      const data = await apiFetch('/request-challenge', { method: 'POST' });
      currentChallenge = data;
      $('#pub-prefix').value = data.prefix;
      $('#pub-nonce').value = '';
      $('#btn-solve').disabled = false;
      status.className = 'challenge-status success';
      status.textContent = `Challenge received! Prefix: ${data.prefix.substring(0, 16)}...Target: ${data.target.substring(0, 16)}...`;
    } catch (err) {
      status.className = 'challenge-status error';
      status.textContent = 'Failed to get challenge:  ' + getErrorMessage(err);
    }
  });

  // SHA-256 helper
  async function sha256Hex(str) {
    const data = new TextEncoder().encode(str);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Proof of work solver
  async function solvePow(prefix, target, onProgress) {
    let nonce = 0;
    const batchSize = 2048;
    const startTime = Date.now();

    while (!solverCancel) {
      for (let i = 0; i < batchSize && !solverCancel; i++) {
        const input = `${prefix}: ${nonce}`;
        const hash = await sha256Hex(input);

        if (hash < target.toLowerCase()) {
          return { nonce: String(nonce), hash, attempts: nonce + 1, time: Date.now() - startTime };
        }
        nonce++;
      }

      if (onProgress) {
        onProgress(nonce, Date.now() - startTime);
      }

      // Yield to UI
      await new Promise(r => setTimeout(r, 0));
    }

    throw new Error('Cancelled');
  }

  // Solve button
  $('#btn-solve').addEventListener('click', async () => {
    if (!currentChallenge) {
      $('#challenge-status').textContent = 'Please request a challenge first';
      return;
    }

    solverCancel = false;
    solverWorking = true;
    $('#btn-solve').disabled = true;
    $('#btn-cancel').disabled = false;

    const status = $('#challenge-status');
    status.className = 'challenge-status working';

    try {
      const result = await solvePow(
        currentChallenge.prefix,
        currentChallenge.target,
        (attempts, time) => {
          const rate = Math.round(attempts / (time / 1000));
          status.textContent = `Solving...${attempts.toLocaleString()} attempts (${rate.toLocaleString()} H/s)`;
        }
      );

      $('#pub-nonce').value = result.nonce;
      status.className = 'challenge-status success';
      status.textContent = `Solved! Nonce: ${result.nonce} (${result.attempts.toLocaleString()} attempts in ${(result.time / 1000).toFixed(1)}s)`;
    } catch (err) {
      status.className = 'challenge-status error';
      status.textContent = err.message === 'Cancelled' ? 'Solver cancelled' : `Solver error: ${err.message}`;
    } finally {
      solverWorking = false;
      $('#btn-solve').disabled = false;
      $('#btn-cancel').disabled = true;
    }
  });

  // Cancel button
  $('#btn-cancel').addEventListener('click', () => {
    solverCancel = true;
  });

  // Publish form
  $('#form-publish').addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());

    const prefix = data.prefix;
    const nonce = data.nonce;

    if (!prefix || !nonce) {
      showError($('#publish-results'), 'Please request and solve a challenge first');
      return;
    }

    const token = `${prefix}:${nonce}`;
    const body = {
      trackName: data.trackName,
      artistName: data.artistName,
      albumName: data.albumName,
      duration: parseInt(data.duration, 10),
      plainLyrics: data.plainLyrics || '',
      syncedLyrics: data.syncedLyrics || ''
    };

    const container = $('#publish-results');
    showLoading(container);

    try {
      await apiFetch('/publish', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Publish-Token': token
        },
        body: JSON.stringify(body)
      });

      showSuccess(container, 'Lyrics published successfully!');

      // Reset challenge
      currentChallenge = null;
      $('#pub-prefix').value = '';
      $('#pub-nonce').value = '';
      $('#btn-solve').disabled = true;
      $('#challenge-status').textContent = '';
    } catch (err) {
      showError(container, getErrorMessage(err));
    }
  });

  // Init
  console.log('LRCGetter Frontend loaded');
})();