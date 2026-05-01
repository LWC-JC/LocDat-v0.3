// ===== Screen: Soil Borehole =====
async function screenSoilBorehole(boreId) {
  clearApp();
  const bore = await dbGet('soilBoreholes', boreId);
  const loc = await dbGet('locations', bore.locationId);
  const proj = await dbGet('projects', loc.projectId);

  $app().appendChild(header({ title: `Soil Bore ${bore.boreholeId}`, breadcrumb: proj.projectName, subtitle: loc.locationId }));
  const content = el('div', { class: 'content' });
  content.appendChild(el('div', { class: 'row', style: 'justify-content:flex-end' }, [
    el('button', { class: 'btn btn-danger btn-small', onclick: async () => {
      if (await confirmDialog(`Are you sure you want to delete ${bore.boreholeId}? This removes all lithology layers, samples, field measurements and photos for this bore.`, 'Delete soil bore', 'Delete', 'Cancel')) {
        await cascadeDeleteBorehole(boreId);
        setDirty(false);
        toast('Soil bore deleted');
        navBack();
      }
    }}, 'Delete Soil Borehole')
  ]));

  content.appendChild(formRow('Soil Borehole ID:', textInput('bore-id', bore.boreholeId)));

  const drillDateI = textInput('bore-date', bore.drillDate || '');
  const todayBtn = el('button', { class: 'btn btn-small', onclick: () => { drillDateI.value = todayStr(); setDirty(); }}, 'Today');
  content.appendChild(el('div', { class: 'form-field' }, [
    el('label', {}, 'Drill Date:'),
    el('div', { class: 'field-group' }, [drillDateI, todayBtn])
  ]));

  content.appendChild(formRow('Driller:', textInput('bore-driller', bore.driller || '')));
  content.appendChild(formRow('Drilling Method:', textInput('bore-method', bore.drillingMethod || '')));
  content.appendChild(formRow('Logger:', textInput('bore-logger', bore.logger || '')));
  content.appendChild(formRow('Total Depth (m):', depthInputWithButtons('bore-depth', bore.totalDepth ?? '')));

  content.appendChild(photoPreviewUI(`bore:${boreId}`, loc.projectId, `${loc.locationId}_${bore.boreholeId}`, 'Soil Borehole Photo'));

  content.appendChild(el('div', { class: 'form-field vertical' }, [
    el('label', {}, 'Soil Bore Notes:'),
    textArea('bore-notes', bore.notes || '')
  ]));

  content.appendChild(saveBar(async () => {
    bore.boreholeId = getVal('bore-id').trim() || bore.boreholeId;
    bore.drillDate = drillDateI.value;
    bore.driller = getVal('bore-driller');
    bore.drillingMethod = getVal('bore-method');
    bore.logger = getVal('bore-logger');
    bore.totalDepth = parseFloat(getVal('bore-depth')) || null;
    bore.notes = getVal('bore-notes');
    bore.updatedAt = new Date().toISOString();
    await dbPut('soilBoreholes', bore);
  }));

  content.appendChild(el('div', { style: 'text-align:center; margin:20px 0' }, [
    el('button', { class: 'btn btn-save', onclick: () => navigate(screenBoreholeOverview, boreId) }, 'Log / Sample Borehole'),
    el('div', { style: 'height:10px' }),
    el('button', { class: 'btn', onclick: () => navigate(screenWellConstruction, boreId) }, 'GW Well Construction')
  ]));

  $app().appendChild(content);
}

async function createAndEditBorehole(locId) {
  const settings = await getSettings();
  const prefix = settings.autoIds?.soilBorePrefix || 'SB';
  const existing = await dbGetAllByIndex('soilBoreholes', 'locationId', locId);
  const id = nextAutoId(prefix, existing.map(e => e.boreholeId));
  const obj = {
    locationId: locId,
    boreholeId: id,
    drillDate: todayStr(),
    driller: '',
    drillingMethod: '',
    logger: '',
    totalDepth: null,
    notes: '',
    scaleM: 1,
    intervalM: 0.1,
    createdAt: new Date().toISOString()
  };
  obj.id = await dbAdd('soilBoreholes', obj);
  state.currentBoreholeId = obj.id;
  navigate(screenSoilBorehole, obj.id);
}

