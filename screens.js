// ===== Screen: Home =====
function screenHome() {
  state.screenStack = [{ fn: screenHome, args: [] }];
  state.currentProjectId = null;
  state.currentLocationId = null;
  state.currentBoreholeId = null;
  state.dirty = false;
  clearApp();
  const root = el('div', { class: 'home' }, [
    el('img', { src: 'logo.png', alt: 'LocDat', class: 'home-logo-img' }),
    el('div', { class: 'home-beta-tag' }, `${APP_STAGE} · v${APP_VERSION}`),
    el('button', { class: 'home-btn', onclick: () => navigate(screenProjectPicker) }, 'Open Project'),
    el('button', { class: 'home-btn', onclick: () => navigate(screenEditProject, null) }, 'New Project'),
    el('button', { class: 'home-btn', onclick: () => navigate(screenExport) }, 'Export Data'),
    el('button', { class: 'home-btn', onclick: () => navigate(screenSettings) }, 'Configure')
  ]);
  $app().appendChild(root);
}

// ===== Screen: Project Picker =====
async function screenProjectPicker() {
  clearApp();
  $app().appendChild(header({ title: 'Open Projects' }));
  const projects = await dbGetAll('projects');
  projects.sort((a, b) => (a.projectNumber || '').localeCompare(b.projectNumber || ''));
  const content = el('div', { class: 'content' });
  if (projects.length === 0) {
    content.appendChild(el('p', { class: 'text-small center' }, 'No projects yet. Create one from Home → New Project.'));
  } else {
    for (const p of projects) {
      content.appendChild(el('div', { class: 'list-item', onclick: () => {
        state.currentProjectId = p.id;
        // pop picker off stack before navigating so back from locations returns home
        state.screenStack.pop();
        navigate(screenLocations, p.id);
      }}, [
        el('span', { class: 'num' }, p.projectNumber || '—'),
        el('span', { class: 'name' }, p.projectName || '(unnamed)')
      ]));
    }
  }
  $app().appendChild(content);
}

// ===== Screen: Edit / New Project =====
async function screenEditProject(projectId) {
  clearApp();
  const existing = projectId ? await dbGet('projects', projectId) : null;
  $app().appendChild(header({
    title: projectId ? 'Edit Project' : 'New Project'
  }));
  const content = el('div', { class: 'content' });
  if (projectId) {
    content.appendChild(el('div', { class: 'row', style: 'justify-content:flex-end;margin-bottom:8px' }, [
      el('button', { class: 'btn btn-danger btn-small', onclick: async () => {
        const locs = await dbGetAllByIndex('locations', 'projectId', projectId);
        const msg = locs.length > 0
          ? `This will permanently delete the project AND all ${locs.length} location(s), their soil bores, samples, measurements and photos. Are you sure?`
          : 'Are you sure you want to delete this project?';
        if (await confirmDialog(msg, 'Delete project', 'Delete', 'Cancel')) {
          await cascadeDeleteProject(projectId);
          setDirty(false);
          toast('Project deleted');
          screenHome();
        }
      }}, 'Delete Project')
    ]));
  }
  content.appendChild(formRow('Project Number:', textInput('proj-num', existing?.projectNumber || '')));
  content.appendChild(formRow('Project Name:', textInput('proj-name', existing?.projectName || '')));
  content.appendChild(formRow('Project Description:', textInput('proj-desc', existing?.description || '')));
  content.appendChild(formRow('Client:', textInput('proj-client', existing?.client || '')));
  const notesField = el('div', { class: 'form-field vertical' }, [
    el('label', {}, 'Project Notes:'),
    textArea('proj-notes', existing?.notes || '')
  ]);
  content.appendChild(notesField);

  content.appendChild(saveBar(async () => {
    const num = getVal('proj-num').trim();
    const name = getVal('proj-name').trim();
    if (!num || !name) { await alertDialog('Project Number and Project Name are required.', 'Missing fields'); throw new Error('validation'); }
    const obj = {
      projectNumber: num,
      projectName: name,
      description: getVal('proj-desc'),
      client: getVal('proj-client'),
      notes: getVal('proj-notes'),
      updatedAt: new Date().toISOString()
    };
    if (existing) {
      obj.id = existing.id;
      obj.createdAt = existing.createdAt;
      await dbPut('projects', obj);
      state.currentProjectId = obj.id;
      return; // let saveBar navBack
    } else {
      obj.createdAt = obj.updatedAt;
      const id = await dbAdd('projects', obj);
      state.currentProjectId = id;
      // After creating, replace stack and go forward to locations (skip auto-navBack)
      state.screenStack = [{ fn: screenHome, args: [] }, { fn: screenLocations, args: [id] }];
      setDirty(false);
      screenLocations(id);
      return false;
    }
  }));

  $app().appendChild(content);
}

