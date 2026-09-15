(() => {
  globalThis.SubtitlePocketLayout = host => {
    const sheet = document.createElement('style');
    sheet.id = 'subtitle-pocket-layout-style';
    sheet.textContent = `
      [data-subtitle-pocket-player]{position:fixed!important;left:var(--sp-player-left)!important;top:var(--sp-player-top)!important;right:auto!important;bottom:auto!important;width:var(--sp-player-width)!important;height:var(--sp-player-height)!important;max-width:none!important;max-height:none!important;min-width:0!important;min-height:0!important;margin:0!important;box-sizing:border-box!important;contain:layout paint!important;overflow:hidden!important}
      [data-subtitle-pocket-player] video{width:100%!important;height:100%!important;max-width:100%!important;max-height:100%!important;object-fit:contain!important}
      [data-subtitle-pocket-player] .watch-video--player-view{width:100%!important;height:100%!important;max-width:100%!important}
    `;
    const modes = ['right', 'left', 'top', 'bottom', 'floating'];
    const defaults = { panelPosition: 'right', panelOpacity: 78, panelFloatPosition: { x: 1, y: .15 }, panelDockWidth: null, panelDockHeight: null, panelFloatSize: { width: 400, height: 760 } };
    const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
    const fraction = (n, fallback) => typeof n === 'number' && Number.isFinite(n) ? clamp(n, 0, 1) : fallback;
    const properties = ['--sp-player-left', '--sp-player-top', '--sp-player-width', '--sp-player-height'];
    let settings = { ...defaults }, surface = null, previousAttribute = null, previous = {}, active = false, collapsed = false, region = null, dragging = null, resizing = null, collapsePanel = () => {};
    const $ = id => host.shadowRoot.getElementById(id);
    function restoreSurface() {
      if (surface) {
        if (previousAttribute === null) surface.removeAttribute('data-subtitle-pocket-player');
        else surface.setAttribute('data-subtitle-pocket-player', previousAttribute);
        for (const key of properties) {
          const old = previous[key];
          if (old.value) surface.style.setProperty(key, old.value, old.priority);
          else surface.style.removeProperty(key);
        }
      }
      surface = null; sheet.remove();
    }
    function restore() { restoreSurface(); document.documentElement.removeAttribute('data-subtitle-pocket-split'); }
    function findSurface() {
      const video = document.querySelector('video');
      if (!video) return null;
      const preferred = video.closest('.watch-video') || video.closest('.watch-video--player-view');
      if (preferred && preferred !== document.fullscreenElement) return preferred;
      const related = [video, ...document.querySelectorAll('.player-timedtext, .watch-video--bottom-controls-container')];
      let parent = video.parentElement;
      while (parent && !related.every(el => parent.contains(el))) parent = parent.parentElement;
      if (parent === document.documentElement) parent = document.body;
      if (parent === document.fullscreenElement) {
        const nested = video.closest('.watch-video--player-view');
        if (nested && nested !== parent) return nested;
      }
      return parent;
    }
    function applySettings(values) {
      if ('panelPosition' in values) settings.panelPosition = modes.includes(values.panelPosition) ? values.panelPosition : defaults.panelPosition;
      if ('panelOpacity' in values) settings.panelOpacity = typeof values.panelOpacity === 'number' && Number.isFinite(values.panelOpacity) ? clamp(values.panelOpacity, 25, 95) : defaults.panelOpacity;
      if ('panelFloatPosition' in values) settings.panelFloatPosition = { x: fraction(values.panelFloatPosition?.x, 1), y: fraction(values.panelFloatPosition?.y, .15) };
      for (const key of ['panelDockWidth', 'panelDockHeight']) if (key in values) settings[key] = Number.isFinite(values[key]) && values[key] >= 100 ? Math.min(4000, values[key]) : null;
      if ('panelFloatSize' in values) settings.panelFloatSize = { width: Number.isFinite(values.panelFloatSize?.width) ? clamp(values.panelFloatSize.width, 220, 4000) : 400, height: Number.isFinite(values.panelFloatSize?.height) ? clamp(values.panelFloatSize.height, 200, 4000) : 760 };
      update();
    }
    async function save(values) {
      try { await chrome.storage.local.set(values); if ($('layout-feedback')) $('layout-feedback').textContent = ''; }
      catch { if ($('layout-feedback')) $('layout-feedback').textContent = '版面設定未儲存，請重試。'; }
    }
    function update(nextActive = active, nextCollapsed = collapsed) {
      active = nextActive; collapsed = nextCollapsed;
      const mode = settings.panelPosition, floating = mode === 'floating', horizontal = mode === 'top' || mode === 'bottom';
      if (region) {
        region.dataset.layout = mode; region.classList.toggle('horizontal', horizontal); region.classList.toggle('collapsed', collapsed);
        region.classList.toggle('dragging', !!dragging?.moved);
        for (const grip of region.querySelectorAll('[data-resize]')) grip.hidden = collapsed || !(floating || ({ right: 'w', left: 'e', top: 's', bottom: 'n' }[mode] === grip.dataset.resize));
        $('floating-tools').hidden = !floating;
        $('panel-opacity').value = settings.panelOpacity;
        $('opacity-value').textContent = settings.panelOpacity + '%';
        $('transcript-toggle').textContent = horizontal || floating ? '展開逐字稿' : mode === 'left' ? '逐字稿 ›' : '逐字稿 ‹';
        $('transcript-close').textContent = { right: '收合 ›', left: '收合 ‹', top: '收合 ↑', bottom: '收合 ↓', floating: '收合' }[mode];
      }
      if (!active) { restore(); return; }
      const width = collapsed ? 44 : Math.round(Math.min(settings.panelDockWidth || Math.min(400, Math.max(280, innerWidth * .3)), innerWidth * .75));
      const height = collapsed ? 44 : Math.round(Math.min(settings.panelDockHeight || Math.min(Math.max(300, innerHeight * .45), 480), innerHeight * .75));
      const floatWidth = Math.min(settings.panelFloatSize.width, Math.max(120, innerWidth - 24)), floatHeight = Math.min(settings.panelFloatSize.height, Math.max(100, innerHeight - 24));
      const panelWidth = floating ? (collapsed ? Math.min(150, floatWidth) : floatWidth) : horizontal ? innerWidth : width;
      const panelHeight = floating ? (collapsed ? 44 : floatHeight) : horizontal ? height : innerHeight;
      const left = floating ? 12 + (innerWidth - panelWidth - 24) * settings.panelFloatPosition.x : mode === 'right' ? innerWidth - width : 0;
      const top = floating ? 12 + (innerHeight - panelHeight - 24) * settings.panelFloatPosition.y : mode === 'bottom' ? innerHeight - height : 0;
      if (region) {
        Object.assign(region.style, { left: Math.max(0, left) + 'px', top: Math.max(0, top) + 'px', right: 'auto', bottom: 'auto', width: panelWidth + 'px', height: panelHeight + 'px' });
        region.style.setProperty('--panel-alpha', settings.panelOpacity / 100);
      }
      // Floating mode leaves the native player geometry untouched; fullscreen still includes the panel.
      if (floating) restoreSurface();
      else {
        const next = findSurface();
        if (!next) { restore(); return; }
        if (surface !== next) {
          restoreSurface(); surface = next; previousAttribute = surface.getAttribute('data-subtitle-pocket-player');
          previous = Object.fromEntries(properties.map(key => [key, { value: surface.style.getPropertyValue(key), priority: surface.style.getPropertyPriority(key) }]));
          surface.setAttribute('data-subtitle-pocket-player', '');
        }
        if (!sheet.isConnected) document.documentElement.append(sheet);
        const values = [mode === 'left' ? width : 0, mode === 'top' ? height : 0, innerWidth - (horizontal ? 0 : width), innerHeight - (horizontal ? height : 0)];
        properties.forEach((key, i) => { const value = values[i] + 'px'; if (surface.style.getPropertyValue(key) !== value) surface.style.setProperty(key, value); });
      }
      document.documentElement.setAttribute('data-subtitle-pocket-split', '');
    }
    function attach(element, onCollapse) {
      region = element; collapsePanel = onCollapse;
      $('panel-opacity').oninput = () => applySettings({ panelOpacity: Number($('panel-opacity').value) });
      $('panel-opacity').onchange = () => save({ panelOpacity: settings.panelOpacity });
      const move = (x, y) => applySettings({ panelFloatPosition: { x, y } });
      const handle = $('panel-drag');
      const preview = document.createElement('div'); preview.id = 'dock-preview'; preview.hidden = true; host.shadowRoot.append(preview);
      const edgeAt = (x, y) => {
        const distances = [['left', x], ['right', innerWidth - x], ['top', y], ['bottom', innerHeight - y]].sort((a, b) => a[1] - b[1]);
        return distances[0][1] <= 36 ? distances[0][0] : null;
      };
      const hint = edge => {
        preview.hidden = !edge;
        if (!edge) return;
        preview.textContent = '放開以停靠' + { left: '左側', right: '右側', top: '上方', bottom: '下方' }[edge];
        Object.assign(preview.style, { left: edge === 'right' ? Math.max(0, innerWidth - 180) + 'px' : '0', top: edge === 'bottom' ? Math.max(0, innerHeight - 100) + 'px' : '0', width: ['left', 'right'].includes(edge) ? '180px' : '100vw', height: ['top', 'bottom'].includes(edge) ? '100px' : '100vh' });
      };
      handle.onpointerdown = event => {
        if (event.button !== 0) return;
        event.preventDefault(); handle.setPointerCapture(event.pointerId);
        const handleBox = handle.getBoundingClientRect();
        dragging = { id: event.pointerId, x: event.clientX, y: event.clientY, offsetX: event.clientX - handleBox.left + 18, offsetY: event.clientY - handleBox.top + 36, moved: false, edge: null, original: { panelPosition: settings.panelPosition, panelFloatPosition: { ...settings.panelFloatPosition } } };
      };
      handle.onpointermove = event => {
        if (!dragging || event.pointerId !== dragging.id) return;
        if (!dragging.moved && Math.hypot(event.clientX - dragging.x, event.clientY - dragging.y) < 5) return;
        if (!dragging.moved) {
          dragging.moved = true; applySettings({ panelPosition: 'floating' });
          const box = handle.getBoundingClientRect(), panel = region.getBoundingClientRect();
          dragging.offsetX = box.left - panel.left + box.width / 2;
          dragging.offsetY = box.top - panel.top + box.height / 2;
        }
        const box = region.getBoundingClientRect();
        move((event.clientX - dragging.offsetX - 12) / Math.max(1, innerWidth - box.width - 24), (event.clientY - dragging.offsetY - 12) / Math.max(1, innerHeight - box.height - 24));
        dragging.edge = edgeAt(event.clientX, event.clientY); hint(dragging.edge);
      };
      const finish = cancel => {
        if (!dragging) return;
        const drag = dragging; dragging = null; hint(null);
        if (cancel) applySettings(drag.original);
        else if (drag.moved) { applySettings({ panelPosition: drag.edge || 'floating' }); save({ panelPosition: settings.panelPosition, panelFloatPosition: settings.panelFloatPosition }); }
        update();
      };
      handle.onpointerup = () => finish(false); handle.onpointercancel = () => finish(true); handle.onlostpointercapture = () => finish(true);
      handle.onkeydown = event => {
        if (event.key === 'Escape') { event.preventDefault(); finish(true); return; }
        const delta = { ArrowLeft: [-.04, 0], ArrowRight: [.04, 0], ArrowUp: [0, -.04], ArrowDown: [0, .04] }[event.key];
        if (!delta) return;
        event.preventDefault(); event.stopPropagation();
        applySettings({ panelPosition: event.shiftKey ? { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'top', ArrowDown: 'bottom' }[event.key] : 'floating' });
        if (!event.shiftKey) move(settings.panelFloatPosition.x + delta[0], settings.panelFloatPosition.y + delta[1]);
        save({ panelPosition: settings.panelPosition, panelFloatPosition: settings.panelFloatPosition });
      };
      const sizeSettings = () => ({ panelDockWidth: settings.panelDockWidth, panelDockHeight: settings.panelDockHeight, panelFloatSize: { ...settings.panelFloatSize }, panelFloatPosition: { ...settings.panelFloatPosition } });
      for (const edge of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) {
        const grip = document.createElement('div'); grip.className = 'panel-resize resize-' + edge; grip.dataset.resize = edge; grip.tabIndex = 0; grip.setAttribute('role', 'separator'); grip.setAttribute('aria-label', '調整面板大小 ' + edge); grip.title = '拖曳調整大小，拖至太小會收合；也可用方向鍵調整'; region.append(grip);
        grip.onpointerdown = event => {
          if (event.button !== 0) return;
          event.preventDefault(); grip.setPointerCapture(event.pointerId);
          const box = region.getBoundingClientRect();
          resizing = { id: event.pointerId, x: event.clientX, y: event.clientY, edge, box, original: sizeSettings(), small: false };
        };
        const resize = (dx, dy) => {
          const r = resizing, mode = settings.panelPosition;
          if (!r) return;
          const w = r.box.width + (edge.includes('w') ? -dx : edge.includes('e') ? dx : 0);
          const h = r.box.height + (edge.includes('n') ? -dy : edge.includes('s') ? dy : 0);
          r.small = mode === 'floating' ? w < 220 || h < 200 : ['left', 'right'].includes(mode) ? w < 180 : h < 140;
          if (mode === 'floating') {
            const width = clamp(w, 220, Math.max(220, innerWidth - 24)), height = clamp(h, 200, Math.max(200, innerHeight - 24));
            const left = edge.includes('w') ? r.box.right - width : r.box.left;
            const top = edge.includes('n') ? r.box.bottom - height : r.box.top;
            applySettings({ panelFloatSize: { width, height }, panelFloatPosition: { x: (left - 12) / Math.max(1, innerWidth - width - 24), y: (top - 12) / Math.max(1, innerHeight - height - 24) } });
          } else applySettings(['left', 'right'].includes(mode) ? { panelDockWidth: clamp(w, 180, innerWidth * .75) } : { panelDockHeight: clamp(h, 140, innerHeight * .75) });
          $('layout-feedback').textContent = r.small ? '放開即收合面板' : '';
        };
        grip.onpointermove = event => { if (resizing?.id === event.pointerId) resize(event.clientX - resizing.x, event.clientY - resizing.y); };
        const endResize = cancel => {
          if (!resizing) return;
          const r = resizing; resizing = null; $('layout-feedback').textContent = '';
          if (cancel || r.small) applySettings(r.original);
          if (!cancel && r.small) collapsePanel(true);
          else if (!cancel) save(sizeSettings());
        };
        grip.onpointerup = () => endResize(false); grip.onpointercancel = () => endResize(true); grip.onlostpointercapture = () => endResize(true);
        grip.onkeydown = event => {
          if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
          event.preventDefault(); event.stopPropagation();
          resizing = { edge, box: region.getBoundingClientRect(), original: sizeSettings(), small: false };
          resize(event.key === 'ArrowLeft' ? -20 : event.key === 'ArrowRight' ? 20 : 0, event.key === 'ArrowUp' ? -20 : event.key === 'ArrowDown' ? 20 : 0); endResize(false);
        };
      }
      $('panel-reset').onclick = () => { applySettings({ panelFloatPosition: defaults.panelFloatPosition }); save({ panelFloatPosition: settings.panelFloatPosition }); };
      update();
    }
    // Apply stored preferences to every Netflix tab; per-field writes avoid overwriting other preferences.
    chrome.storage.local.get(defaults).then(applySettings).catch(() => {});
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      const values = Object.fromEntries(Object.keys(defaults).filter(key => key in changes).map(key => [key, changes[key].newValue]));
      if (Object.keys(values).length) applySettings(values);
    });
    window.addEventListener('resize', () => { dragging = null; resizing = null; if ($('dock-preview')) $('dock-preview').hidden = true; update(); });
    return { attach, update, restore: () => { active = false; restore(); }, bounds: () => surface?.getBoundingClientRect() };
  };
})();