// ===== Screen: Borehole Overview (grid) =====
async function screenBoreholeOverview(boreId) {
  clearApp();
  const bore = await dbGet('soilBoreholes', boreId);
  const loc = await dbGet('locations', bore.locationId);
  const proj = await dbGet('projects', loc.projectId);

  state.currentBoreholeId = boreId;

  $app().appendChild(header({ title: 'Borehole Overview', breadcrumb: proj.projectName, subtitle: `${loc.locationId} · ${bore.boreholeId}` }));
  const content = el('div', { class: 'content' });

  // Scale selector
  const scaleSel = selectInput('scale-sel', ['1','2','5','10'], String(bore.scaleM || 1));
  scaleSel.addEventListener('change', async () => {
    bore.scaleM = parseFloat(scaleSel.value);
    await dbPut('soilBoreholes', bore);
    screenBoreholeOverview(boreId);
  });
  const intervalSel = selectInput('int-sel', ['0.05','0.1','0.2','0.25','0.5','1'], String(bore.intervalM || 0.1));
  intervalSel.addEventListener('change', async () => {
    bore.intervalM = parseFloat(intervalSel.value);
    await dbPut('soilBoreholes', bore);
    screenBoreholeOverview(boreId);
  });

  content.appendChild(el('div', { class: 'scale-select' }, [
    el('span', {}, 'Scale (m/page):'), scaleSel,
    el('span', { style: 'margin-left:16px' }, 'Interval (m):'), intervalSel
  ]));

  const liths = await dbGetAllByIndex('soilLithologies', 'boreholeId', boreId);
  const samples = await dbGetAllByIndex('soilBoreSamples', 'boreholeId', boreId);
  const fms = await dbGetAllByIndex('soilBoreFieldMeas', 'boreholeId', boreId);
  const wc = await dbGet('wellConstruction', boreId);
  liths.sort((a, b) => (a.depthFrom || 0) - (b.depthFrom || 0));
  samples.sort((a, b) => (a.depthFrom || 0) - (b.depthFrom || 0));

  const interval = parseFloat(bore.intervalM || 0.1);
  // Compute maximum depth to render: the larger of bore.totalDepth, deepest layer/sample, deepest WC interval
  let maxDepth = parseFloat(bore.totalDepth || 0) || 0;
  for (const l of liths) if ((l.depthTo || 0) > maxDepth) maxDepth = l.depthTo;
  for (const s of samples) if ((s.depthTo || 0) > maxDepth) maxDepth = s.depthTo;
  if (wc) {
    for (const k of ['screenTo', 'sandTo', 'bentoniteTo', 'groutTo', 'backfillTo']) {
      if ((wc[k] || 0) > maxDepth) maxDepth = wc[k];
    }
  }
  if (maxDepth < 1) maxDepth = 1;
  const rowsCount = Math.ceil(maxDepth / interval) + 2;  // +2 for visual padding below total depth

  // Determine if WC column should appear
  const hasWellData = !!(wc && (wc.waterIntersectionDepth || wc.screenFrom != null || wc.screenTo != null || wc.sandFrom != null || wc.sandTo != null || wc.bentoniteFrom != null || wc.bentoniteTo != null || wc.groutFrom != null || wc.groutTo != null || wc.backfillFrom != null || wc.backfillTo != null));

  // Column assignments
  const COLS = { depth: 1, lith: 2, pid: 3, samp: 4, well: 5 };
  const colCount = hasWellData ? 5 : 4;

  // Grid: use fixed row height, custom template
  const grid = el('div', { class: 'borehole-grid' + (hasWellData ? ' with-well' : '') });
  grid.style.gridTemplateColumns = hasWellData ? '54px 1fr 60px 1fr 80px' : '54px 1fr 60px 1fr';
  grid.style.gridTemplateRows = `28px repeat(${rowsCount}, 28px)`;

  // Headers (row 1)
  grid.appendChild(hdrCellAt('Depth', 1, 1));
  grid.appendChild(hdrCellAt('Soil Lithology', 2, 1));
  grid.appendChild(hdrCellAt('PID', 3, 1));
  grid.appendChild(hdrCellAt('Soil Bore Sample', 4, 1));
  if (hasWellData) grid.appendChild(hdrCellAt('GW Well', 5, 1));

  // Per-row: depth labels and PID cells
  for (let i = 0; i < rowsCount; i++) {
    const cssRow = i + 2;
    const top = +(i * interval).toFixed(3);

    const depthCell = el('div', { class: 'depth-cell' }, top.toFixed(2) + 'm');
    depthCell.style.gridRow = String(cssRow);
    depthCell.style.gridColumn = String(COLS.depth);
    grid.appendChild(depthCell);

    const fm = fms.find(f => Math.abs((f.depthFrom || 0) - top) < 1e-6);
    const fmCell = el('div', { class: 'data-cell' + (fm ? ' has-data' : ''), onclick: () => {
      if (fm) navigate(screenSoilBoreFieldMeas, fm.id);
      else createAndEditBoreFieldMeas(boreId, top, +(top + interval).toFixed(3));
    }}, fm ? String(fm.measurement ?? '') : '');
    fmCell.style.gridRow = String(cssRow);
    fmCell.style.gridColumn = String(COLS.pid);
    grid.appendChild(fmCell);
  }

  // Lithology column: render each layer spanning its depth range
  const lithCoveredRows = new Set();
  for (const l of liths) {
    const r0 = Math.round((l.depthFrom || 0) / interval);
    const r1 = Math.max(r0 + 1, Math.round((l.depthTo || 0) / interval));
    for (let ri = r0; ri < r1; ri++) lithCoveredRows.add(ri);
    const cell = el('div', { class: 'lith-cell has-layer', onclick: () => navigate(screenLithology, l.id) }, [
      el('span', {}, summarizeLith(l))
    ]);
    cell.style.gridRow = `${r0 + 2} / ${r1 + 2}`;
    cell.style.gridColumn = String(COLS.lith);
    grid.appendChild(cell);
  }
  // Gaps: empty, clickable to add
  for (let i = 0; i < rowsCount; i++) {
    if (lithCoveredRows.has(i)) continue;
    const top = +(i * interval).toFixed(3);
    const cell = el('div', { class: 'lith-cell empty-lith', onclick: () => createAndEditLithology(boreId, top, +(top + Math.max(0.2, interval)).toFixed(3)) }, '');
    cell.style.gridRow = String(i + 2);
    cell.style.gridColumn = String(COLS.lith);
    grid.appendChild(cell);
  }

  // Sample column: render each Normal sample spanning range; stash FD/ILD at same depth
  const sampCoveredRows = new Set();
  const normals = samples.filter(s => !['Field_D', 'Interlab_D'].includes(s.sampleType));
  for (const n of normals) {
    const r0 = Math.round((n.depthFrom || 0) / interval);
    const r1 = Math.max(r0 + 1, Math.round((n.depthTo || 0) / interval));
    for (let ri = r0; ri < r1; ri++) sampCoveredRows.add(ri);
    // Find any FD/ILD at this same primary depth
    const fd = samples.find(s => s.sampleType === 'Field_D' && Math.abs((s.depthFrom || 0) - (n.depthFrom || 0)) < 1e-6);
    const ild = samples.find(s => s.sampleType === 'Interlab_D' && Math.abs((s.depthFrom || 0) - (n.depthFrom || 0)) < 1e-6);
    const badges = el('div', { class: 'dup-badges' }, []);
    if (fd) badges.appendChild(el('span', { class: 'dup-badge', title: 'Field Duplicate', onclick: (e) => { e.stopPropagation(); navigate(screenSoilBoreSample, fd.id); } }, 'FD: ' + fd.sampleId));
    if (ild) badges.appendChild(el('span', { class: 'dup-badge', title: 'Inter-lab Duplicate', onclick: (e) => { e.stopPropagation(); navigate(screenSoilBoreSample, ild.id); } }, 'ILD: ' + ild.sampleId));
    const cell = el('div', { class: 'data-cell has-data has-layer', onclick: () => navigate(screenSoilBoreSample, n.id) }, [
      el('span', { class: 'samp-id-text' }, n.sampleId || ''),
      badges
    ]);
    cell.style.gridRow = `${r0 + 2} / ${r1 + 2}`;
    cell.style.gridColumn = String(COLS.samp);
    grid.appendChild(cell);
  }
  // Orphan FD/ILD (no matching Normal at that depth): render as their own cell
  const orphanDups = samples.filter(s => ['Field_D', 'Interlab_D'].includes(s.sampleType) && !normals.some(n => Math.abs((n.depthFrom || 0) - (s.depthFrom || 0)) < 1e-6));
  for (const d of orphanDups) {
    const r0 = Math.round((d.depthFrom || 0) / interval);
    const r1 = Math.max(r0 + 1, Math.round((d.depthTo || 0) / interval));
    for (let ri = r0; ri < r1; ri++) sampCoveredRows.add(ri);
    const cell = el('div', { class: 'data-cell has-data has-layer', onclick: () => navigate(screenSoilBoreSample, d.id) }, [
      el('span', { class: 'samp-id-text' }, d.sampleId || ''),
      el('span', { class: 'dup-badge', style: 'margin-left:4px' }, d.sampleType === 'Field_D' ? 'FD: ' + d.sampleId : 'ILD: ' + d.sampleId)
    ]);
    cell.style.gridRow = `${r0 + 2} / ${r1 + 2}`;
    cell.style.gridColumn = String(COLS.samp);
    grid.appendChild(cell);
  }
  // Empty sample rows
  for (let i = 0; i < rowsCount; i++) {
    if (sampCoveredRows.has(i)) continue;
    const top = +(i * interval).toFixed(3);
    const cell = el('div', { class: 'data-cell empty-samp', onclick: () => createAndEditBoreSample(boreId, top, +(top + interval).toFixed(3)) }, '');
    cell.style.gridRow = String(i + 2);
    cell.style.gridColumn = String(COLS.samp);
    grid.appendChild(cell);
  }

  // Well construction column (if any data)
  if (hasWellData) {
    const wcBands = [
      { key: 'screen',    label: 'Screen',    cls: 'wc-screen',    from: wc.screenFrom,    to: wc.screenTo },
      { key: 'sand',      label: 'Sand',      cls: 'wc-sand',      from: wc.sandFrom,      to: wc.sandTo },
      { key: 'bentonite', label: 'Bentonite', cls: 'wc-bentonite', from: wc.bentoniteFrom, to: wc.bentoniteTo },
      { key: 'grout',     label: 'Grout',     cls: 'wc-grout',     from: wc.groutFrom,     to: wc.groutTo },
      { key: 'backfill',  label: 'Backfill',  cls: 'wc-backfill',  from: wc.backfillFrom,  to: wc.backfillTo }
    ];
    const wcCovered = new Set();
    for (const b of wcBands) {
      if (b.from == null || b.to == null) continue;
      const r0 = Math.round(b.from / interval);
      const r1 = Math.max(r0 + 1, Math.round(b.to / interval));
      for (let ri = r0; ri < r1; ri++) wcCovered.add(ri);
      const cell = el('div', { class: 'wc-cell ' + b.cls, onclick: () => navigate(screenWellConstruction, boreId), title: `${b.label}: ${b.from}-${b.to}m` }, b.label);
      cell.style.gridRow = `${r0 + 2} / ${r1 + 2}`;
      cell.style.gridColumn = String(COLS.well);
      grid.appendChild(cell);
    }
    // Empty rows in WC column still clickable to edit
    for (let i = 0; i < rowsCount; i++) {
      if (wcCovered.has(i)) continue;
      const cell = el('div', { class: 'wc-cell wc-empty', onclick: () => navigate(screenWellConstruction, boreId) }, '');
      cell.style.gridRow = String(i + 2);
      cell.style.gridColumn = String(COLS.well);
      grid.appendChild(cell);
    }
    // Water intersection marker — overlay indicator in the WC column
    if (wc.waterIntersectionDepth != null) {
      const r = Math.round(wc.waterIntersectionDepth / interval);
      const marker = el('div', { class: 'wc-water-marker', title: `Water intersection @ ${wc.waterIntersectionDepth}m`, onclick: () => navigate(screenWellConstruction, boreId) }, '▼');
      marker.style.gridRow = String(r + 2);
      marker.style.gridColumn = String(COLS.well);
      grid.appendChild(marker);
    }
  }

  content.appendChild(grid);

  // Add lithology button
  const lastBottom = liths.length > 0 ? liths[liths.length - 1].depthTo : 0;
  content.appendChild(el('div', { style: 'text-align:center; margin:12px 0' }, [
    el('button', { class: 'btn-icon', style: 'width:48px;height:48px;font-size:26px', onclick: () => createAndEditLithology(boreId, lastBottom || 0) }, '+'),
    el('div', { class: 'text-small' }, 'Add soil lithology layer')
  ]));

  // Well construction link
  content.appendChild(el('div', { style: 'text-align:center; margin:16px 0' }, [
    el('button', { class: 'btn', onclick: () => navigate(screenWellConstruction, boreId) }, (hasWellData ? 'Edit' : 'Add') + ' GW Well Construction')
  ]));

  $app().appendChild(content);
}