async function cascadeDeleteProject(projectId) {
  const locs = await dbGetAllByIndex('locations', 'projectId', projectId);
  for (const loc of locs) await cascadeDeleteLocation(loc.id);
  await dbDelete('projects', projectId);
}
async function cascadeDeleteLocation(locId) {
  await dbDelete('spatial', locId);
  const bores = await dbGetAllByIndex('soilBoreholes', 'locationId', locId);
  for (const b of bores) await cascadeDeleteBorehole(b.id);
  for (const store of ['soilSamples', 'gwSamples', 'svSamples', 'gwWellGauges', 'fieldMeasurements', 'customRecords']) {
    const rows = await dbGetAllByIndex(store, 'locationId', locId);
    for (const r of rows) await dbDelete(store, r.id);
  }
  // Photos referencing this location
  const allPhotos = await dbGetAll('photos');
  for (const p of allPhotos) {
    if (p.entityKey && (p.entityKey === `loc:${locId}` || p.entityKey.startsWith(`loc:${locId}:`))) {
      await dbDelete('photos', p.id);
    }
  }
  await dbDelete('locations', locId);
}
async function cascadeDeleteBorehole(boreId) {
  const liths = await dbGetAllByIndex('soilLithologies', 'boreholeId', boreId);
  for (const l of liths) await dbDelete('soilLithologies', l.id);
  const samps = await dbGetAllByIndex('soilBoreSamples', 'boreholeId', boreId);
  for (const s of samps) await dbDelete('soilBoreSamples', s.id);
  const fms = await dbGetAllByIndex('soilBoreFieldMeas', 'boreholeId', boreId);
  for (const f of fms) await dbDelete('soilBoreFieldMeas', f.id);
  await dbDelete('wellConstruction', boreId);
  const allPhotos = await dbGetAll('photos');
  for (const p of allPhotos) {
    if (p.entityKey && p.entityKey.includes(`bore:${boreId}`)) await dbDelete('photos', p.id);
  }
  await dbDelete('soilBoreholes', boreId);
}