function hdrCellAt(text, col, row) {
  const e = el('div', { class: 'hdr' }, text);
  e.style.gridColumn = String(col);
  e.style.gridRow = String(row);
  return e;
}

// Project-wide duplicate ID generator.
// Field_D  → INTRA-NN  (intra-laboratory / field duplicate, blind to lab)
// Interlab_D → INTER-NN  (inter-laboratory duplicate)
// Numbers increment across ALL samples (soil bore, soil, GW, SV) of that dup type
// in the project, since duplicates are typically tracked project-wide on the COC.
async function nextDuplicateId(projectId, dupType) {
  const prefix = dupType === 'Field_D' ? 'INTRA-' : (dupType === 'Interlab_D' ? 'INTER-' : '');
  if (!prefix) return null;
  const allIds = [];
  const locations = await dbGetAllByIndex('locations', 'projectId', projectId);
  for (const loc of locations) {
    const bores = await dbGetAllByIndex('soilBoreholes', 'locationId', loc.id);
    for (const b of bores) {
      const samps = await dbGetAllByIndex('soilBoreSamples', 'boreholeId', b.id);
      for (const s of samps) if (s.sampleType === dupType) allIds.push(s.sampleId);
    }
    for (const store of ['soilSamples', 'gwSamples', 'svSamples']) {
      const samps = await dbGetAllByIndex(store, 'locationId', loc.id);
      for (const s of samps) if (s.sampleType === dupType) allIds.push(s.sampleId);
    }
  }
  return nextAutoId(prefix, allIds);
}

// Row for lithology buttonGroup — label above, buttons wrap below
function lithBgRow(label, id, options, value) {
  return el('div', { class: 'form-field vertical lith-bg-row' }, [
    el('label', {}, label),
    buttonGroup(id, options, value)
  ]);
}

function summarizeLith(l) {
  const parts = [];
  if (l.majorConstituent) parts.push(l.majorConstituent);
  if (l.minorConstituents) parts.push(l.minorConstituents.toLowerCase());
  if (l.primaryColour) parts.push(l.primaryColour);
  if (l.grainSize) parts.push(l.grainSize + ' grained');
  if (l.particleShape) parts.push(l.particleShape);
  if (l.moisture) parts.push(l.moisture);
  if (l.inclusion1 || l.inclusion2 || l.inclusion3) {
    const inc = [l.inclusion1, l.inclusion2, l.inclusion3].filter(Boolean).join(', ');
    if (inc) parts.push('[' + inc + ']');
  }
  return parts.join(', ');
}

// ===== Screen: Soil Lithology =====
async function screenLithology(lithId) {
  clearApp();
  const l = await dbGet('soilLithologies', lithId);
  const bore = await dbGet('soilBoreholes', l.boreholeId);
  const loc = await dbGet('locations', bore.locationId);
  const proj = await dbGet('projects', loc.projectId);

  $app().appendChild(header({ title: 'Soil Lithology', breadcrumb: proj.projectName, subtitle: `${loc.locationId} · ${bore.boreholeId}` }));
  const content = el('div', { class: 'content' });

  content.appendChild(el('div', { class: 'row', style: 'justify-content:flex-end' }, [
    el('button', { class: 'btn btn-danger btn-small', onclick: async () => {
      if (await confirmDialog('Are you sure you want to delete this lithology layer?', 'Delete lithology')) {
        await dbDelete('soilLithologies', lithId);
        setDirty(false); toast('Layer deleted'); navBack();
      }
    }}, 'Delete Lithology Layer')
  ]));

  const fromI = depthInputWithButtons('lith-from', l.depthFrom ?? 0);
  const toI = depthInputWithButtons('lith-to', l.depthTo ?? 0);
  content.appendChild(formRow('Depth from (m):', fromI));
  content.appendChild(formRow('Depth to (m):', toI));
  content.appendChild(lithBgRow('Fill / Natural:', 'lith-fillNatural', FILL_NATURAL_OPTIONS, l.fillNatural || ''));

  const fields = [
    ['Major Constituent:', 'majorConstituent', LITH_CONFIG.majorConstituents],
    ['Minor Constituents:', 'minorConstituents', LITH_CONFIG.minorConstituents],
    ['Grain-size:', 'grainSize', LITH_CONFIG.grainSize],
    ['Plasticity:', 'plasticity', LITH_CONFIG.plasticity],
    ['Primary Colour:', 'primaryColour', LITH_CONFIG.primaryColour],
    ['Combination:', 'combination', LITH_CONFIG.combination],
    ['Secondary Colour:', 'secondaryColour', LITH_CONFIG.secondaryColour],
    ['Colour Shade:', 'colourShade', LITH_CONFIG.colourShade],
    ['Moisture:', 'moisture', LITH_CONFIG.moisture],
    ['Consistency (cohesive):', 'consistencyCohesive', LITH_CONFIG.consistencyCohesive],
    ['Consistency (non-cohesive):', 'consistencyNonCohesive', LITH_CONFIG.consistencyNonCohesive],
    ['Grading:', 'grading', LITH_CONFIG.grading],
    ['Particle Shape:', 'particleShape', LITH_CONFIG.particleShape],
    ['Inclusions 1:', 'inclusion1', LITH_CONFIG.inclusions],
    ['Inclusion 1 amount:', 'inclusion1Amount', LITH_CONFIG.inclusionAmount],
    ['Inclusions 2:', 'inclusion2', LITH_CONFIG.inclusions],
    ['Inclusion 2 amount:', 'inclusion2Amount', LITH_CONFIG.inclusionAmount],
    ['Inclusions 3:', 'inclusion3', LITH_CONFIG.inclusions],
    ['Inclusion 3 amount:', 'inclusion3Amount', LITH_CONFIG.inclusionAmount]
  ];
  for (const [label, key, opts] of fields) {
    content.appendChild(lithBgRow(label, 'lith-' + key, opts, l[key] || ''));
  }

  content.appendChild(el('div', { class: 'form-field vertical' }, [
    el('label', {}, 'Soil Lithology Notes:'),
    textArea('lith-notes', l.notes || '')
  ]));

  content.appendChild(photoPreviewUI(`bore:${bore.id}:lith:${lithId}`, loc.projectId, `${loc.locationId}_${bore.boreholeId}_${(l.depthFrom||0).toFixed(2)}-${(l.depthTo||0).toFixed(2)}`, 'Lithology Photo'));

  content.appendChild(saveBar(async () => {
    l.depthFrom = parseFloat(fromI.value) || 0;
    l.depthTo = parseFloat(toI.value) || 0;
    l.fillNatural = getButtonGroupVal('lith-fillNatural');
    for (const [, key] of fields) l[key] = getButtonGroupVal('lith-' + key);
    l.notes = getVal('lith-notes');
    l.updatedAt = new Date().toISOString();
    await dbPut('soilLithologies', l);
  }));

  $app().appendChild(content);
}