// ===== Screen: Locations (hub) =====
async function screenLocations(projectId) {
  state.currentProjectId = projectId;
  state.dirty = false;
  clearApp();
  const project = await dbGet('projects', projectId);
  const locations = await dbGetAllByIndex('locations', 'projectId', projectId);
  locations.sort((a, b) => a.id - b.id);
  if (locations.length === 0) {
    const newLoc = await createNewLocation(projectId);
    state.currentLocationId = newLoc.id;
  } else if (!state.currentLocationId || !locations.find(l => l.id === state.currentLocationId)) {
    state.currentLocationId = locations[0].id;
  }
  const loc = await dbGet('locations', state.currentLocationId);

  $app().appendChild(header({
    title: loc.locationId || '(new location)',
    breadcrumb: project.projectName || project.projectNumber,
    onEdit: () => navigate(async () => {
      clearApp();
      await renderLocationsWithEditProject(projectId);
    })
  }));

  const content = el('div', { class: 'content' });

  // Side menu + Add Attribute Group row
  const topRow = el('div', { class: 'row', style: 'padding: 4px 0' }, [
    el('button', { class: 'btn btn-small', onclick: () => showLocationsSideMenu(projectId) }, '☰ Locations'),
    el('div', { class: 'spacer' }),
    addAttrGroupBtn(projectId, loc.id, content)
  ]);
  content.appendChild(topRow);

  // Location info block (with Edit)
  const infoCard = el('div', { class: 'attr-group' }, [
    el('div', { class: 'attr-group-header' }, [
      el('h3', {}, 'Location Info'),
      el('button', { class: 'btn btn-small', onclick: () => navigate(screenEditLocation, loc.id) }, 'Edit')
    ]),
    renderKV('Location ID:', loc.locationId),
    renderKV('Site Name/ID:', loc.siteName),
    renderKV('Description:', loc.description),
    renderKV('Alternate Name:', loc.alternateName),
    await renderLocationPhoto(loc.id)
  ]);
  content.appendChild(infoCard);

  // Spatial Info (always present)
  content.appendChild(attrGroupBlock('Spatial Info', [
    { label: 'Edit', onClick: () => navigate(screenSpatialInfo, loc.id) }
  ]));

  // Soil Boreholes
  const bores = await dbGetAllByIndex('soilBoreholes', 'locationId', loc.id);
  if (bores.length > 0 || await hasAttrGroup(loc.id, 'soilBorehole')) {
    const boreBlock = el('div', { class: 'attr-group' }, [
      el('div', { class: 'attr-group-header' }, [
        el('h3', {}, 'Soil Boreholes'),
        el('button', { class: 'btn-icon', onclick: () => createAndEditBorehole(loc.id) }, '+')
      ])
    ]);
    for (const b of bores) {
      boreBlock.appendChild(el('div', { class: 'attr-item' }, [
        el('span', { class: 'item-label' }, b.boreholeId || '(unnamed)'),
        el('button', { class: 'item-edit', onclick: () => navigate(screenSoilBorehole, b.id) }, 'Edit')
      ]));
    }
    content.appendChild(boreBlock);
  }

  // Soil Samples
  const samples = await dbGetAllByIndex('soilSamples', 'locationId', loc.id);
  if (samples.length > 0 || await hasAttrGroup(loc.id, 'soilSample')) {
    const sampBlock = el('div', { class: 'attr-group' }, [
      el('div', { class: 'attr-group-header' }, [
        el('h3', {}, 'Soil Samples'),
        el('button', { class: 'btn-icon', onclick: () => createAndEditSoilSample(loc.id) }, '+')
      ])
    ]);
    for (const s of samples) {
      sampBlock.appendChild(el('div', { class: 'attr-item' }, [
        el('span', { class: 'item-label' }, s.sampleId || '(unnamed)'),
        el('button', { class: 'item-edit', onclick: () => navigate(screenSoilSample, s.id) }, 'Edit')
      ]));
    }
    content.appendChild(sampBlock);
  }

  // Groundwater Samples
  const gwSamps = await dbGetAllByIndex('gwSamples', 'locationId', loc.id);
  if (gwSamps.length > 0 || await hasAttrGroup(loc.id, 'gwSample')) {
    const blk = el('div', { class: 'attr-group' }, [
      el('div', { class: 'attr-group-header' }, [
        el('h3', {}, 'Groundwater Samples'),
        el('button', { class: 'btn-icon', onclick: () => createAndEditGwSample(loc.id) }, '+')
      ])
    ]);
    for (const s of gwSamps) {
      blk.appendChild(el('div', { class: 'attr-item' }, [
        el('span', { class: 'item-label' }, s.sampleId || '(unnamed)'),
        el('button', { class: 'item-edit', onclick: () => navigate(screenGwSample, s.id) }, 'Edit')
      ]));
    }
    content.appendChild(blk);
  }

  // Soil Vapour Samples
  const svSamps = await dbGetAllByIndex('svSamples', 'locationId', loc.id);
  if (svSamps.length > 0 || await hasAttrGroup(loc.id, 'svSample')) {
    const blk = el('div', { class: 'attr-group' }, [
      el('div', { class: 'attr-group-header' }, [
        el('h3', {}, 'Soil Vapour Samples'),
        el('button', { class: 'btn-icon', onclick: () => createAndEditSvSample(loc.id) }, '+')
      ])
    ]);
    for (const s of svSamps) {
      blk.appendChild(el('div', { class: 'attr-item' }, [
        el('span', { class: 'item-label' }, s.sampleId || '(unnamed)'),
        el('button', { class: 'item-edit', onclick: () => navigate(screenSvSample, s.id) }, 'Edit')
      ]));
    }
    content.appendChild(blk);
  }

  // Groundwater Well Gauges
  const gauges = await dbGetAllByIndex('gwWellGauges', 'locationId', loc.id);
  if (gauges.length > 0 || await hasAttrGroup(loc.id, 'gwWellGauge')) {
    const blk = el('div', { class: 'attr-group' }, [
      el('div', { class: 'attr-group-header' }, [
        el('h3', {}, 'Groundwater Well Gauges'),
        el('button', { class: 'btn-icon', onclick: () => createAndEditGwWellGauge(loc.id) }, '+')
      ])
    ]);
    for (const g of gauges) {
      const label = `${g.dateTime || '—'} · Well ${g.wellDepth ?? '?'}m · DTW ${g.depthToWater ?? '?'}m`;
      blk.appendChild(el('div', { class: 'attr-item' }, [
        el('span', { class: 'item-label' }, label),
        el('button', { class: 'item-edit', onclick: () => navigate(screenGwWellGauge, g.id) }, 'Edit')
      ]));
    }
    content.appendChild(blk);
  }

  // Field Measurements
  const fms = await dbGetAllByIndex('fieldMeasurements', 'locationId', loc.id);
  if (fms.length > 0 || await hasAttrGroup(loc.id, 'fieldMeasurement')) {
    const fmBlock = el('div', { class: 'attr-group' }, [
      el('div', { class: 'attr-group-header' }, [
        el('h3', {}, 'Field Measurements'),
        el('button', { class: 'btn-icon', onclick: () => createAndEditFieldMeas(loc.id) }, '+')
      ])
    ]);
    for (const f of fms) {
      fmBlock.appendChild(el('div', { class: 'attr-item' }, [
        el('span', { class: 'item-label' }, `${f.measurementType || '?'}: ${f.measurement ?? ''} ${f.units || ''}`),
        el('button', { class: 'item-edit', onclick: () => navigate(screenFieldMeas, f.id) }, 'Edit')
      ]));
    }
    content.appendChild(fmBlock);
  }

  // Custom1
  const customs = await dbGetAllByIndex('customRecords', 'locationId', loc.id);
  const settings = await getSettings();
  const customName = settings.customAttrGroup?.name || 'CUSTOM1';
  if (customs.length > 0 || await hasAttrGroup(loc.id, 'custom1')) {
    const customBlock = el('div', { class: 'attr-group' }, [
      el('div', { class: 'attr-group-header' }, [
        el('h3', {}, customName),
        el('button', { class: 'btn-icon', onclick: () => createAndEditCustom1(loc.id) }, '+')
      ])
    ]);
    for (const c of customs) {
      customBlock.appendChild(el('div', { class: 'attr-item' }, [
        el('span', { class: 'item-label' }, `${c.attributeType || '(none)'}: ${c.value || ''}`),
        el('button', { class: 'item-edit', onclick: () => navigate(screenCustom1, c.id) }, 'Edit')
      ]));
    }
    content.appendChild(customBlock);
  }

  $app().appendChild(content);
}