async function createAndEditLithology(boreId, topDepth, bottomDepth) {
  const from = topDepth || 0;
  const to = bottomDepth != null ? bottomDepth : from + 0.2;
  const obj = {
    boreholeId: boreId,
    depthFrom: from,
    depthTo: to,
    fillNatural: '',
    majorConstituent: '', minorConstituents: '', grainSize: '', plasticity: '',
    primaryColour: '', combination: '', secondaryColour: '', colourShade: '',
    moisture: '', consistencyCohesive: '', consistencyNonCohesive: '',
    grading: '', particleShape: '',
    inclusion1: '', inclusion1Amount: '', inclusion2: '', inclusion2Amount: '',
    inclusion3: '', inclusion3Amount: '',
    notes: '',
    createdAt: new Date().toISOString()
  };
  obj.id = await dbAdd('soilLithologies', obj);
  navigate(screenLithology, obj.id);
}

// ===== Screen: Soil Bore Sample =====
async function screenSoilBoreSample(sampleId) {
  clearApp();
  const s = await dbGet('soilBoreSamples', sampleId);
  const bore = await dbGet('soilBoreholes', s.boreholeId);
  const loc = await dbGet('locations', bore.locationId);
  const proj = await dbGet('projects', loc.projectId);

  $app().appendChild(header({ title: 'Soil Bore Sample', breadcrumb: proj.projectName, subtitle: `${loc.locationId} · ${bore.boreholeId}` }));
  const content = el('div', { class: 'content' });

  content.appendChild(el('div', { class: 'row', style: 'justify-content:flex-end' }, [
    el('button', { class: 'btn btn-danger btn-small', onclick: async () => {
      if (await confirmDialog(`Are you sure you want to delete ${s.sampleId}?`, 'Delete sample')) {
        await dbDelete('soilBoreSamples', sampleId);
        setDirty(false); toast('Sample deleted'); navBack();
      }
    }}, 'Delete Soil Bore Sample')
  ]));

  const idI = textInput('s-id', s.sampleId);
  const autoBtn = el('button', { class: 'btn btn-small', onclick: async () => {
    const currentType = getVal('s-type') || s.sampleType || 'Normal';
    if (currentType === 'Field_D' || currentType === 'Interlab_D') {
      idI.value = await nextDuplicateId(loc.projectId, currentType);
    } else {
      const settings = await getSettings();
      const prefix = (settings.autoIds?.soilBoreSamplePrefix || '[SoilBoreId]-').replace('[SoilBoreId]', bore.boreholeId);
      const existing = await dbGetAllByIndex('soilBoreSamples', 'boreholeId', bore.id);
      idI.value = nextAutoId(prefix, existing.map(e => e.sampleId));
    }
    setDirty();
  }}, 'Auto');
  content.appendChild(el('div', { class: 'form-field' }, [
    el('label', {}, 'Soil Bore Sample ID:'),
    el('div', { class: 'field-group' }, [idI, autoBtn])
  ]));

  content.appendChild(formRow('Depth from (m):', depthInputWithButtons('s-from', s.depthFrom ?? 0)));
  content.appendChild(formRow('Depth to (m):', depthInputWithButtons('s-to', s.depthTo ?? 0)));

  const dtI = textInput('s-dt', s.dateTime || '');
  const nowBtn = el('button', { class: 'btn btn-small', onclick: () => { dtI.value = nowStr(); setDirty(); }}, 'Now');
  content.appendChild(el('div', { class: 'form-field' }, [
    el('label', {}, 'Date / Time:'),
    el('div', { class: 'field-group' }, [dtI, nowBtn])
  ]));

  content.appendChild(formRow('Sample Type:', selectInput('s-type', SAMPLE_TYPES, s.sampleType || 'Normal')));
  content.appendChild(formRow('Sample Method:', selectInput('s-method', SAMPLE_METHODS_SOIL, s.sampleMethod || '')));
  content.appendChild(formRow('Sampler:', textInput('s-sampler', s.sampler || '')));
  content.appendChild(formRow('Sample Code:', textInput('s-code', s.sampleCode || '')));

  content.appendChild(el('div', { class: 'form-field vertical' }, [
    el('label', {}, 'Soil Sample Notes:'),
    textArea('s-notes', s.notes || '')
  ]));

  content.appendChild(photoPreviewUI(`bore:${bore.id}:samp:${sampleId}`, loc.projectId, `${loc.locationId}_${bore.boreholeId}_${s.sampleId}`, 'Sample Photo'));

  const dupAction = async (dupType) => {
    const dup = { ...s };
    delete dup.id;
    dup.sampleType = dupType;
    dup.sampleId = await nextDuplicateId(loc.projectId, dupType);
    dup.createdAt = new Date().toISOString();
    dup.id = await dbAdd('soilBoreSamples', dup);
    toast('Duplicate created');
    navigate(screenSoilBoreSample, dup.id);
  };
  const actionsRow = el('div', { style: 'text-align:center; padding:12px 0; display:flex; gap:8px; justify-content:center' }, [
    el('button', { class: 'btn', onclick: () => dupAction('Field_D') }, 'Create Field Duplicate (FD)'),
    el('button', { class: 'btn', onclick: () => dupAction('Interlab_D') }, 'Create Inter-lab Duplicate (ILD)')
  ]);
  content.appendChild(actionsRow);

  content.appendChild(saveBar(async () => {
    s.sampleId = idI.value.trim() || s.sampleId;
    s.depthFrom = parseFloat(getVal('s-from')) || 0;
    s.depthTo = parseFloat(getVal('s-to')) || 0;
    s.dateTime = dtI.value;
    s.sampleType = getVal('s-type');
    s.sampleMethod = getVal('s-method');
    s.sampler = getVal('s-sampler');
    s.sampleCode = getVal('s-code');
    s.notes = getVal('s-notes');
    s.updatedAt = new Date().toISOString();
    await dbPut('soilBoreSamples', s);
  }));

  $app().appendChild(content);
}