function renderKV(k, v) {
  return el('div', { style: 'display:flex; padding:4px 0; font-size:14px' }, [
    el('span', { style: 'flex: 0 0 40%; color:#555' }, k),
    el('span', { style: 'flex:1; color:#111' }, v || '—')
  ]);
}

function attrGroupBlock(title, actions) {
  const hdr = el('div', { class: 'attr-group-header' }, [
    el('h3', {}, title),
    ...actions.map(a => el('button', { class: 'btn btn-small', onclick: a.onClick }, a.label))
  ]);
  return el('div', { class: 'attr-group' }, [hdr]);
}

async function renderLocationPhoto(locId) {
  const photo = await getLatestPhoto(`loc:${locId}`);
  if (!photo) return el('div', { class: 'photo-preview empty' }, 'No location photo');
  const url = URL.createObjectURL(photo.blob);
  return el('div', { class: 'photo-preview' }, [ el('img', { src: url }) ]);
}

// Markers that the user explicitly added an attribute group even if empty
async function hasAttrGroup(locId, key) {
  const loc = await dbGet('locations', locId);
  return (loc.addedGroups || []).includes(key);
}
async function addAttrGroup(locId, key) {
  const loc = await dbGet('locations', locId);
  loc.addedGroups = Array.from(new Set([...(loc.addedGroups || []), key]));
  await dbPut('locations', loc);
}