async function createAndEditBoreSample(boreId, from, to) {
  const bore = await dbGet('soilBoreholes', boreId);
  const settings = await getSettings();
  const prefix = (settings.autoIds?.soilBoreSamplePrefix || '[SoilBoreId]-').replace('[SoilBoreId]', bore.boreholeId);
  const existing = await dbGetAllByIndex('soilBoreSamples', 'boreholeId', boreId);
  const id = nextAutoId(prefix, existing.map(e => e.sampleId));
  const obj = {
    boreholeId: boreId,
    sampleId: id,
    depthFrom: from,
    depthTo: to,
    dateTime: nowStr(),
    sampleType: 'Normal',
    sampleMethod: '',
    sampler: settings.userName || '',
    sampleCode: '',
    notes: '',
    createdAt: new Date().toISOString()
  };
  obj.id = await dbAdd('soilBoreSamples', obj);
  navigate(screenSoilBoreSample, obj.id);
}

// ===== Screen: Soil Bore Field Measurement =====
async function screenSoilBoreFieldMeas(fmId) {
  clearApp();
  const f = await dbGet('soilBoreFieldMeas', fmId);
  const bore = await dbGet('soilBoreholes', f.boreholeId);
  const loc = await dbGet('locations', bore.locationId);
  const proj = await dbGet('projects', loc.projectId);

  $app().appendChild(header({ title: 'Soil Bore Field Measurement', breadcrumb: proj.projectName, subtitle: `${loc.locationId} · ${bore.boreholeId}` }));
  const content = el('div', { class: 'content' });

  content.appendChild(el('div', { class: 'row', style: 'justify-content:flex-end' }, [
    el('button', { class: 'btn btn-danger btn-small', onclick: async () => {
      if (await confirmDialog('Are you sure you want to delete this field measurement?', 'Delete field measurement')) {
        await dbDelete('soilBoreFieldMeas', fmId);
        setDirty(false); toast('Field measurement deleted'); navBack();
      }
    }}, 'Delete Field Measurement')
  ]));

  content.appendChild(formRow('Depth from (m):', depthInputWithButtons('fm-from', f.depthFrom ?? 0)));
  content.appendChild(formRow('Depth to (m):', depthInputWithButtons('fm-to', f.depthTo ?? 0)));
  const dtI = textInput('fm-dt', f.dateTime || '');
  content.appendChild(el('div', { class: 'form-field' }, [
    el('label', {}, 'Date/Time:'),
    el('div', { class: 'field-group' }, [
      dtI,
      el('button', { class: 'btn btn-small', onclick: () => { dtI.value = nowStr(); setDirty(); }}, 'Now')
    ])
  ]));
  content.appendChild(formRow('Measurement type:', selectInput('fm-type', MEASUREMENT_CONFIG.types, f.measurementType || '')));
  content.appendChild(formRow('Measurement:', numInput('fm-val', f.measurement ?? '')));
  content.appendChild(formRow('Units:', selectInput('fm-units', MEASUREMENT_CONFIG.units, f.units || '')));
  content.appendChild(el('div', { class: 'form-field vertical' }, [
    el('label', {}, 'Field Measurement Notes:'),
    textArea('fm-notes', f.notes || '')
  ]));

  content.appendChild(saveBar(async () => {
    f.depthFrom = parseFloat(getVal('fm-from')) || 0;
    f.depthTo = parseFloat(getVal('fm-to')) || 0;
    f.dateTime = dtI.value;
    f.measurementType = getVal('fm-type');
    f.measurement = parseFloat(getVal('fm-val')) || null;
    f.units = getVal('fm-units');
    f.notes = getVal('fm-notes');
    await dbPut('soilBoreFieldMeas', f);
  }));

  $app().appendChild(content);
}