function addAttrGroupBtn(projectId, locId, content) {
  const btn = el('button', { class: 'btn btn-small', style: 'background:#9CE076', onclick: async (e) => {
    e.stopPropagation();
    const opts = ATTR_GROUPS;
    const m = modal([
      el('h3', {}, 'Add Attribute Group'),
      ...opts.map(o => el('button', { class: 'btn', style: 'display:block;width:100%;margin:4px 0', onclick: async () => {
        await addAttrGroup(locId, o.key);
        m.close();
        // Create and open first record
        if (o.key === 'soilBorehole') {
          const bore = { locationId: locId, boreholeId: '', drillDate: '', driller: '', drillingMethod: '', logger: '', totalDepth: null, scaleM: 1, intervalM: 0.1, notes: '', createdAt: new Date().toISOString() };
          bore.id = await dbAdd('soilBoreholes', bore);
          navigate(screenSoilBorehole, bore.id);
        } else if (o.key === 'soilSample') {
          const samp = { locationId: locId, sampleId: '', depthFrom: 0, depthTo: 0, dateTime: '', sampleType: 'Normal', sampleMethod: '', sampler: '', sampleCode: '', notes: '', createdAt: new Date().toISOString() };
          samp.id = await dbAdd('soilSamples', samp);
          navigate(screenSoilSample, samp.id);
        } else if (o.key === 'gwSample') {
          const samp = { locationId: locId, sampleId: '', depthFrom: 0, depthTo: 0, dateTime: '', sampleType: 'Normal', sampleMethod: '', sampler: '', sampleCode: '', notes: '', createdAt: new Date().toISOString() };
          samp.id = await dbAdd('gwSamples', samp);
          navigate(screenGwSample, samp.id);
        } else if (o.key === 'svSample') {
          const samp = { locationId: locId, sampleId: '', depthFrom: 0, depthTo: 0, dateTime: '', sampleType: 'Normal', sampleMethod: '', sampler: '', sampleCode: '', notes: '', createdAt: new Date().toISOString() };
          samp.id = await dbAdd('svSamples', samp);
          navigate(screenSvSample, samp.id);
        } else if (o.key === 'gwWellGauge') {
          const gauge = { locationId: locId, dateTime: '', wellDepth: null, depthToWater: null, gaugedBy: '', notes: '', createdAt: new Date().toISOString() };
          gauge.id = await dbAdd('gwWellGauges', gauge);
          navigate(screenGwWellGauge, gauge.id);
        } else if (o.key === 'fieldMeasurement') {
          const fm = { locationId: locId, dateTime: '', measurementType: 'PID', measurement: null, units: 'ppm', notes: '', createdAt: new Date().toISOString() };
          fm.id = await dbAdd('fieldMeasurements', fm);
          navigate(screenFieldMeas, fm.id);
        } else if (o.key === 'custom1') {
          const cust = { locationId: locId, attributeType: '', value: '', dateTime: '', notes: '', createdAt: new Date().toISOString() };
          cust.id = await dbAdd('customRecords', cust);
          navigate(screenCustom1, cust.id);
        } else {
          // spatial has no records to create, just refresh
          screenLocations(projectId);
        }
      }}, o.name)),
      el('div', { class: 'modal-actions' }, [
        el('button', { class: 'btn', onclick: () => m.close() }, 'Cancel')
      ])
    ]);
  }}, 'Add Attribute Group ▾');
  return btn;
}