async function createAndEditBoreFieldMeas(boreId, from, to) {
  const obj = {
    boreholeId: boreId,
    depthFrom: from, depthTo: to,
    dateTime: nowStr(),
    measurementType: 'PID', measurement: null, units: 'ppm', notes: '',
    createdAt: new Date().toISOString()
  };
  obj.id = await dbAdd('soilBoreFieldMeas', obj);
  navigate(screenSoilBoreFieldMeas, obj.id);
}

// ===== Screen: Well Construction =====
async function screenWellConstruction(boreId) {
  clearApp();
  const bore = await dbGet('soilBoreholes', boreId);
  const loc = await dbGet('locations', bore.locationId);
  const proj = await dbGet('projects', loc.projectId);
  let wc = await dbGet('wellConstruction', boreId);
  if (!wc) wc = {
    boreholeId: boreId,
    waterIntersectionDepth: null,
    screenFrom: null, screenTo: null,
    sandFrom: null, sandTo: null,
    bentoniteFrom: null, bentoniteTo: null,
    groutFrom: null, groutTo: null,
    backfillFrom: null, backfillTo: null,
    notes: ''
  };

  $app().appendChild(header({ title: 'GW Well Construction', breadcrumb: proj.projectName, subtitle: `${loc.locationId} · ${bore.boreholeId}` }));
  const content = el('div', { class: 'content' });

  content.appendChild(el('div', { class: 'row', style: 'justify-content:flex-end' }, [
    el('button', { class: 'btn btn-danger btn-small', onclick: async () => {
      if (await confirmDialog('Delete all GW well construction details for this bore?', 'Delete GW Well Construction')) {
        await dbDelete('wellConstruction', boreId);
        setDirty(false); toast('Well construction deleted'); navBack();
      }
    }}, 'Delete Well Construction')
  ]));

  content.appendChild(formRow('Water Intersection Depth (m):', depthInputWithButtons('wc-wi', wc.waterIntersectionDepth ?? '')));
  const intervals = [
    ['Screen',     'screenFrom',    'screenTo'],
    ['Sand',       'sandFrom',      'sandTo'],
    ['Bentonite',  'bentoniteFrom', 'bentoniteTo'],
    ['Grout',      'groutFrom',     'groutTo'],
    ['Backfill',   'backfillFrom',  'backfillTo']
  ];
  for (const [name, keyF, keyT] of intervals) {
    content.appendChild(el('div', { class: 'attr-group-header', style: 'border-top:1px solid #ddd; margin-top:10px' }, [
      el('h3', { style: 'font-size:15px' }, name)
    ]));
    content.appendChild(formRow('Depth from (m):', depthInputWithButtons('wc-' + keyF, wc[keyF] ?? '')));
    content.appendChild(formRow('Depth to (m):', depthInputWithButtons('wc-' + keyT, wc[keyT] ?? '')));
  }

  content.appendChild(el('div', { class: 'form-field vertical' }, [
    el('label', {}, 'Well Construction Notes:'),
    textArea('wc-notes', wc.notes || '')
  ]));

  content.appendChild(saveBar(async () => {
    wc.waterIntersectionDepth = parseFloat(getVal('wc-wi')) || null;
    for (const [, keyF, keyT] of intervals) {
      wc[keyF] = parseFloat(getVal('wc-' + keyF)) || null;
      wc[keyT] = parseFloat(getVal('wc-' + keyT)) || null;
    }
    wc.notes = getVal('wc-notes');
    wc.updatedAt = new Date().toISOString();
    await dbPut('wellConstruction', wc);
  }));

  $app().appendChild(content);
}