// ===== Side Menu (Locations list) =====
async function showLocationsSideMenu(projectId) {
  const locations = await dbGetAllByIndex('locations', 'projectId', projectId);
  locations.sort((a, b) => a.id - b.id);
  const overlay = el('div', { class: 'side-menu-overlay', onclick: () => close() });
  const menu = el('div', { class: 'side-menu' });

  const hdr = el('div', { class: 'side-menu-header' }, [
    el('button', { class: 'hdr-back', onclick: () => close() }, '◀'),
    el('button', { class: 'btn btn-small', onclick: async () => {
      close();
      const newLoc = await createNewLocation(projectId);
      state.currentLocationId = newLoc.id;
      screenLocations(projectId);
    }}, '+ Location')
  ]);

  const list = el('div', { class: 'side-menu-list' });
  for (const l of locations) {
    const item = el('div', { class: 'side-menu-item' + (l.id === state.currentLocationId ? ' active' : ''), onclick: (e) => {
      if (menu.classList.contains('delete-mode')) return;
      state.currentLocationId = l.id;
      close();
      screenLocations(projectId);
    }}, [
      el('span', {}, l.locationId || '(new)'),
      el('button', { class: 'del-btn', onclick: async (e) => {
        e.stopPropagation();
        if (await confirmDialog(`Are you sure you want to delete ${l.locationId || 'this location'}? This removes all its soil bores, samples, measurements and photos.`, 'Delete location', 'Delete', 'Cancel')) {
          await cascadeDeleteLocation(l.id);
          close();
          if (state.currentLocationId === l.id) state.currentLocationId = null;
          screenLocations(projectId);
        }
      }}, '−')
    ]);
    list.appendChild(item);
  }

  const delBtn = el('button', { class: 'btn btn-danger', style: 'width:100%', onclick: () => {
    if (menu.classList.contains('delete-mode')) {
      menu.classList.remove('delete-mode');
      delBtn.textContent = 'Delete Locations';
      delBtn.className = 'btn btn-danger';
    } else {
      menu.classList.add('delete-mode');
      delBtn.textContent = 'Cancel Delete';
      delBtn.className = 'btn';
    }
  }}, 'Delete Locations');

  menu.appendChild(hdr);
  menu.appendChild(list);
  menu.appendChild(el('div', { class: 'side-menu-footer' }, [delBtn]));

  function close() { overlay.remove(); menu.remove(); }

  $modals().appendChild(overlay);
  $modals().appendChild(menu);
}

async function createNewLocation(projectId) {
  const settings = await getSettings();
  const prefix = settings.autoIds?.locationPrefix || 'Loc-';
  const existing = await dbGetAllByIndex('locations', 'projectId', projectId);
  const id = nextAutoId(prefix, existing.map(e => e.locationId));
  const obj = {
    projectId,
    locationId: id,
    siteName: '',
    description: '',
    alternateName: '',
    notes: '',
    addedGroups: [],
    createdAt: new Date().toISOString()
  };
  obj.id = await dbAdd('locations', obj);
  // Create empty spatial record
  await dbPut('spatial', { locationId: obj.id, gpsMode: 'device' });
  return obj;
}

// Edit-project inline entry from Locations screen
async function renderLocationsWithEditProject(projectId) {
  await screenEditProject(projectId);
}

// ===== Screen: Edit Location =====
async function screenEditLocation(locId) {
  clearApp();
  const loc = await dbGet('locations', locId);
  const proj = await dbGet('projects', loc.projectId);
  $app().appendChild(header({ title: 'Location Edit', breadcrumb: proj.projectName, subtitle: loc.locationId }));
  const content = el('div', { class: 'content' });

  content.appendChild(el('div', { class: 'row', style: 'justify-content:flex-end' }, [
    el('button', { class: 'btn btn-danger btn-small', onclick: async () => {
      if (await confirmDialog(`Are you sure you want to delete ${loc.locationId}? This removes all its soil bores, samples, measurements and photos.`, 'Delete location', 'Delete', 'Cancel')) {
        await cascadeDeleteLocation(locId);
        setDirty(false);
        toast('Location deleted');
        state.currentLocationId = null;
        navBack();
      }
    }}, 'Delete Location')
  ]));

  content.appendChild(formRow('Location ID:', textInput('loc-id', loc.locationId)));
  content.appendChild(formRow('Site Name/ID:', textInput('loc-site', loc.siteName)));
  content.appendChild(formRow('Description:', textInput('loc-desc', loc.description)));
  content.appendChild(formRow('Alternate Name:', textInput('loc-alt', loc.alternateName)));
  content.appendChild(el('div', { class: 'form-field vertical' }, [
    el('label', {}, 'Location Notes:'),
    textArea('loc-notes', loc.notes || '')
  ]));

  content.appendChild(photoPreviewUI(`loc:${locId}`, loc.projectId, `${loc.locationId}`, 'Location Photo'));

  content.appendChild(saveBar(async () => {
    loc.locationId = getVal('loc-id').trim() || loc.locationId;
    loc.siteName = getVal('loc-site');
    loc.description = getVal('loc-desc');
    loc.alternateName = getVal('loc-alt');
    loc.notes = getVal('loc-notes');
    loc.updatedAt = new Date().toISOString();
    await dbPut('locations', loc);
  }));

  $app().appendChild(content);
}

// ===== Screen: Spatial Info =====
async function screenSpatialInfo(locId) {
  clearApp();
  const loc = await dbGet('locations', locId);
  const proj = await dbGet('projects', loc.projectId);
  let spatial = await dbGet('spatial', locId);
  if (!spatial) spatial = { locationId: locId, gpsMode: 'device' };

  $app().appendChild(header({ title: 'Spatial Info', breadcrumb: proj.projectName, subtitle: loc.locationId }));
  const content = el('div', { class: 'content' });

  // mode radio
  const modeRow = el('div', { class: 'radio-group' }, [
    el('label', {}, [ el('input', { type: 'radio', name: 'gps-mode', value: 'device', checked: spatial.gpsMode !== 'manual' }), 'Device GPS' ]),
    el('label', {}, [ el('input', { type: 'radio', name: 'gps-mode', value: 'manual', checked: spatial.gpsMode === 'manual' }), 'Manually GPS' ])
  ]);
  content.appendChild(modeRow);

  const northingI = numInput('sp-n', spatial.northing ?? '');
  const eastingI = numInput('sp-e', spatial.easting ?? '');
  const latI = numInput('sp-lat', spatial.latitude ?? '');
  const lngI = numInput('sp-lng', spatial.longitude ?? '');
  const applyReadonly = () => {
    const manual = document.querySelector('input[name="gps-mode"]:checked').value === 'manual';
    [northingI, eastingI, latI, lngI].forEach(i => { i.readOnly = !manual; });
    selectBtn.disabled = manual;
    selectBtn.style.background = manual ? '#ccc' : '#8BC34A';
    selectBtn.style.color = manual ? '#666' : '#fff';
  };
  modeRow.addEventListener('change', () => { applyReadonly(); setDirty(); });

  content.appendChild(formRow('Northing:', northingI));
  content.appendChild(formRow('Easting:', eastingI));
  content.appendChild(formRow('Latitude:', latI));
  content.appendChild(formRow('Longitude:', lngI));
  content.appendChild(el('div', { class: 'text-small' }, 'MGA Zone 54 (GDA2020) — Easting/Northing in metres; Lat/Lng in decimal degrees (WGS84 ≈ GDA2020).'));

  content.appendChild(el('div', { style: 'margin-top:10px' }, 'Select coordinates from satellite map'));
  const mapDiv = el('div', { id: 'map' });
  content.appendChild(mapDiv);

  const accEl = el('span', { class: 'accuracy' }, 'Accuracy: —');
  const selectBtn = el('button', { class: 'btn btn-primary', style: 'padding:10px 24px', onclick: () => captureGps() }, 'Select');
  content.appendChild(el('div', { class: 'map-controls' }, [
    accEl,
    el('div', { class: 'spacer' }),
    selectBtn
  ]));

  content.appendChild(el('div', { class: 'form-field vertical' }, [
    el('label', {}, 'Spatial Notes:'),
    textArea('sp-notes', spatial.notes || '')
  ]));

  content.appendChild(saveBar(async () => {
    const mode = document.querySelector('input[name="gps-mode"]:checked').value;
    spatial.gpsMode = mode;
    spatial.northing = parseFloat(northingI.value) || null;
    spatial.easting = parseFloat(eastingI.value) || null;
    spatial.latitude = parseFloat(latI.value) || null;
    spatial.longitude = parseFloat(lngI.value) || null;
    spatial.notes = getVal('sp-notes');
    spatial.updatedAt = new Date().toISOString();
    await dbPut('spatial', spatial);
  }));

  $app().appendChild(content);
  applyReadonly();

  // Init Leaflet map
  setTimeout(() => initSpatialMap(spatial, (lat, lng, acc) => {
    latI.value = lat.toFixed(6);
    lngI.value = lng.toFixed(6);
    const mga = latLngToMGA(lat, lng);
    northingI.value = mga.northing.toFixed(2);
    eastingI.value = mga.easting.toFixed(2);
    if (acc != null) accEl.textContent = `Accuracy: ±${Math.round(acc)}m`;
    setDirty();
  }), 100);

  async function captureGps() {
    if (!navigator.geolocation) { await alertDialog('Geolocation not available on this device.', 'Error'); return; }
    selectBtn.textContent = '…';
    navigator.geolocation.getCurrentPosition((pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      latI.value = latitude.toFixed(6);
      lngI.value = longitude.toFixed(6);
      const mga = latLngToMGA(latitude, longitude);
      northingI.value = mga.northing.toFixed(2);
      eastingI.value = mga.easting.toFixed(2);
      accEl.textContent = `Accuracy: ±${Math.round(accuracy)}m`;
      if (window._locDatMap) {
        window._locDatMap.setView([latitude, longitude], 18);
        if (window._locDatMarker) window._locDatMarker.setLatLng([latitude, longitude]);
        else window._locDatMarker = L.marker([latitude, longitude]).addTo(window._locDatMap);
      }
      selectBtn.textContent = 'Select';
      setDirty();
    }, (err) => {
      selectBtn.textContent = 'Select';
      alertDialog('GPS error: ' + err.message, 'GPS');
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
  }
}

function initSpatialMap(spatial, onClick) {
  if (window._locDatMap) { window._locDatMap.remove(); window._locDatMap = null; window._locDatMarker = null; }
  const centerLat = spatial.latitude || -34.9285;
  const centerLng = spatial.longitude || 138.6007;
  const map = L.map('map').setView([centerLat, centerLng], spatial.latitude ? 17 : 10);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Esri, Maxar, Earthstar Geographics', maxZoom: 20
  }).addTo(map);
  if (spatial.latitude && spatial.longitude) {
    window._locDatMarker = L.marker([spatial.latitude, spatial.longitude]).addTo(map);
  }
  map.on('click', (ev) => {
    const { lat, lng } = ev.latlng;
    if (window._locDatMarker) window._locDatMarker.setLatLng([lat, lng]);
    else window._locDatMarker = L.marker([lat, lng]).addTo(map);
    onClick(lat, lng, null);
  });
  window._locDatMap = map;
}
