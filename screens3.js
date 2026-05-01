// ===== Screen: Login =====
function screenLogin() {
  clearApp();
  const content = el('div', { class: 'content', style: 'max-width:400px; margin:80px auto; text-align:center; padding:24px' });
  
  content.appendChild(el('h2', { style: 'color:#8BC34A; margin-bottom:8px' }, 'LocDat'));
  content.appendChild(el('p', { style: 'color:#666; margin-bottom:32px; font-size:14px' }, 'Beta v' + APP_VERSION));
  
  content.appendChild(el('p', { style: 'margin-bottom:24px' }, 'Enter password to continue'));
  
  const passwordInput = el('input', { 
    type: 'password', 
    id: 'login-password',
    placeholder: 'Password',
    style: 'width:100%; padding:12px; font-size:16px; border:1px solid #ccc; border-radius:4px; margin-bottom:16px',
    onkeydown: (e) => { if (e.key === 'Enter') loginBtn.click(); }
  });
  content.appendChild(passwordInput);
  
  const errorMsg = el('div', { 
    id: 'login-error',
    style: 'color:#E0594E; margin-bottom:16px; font-size:14px; min-height:20px' 
  }, '');
  content.appendChild(errorMsg);
  
  const loginBtn = el('button', { 
    class: 'btn btn-primary',
    style: 'width:100%; padding:12px; font-size:16px',
    onclick: async () => {
      const password = passwordInput.value.trim();
      if (!password) {
        errorMsg.textContent = 'Please enter a password';
        return;
      }
      
      loginBtn.disabled = true;
      loginBtn.textContent = 'Authenticating...';
      errorMsg.textContent = '';
      
      const result = await validateAuth(password);
      
      if (result.success) {
        toast('Authentication successful');
        navigate(screenHome);
      } else {
        errorMsg.textContent = result.error;
        loginBtn.disabled = false;
        loginBtn.textContent = 'Login';
        passwordInput.value = '';
        passwordInput.focus();
      }
    }
  }, 'Login');
  content.appendChild(loginBtn);
  
  content.appendChild(el('p', { style: 'margin-top:32px; font-size:12px; color:#999' }, 
    'Contact your administrator if you need access.'));
  
  $app().appendChild(content);
  
  // Auto-focus password field
  setTimeout(() => passwordInput.focus(), 100);
}

// ===== Screen: Soil Sample (location-level) =====
async function screenSoilSample(sampId) {
  clearApp();
  const s = await dbGet('soilSamples', sampId);
  const loc = await dbGet('locations', s.locationId);
  const proj = await dbGet('projects', loc.projectId);

  $app().appendChild(header({ title: 'Soil Sample', breadcrumb: proj.projectName, subtitle: loc.locationId }));
  const content = el('div', { class: 'content' });

  content.appendChild(el('div', { class: 'row', style: 'justify-content:flex-end' }, [
    el('button', { class: 'btn btn-danger btn-small', onclick: async () => {
      if (await confirmDialog(`Are you sure you want to delete ${s.sampleId}?`, 'Delete sample')) {
        await dbDelete('soilSamples', sampId);
        setDirty(false); toast('Sample deleted'); navBack();
      }
    }}, 'Delete Soil Sample')
  ]));

  const idI = textInput('ss-id', s.sampleId);
  const autoBtn = el('button', { class: 'btn btn-small', onclick: async () => {
    const currentType = getVal('ss-type') || s.sampleType || 'Normal';
    if (currentType === 'Field_D' || currentType === 'Interlab_D') {
      idI.value = await nextDuplicateId(loc.projectId, currentType);
    } else {
      const settings = await getSettings();
      const prefix = settings.autoIds?.soilSamplePrefix || 'SS';
      const existing = await dbGetAllByIndex('soilSamples', 'locationId', loc.id);
      idI.value = nextAutoId(prefix, existing.map(e => e.sampleId));
    }
    setDirty();
  }}, 'Auto');
  content.appendChild(el('div', { class: 'form-field' }, [
    el('label', {}, 'Soil Sample ID:'),
    el('div', { class: 'field-group' }, [idI, autoBtn])
  ]));

  content.appendChild(formRow('Depth from (m):', depthInputWithButtons('ss-from', s.depthFrom ?? 0)));
  content.appendChild(formRow('Depth to (m):', depthInputWithButtons('ss-to', s.depthTo ?? 0)));
  const dtI = textInput('ss-dt', s.dateTime || '');
  content.appendChild(el('div', { class: 'form-field' }, [
    el('label', {}, 'Date / Time:'),
    el('div', { class: 'field-group' }, [
      dtI,
      el('button', { class: 'btn btn-small', onclick: () => { dtI.value = nowStr(); setDirty(); }}, 'Now')
    ])
  ]));
  content.appendChild(formRow('Sample Type:', selectInput('ss-type', SAMPLE_TYPES, s.sampleType || 'Normal')));
  content.appendChild(formRow('Sample Method:', selectInput('ss-method', SAMPLE_METHODS_SOIL, s.sampleMethod || '')));
  content.appendChild(formRow('Sampler:', textInput('ss-sampler', s.sampler || '')));
  content.appendChild(formRow('Sample Code:', textInput('ss-code', s.sampleCode || '')));

  content.appendChild(el('div', { class: 'form-field vertical' }, [
    el('label', {}, 'Soil Sample Notes:'),
    textArea('ss-notes', s.notes || '')
  ]));

  content.appendChild(photoPreviewUI(`loc:${loc.id}:samp:${sampId}`, loc.projectId, `${loc.locationId}_${s.sampleId}`, 'Sample Photo'));

  const ssDupAction = async (dupType) => {
    const dup = { ...s };
    delete dup.id;
    dup.sampleType = dupType;
    dup.sampleId = await nextDuplicateId(loc.projectId, dupType);
    dup.createdAt = new Date().toISOString();
    dup.id = await dbAdd('soilSamples', dup);
    toast('Duplicate created');
    navigate(screenSoilSample, dup.id);
  };
  content.appendChild(el('div', { style: 'text-align:center; padding:12px 0; display:flex; gap:8px; justify-content:center' }, [
    el('button', { class: 'btn', onclick: () => ssDupAction('Field_D') }, 'Create FD'),
    el('button', { class: 'btn', onclick: () => ssDupAction('Interlab_D') }, 'Create ILD')
  ]));

  content.appendChild(saveBar(async () => {
    s.sampleId = idI.value.trim() || s.sampleId;
    s.depthFrom = parseFloat(getVal('ss-from')) || 0;
    s.depthTo = parseFloat(getVal('ss-to')) || 0;
    s.dateTime = dtI.value;
    s.sampleType = getVal('ss-type');
    s.sampleMethod = getVal('ss-method');
    s.sampler = getVal('ss-sampler');
    s.sampleCode = getVal('ss-code');
    s.notes = getVal('ss-notes');
    await dbPut('soilSamples', s);
  }));

  $app().appendChild(content);
}

async function createAndEditSoilSample(locId) {
  const settings = await getSettings();
  const prefix = settings.autoIds?.soilSamplePrefix || 'SS';
  const existing = await dbGetAllByIndex('soilSamples', 'locationId', locId);
  const id = nextAutoId(prefix, existing.map(e => e.sampleId));
  const obj = {
    locationId: locId,
    sampleId: id,
    depthFrom: 0, depthTo: 0.1,
    dateTime: nowStr(),
    sampleType: 'Normal', sampleMethod: '', sampler: settings.userName || '', sampleCode: '', notes: '',
    createdAt: new Date().toISOString()
  };
  obj.id = await dbAdd('soilSamples', obj);
  navigate(screenSoilSample, obj.id);
}

// ===== Screen: Field Measurement (location-level) =====
async function screenFieldMeas(fmId) {
  clearApp();
  const f = await dbGet('fieldMeasurements', fmId);
  const loc = await dbGet('locations', f.locationId);
  const proj = await dbGet('projects', loc.projectId);

  $app().appendChild(header({ title: 'Field Measurement', breadcrumb: proj.projectName, subtitle: loc.locationId }));
  const content = el('div', { class: 'content' });

  content.appendChild(el('div', { class: 'row', style: 'justify-content:flex-end' }, [
    el('button', { class: 'btn btn-danger btn-small', onclick: async () => {
      if (await confirmDialog('Are you sure you want to delete this field measurement?', 'Delete field measurement')) {
        await dbDelete('fieldMeasurements', fmId);
        setDirty(false); toast('Field measurement deleted'); navBack();
      }
    }}, 'Delete Field Measurement')
  ]));

  const dtI = textInput('fml-dt', f.dateTime || '');
  content.appendChild(el('div', { class: 'form-field' }, [
    el('label', {}, 'Date/Time:'),
    el('div', { class: 'field-group' }, [
      dtI, el('button', { class: 'btn btn-small', onclick: () => { dtI.value = nowStr(); setDirty(); }}, 'Now')
    ])
  ]));
  content.appendChild(formRow('Measurement type:', selectInput('fml-type', MEASUREMENT_CONFIG.types, f.measurementType || '')));
  content.appendChild(formRow('Measurement:', numInput('fml-val', f.measurement ?? '')));
  content.appendChild(formRow('Units:', selectInput('fml-units', MEASUREMENT_CONFIG.units, f.units || '')));
  content.appendChild(el('div', { class: 'form-field vertical' }, [
    el('label', {}, 'Field Measurement Notes:'),
    textArea('fml-notes', f.notes || '')
  ]));

  content.appendChild(saveBar(async () => {
    f.dateTime = dtI.value;
    f.measurementType = getVal('fml-type');
    f.measurement = parseFloat(getVal('fml-val')) || null;
    f.units = getVal('fml-units');
    f.notes = getVal('fml-notes');
    await dbPut('fieldMeasurements', f);
  }));

  $app().appendChild(content);
}

async function createAndEditFieldMeas(locId) {
  const obj = {
    locationId: locId,
    dateTime: nowStr(),
    measurementType: 'PID', measurement: null, units: 'ppm', notes: '',
    createdAt: new Date().toISOString()
  };
  obj.id = await dbAdd('fieldMeasurements', obj);
  navigate(screenFieldMeas, obj.id);
}

// ===== Screen: Custom1 =====
async function screenCustom1(cId) {
  clearApp();
  const c = await dbGet('customRecords', cId);
  const loc = await dbGet('locations', c.locationId);
  const proj = await dbGet('projects', loc.projectId);
  const settings = await getSettings();
  const cfg = settings.customAttrGroup || DEFAULT_SETTINGS.customAttrGroup;
  const groupName = cfg.name || 'CUSTOM1';

  $app().appendChild(header({ title: groupName, breadcrumb: proj.projectName, subtitle: loc.locationId }));
  const content = el('div', { class: 'content' });

  content.appendChild(el('div', { class: 'row', style: 'justify-content:flex-end' }, [
    el('button', { class: 'btn btn-danger btn-small', onclick: async () => {
      if (await confirmDialog('Are you sure you want to delete this record?', 'Delete record')) {
        await dbDelete('customRecords', cId);
        setDirty(false); toast('Record deleted'); navBack();
      }
    }}, 'Delete Record')
  ]));

  const attrOptions = [cfg.attr1Name, cfg.attr2Name, cfg.attr3Name].filter(Boolean);
  if (attrOptions.length > 0) {
    content.appendChild(formRow('Attribute type:', selectInput('c-type', ['', ...attrOptions], c.attributeType || '')));
  } else {
    content.appendChild(formRow('Attribute type:', textInput('c-type', c.attributeType || '')));
    content.appendChild(el('div', { class: 'text-small' }, 'Configure custom attribute names in Settings.'));
  }

  content.appendChild(formRow('Value:', textInput('c-val', c.value || '')));
  const dtI = textInput('c-dt', c.dateTime || '');
  content.appendChild(el('div', { class: 'form-field' }, [
    el('label', {}, 'Date/Time:'),
    el('div', { class: 'field-group' }, [
      dtI, el('button', { class: 'btn btn-small', onclick: () => { dtI.value = nowStr(); setDirty(); }}, 'Now')
    ])
  ]));
  content.appendChild(el('div', { class: 'form-field vertical' }, [
    el('label', {}, `${groupName} Notes:`),
    textArea('c-notes', c.notes || '')
  ]));

  content.appendChild(photoPreviewUI(`loc:${loc.id}:custom:${cId}`, loc.projectId, `${loc.locationId}_${groupName}`, `${groupName} Photo`));

  content.appendChild(saveBar(async () => {
    c.attributeType = getVal('c-type');
    c.value = getVal('c-val');
    c.dateTime = dtI.value;
    c.notes = getVal('c-notes');
    await dbPut('customRecords', c);
  }));

  $app().appendChild(content);
}

async function createAndEditCustom1(locId) {
  const obj = {
    locationId: locId,
    attributeType: '', value: '', dateTime: nowStr(), notes: '',
    createdAt: new Date().toISOString()
  };
  obj.id = await dbAdd('customRecords', obj);
  navigate(screenCustom1, obj.id);
}

// ===== Screen: Export Data =====
async function screenExport() {
  clearApp();
  $app().appendChild(header({ title: 'Export Data' }));
  const content = el('div', { class: 'content' });

  // Project picker - one project at a time
  const projects = await dbGetAll('projects');
  if (projects.length === 0) {
    content.appendChild(el('p', {}, 'No projects to export.'));
    $app().appendChild(content);
    return;
  }
  projects.sort((a,b) => (a.projectNumber||'').localeCompare(b.projectNumber||''));
  content.appendChild(formRow('Project:', (() => {
    const s = el('select', { id: 'exp-proj' });
    projects.forEach(p => s.appendChild(el('option', { value: p.id }, `${p.projectNumber} — ${p.projectName}`)));
    s.addEventListener('change', () => rebuild());
    return s;
  })()));

  const treeContainer = el('div', { class: 'export-tree' });
  content.appendChild(treeContainer);

  const btnRow = el('div', { style: 'display:flex; gap:10px; margin-top:16px; justify-content:space-between' }, [
    el('button', { class: 'btn btn-primary', onclick: runExport }, 'Export to Excel (.xlsx)'),
    el('button', { class: 'btn', onclick: () => navigate(screenPhotoExport, parseInt(getVal('exp-proj'))) }, 'Export Photos as Zip')
  ]);
  content.appendChild(btnRow);

  $app().appendChild(content);

  const selected = { projectId: projects[0].id, locs: new Map() };

  async function rebuild() {
    selected.projectId = parseInt(getVal('exp-proj'));
    treeContainer.innerHTML = '';
    const locs = await dbGetAllByIndex('locations', 'projectId', selected.projectId);
    locs.sort((a,b) => a.id - b.id);
    selected.locs = new Map();
    // header row
    const hdrCheckbox = el('input', { type: 'checkbox', class: 'export-checkbox' });
    hdrCheckbox.addEventListener('change', () => {
      treeContainer.querySelectorAll('.export-checkbox').forEach(cb => { cb.checked = hdrCheckbox.checked; cb.dispatchEvent(new Event('change')); });
    });
    treeContainer.appendChild(el('div', { class: 'export-header' }, [
      el('span', { class: 'name' }, 'All Project Data'),
      hdrCheckbox
    ]));
    for (const loc of locs) {
      const locGroups = new Set(['spatial', ...(loc.addedGroups || [])]);
      // Discover present data:
      if ((await dbGetAllByIndex('soilBoreholes', 'locationId', loc.id)).length) locGroups.add('soilBorehole');
      if ((await dbGetAllByIndex('soilSamples', 'locationId', loc.id)).length) locGroups.add('soilSample');
      if ((await dbGetAllByIndex('gwSamples', 'locationId', loc.id)).length) locGroups.add('gwSample');
      if ((await dbGetAllByIndex('svSamples', 'locationId', loc.id)).length) locGroups.add('svSample');
      if ((await dbGetAllByIndex('gwWellGauges', 'locationId', loc.id)).length) locGroups.add('gwWellGauge');
      if ((await dbGetAllByIndex('fieldMeasurements', 'locationId', loc.id)).length) locGroups.add('fieldMeasurement');
      if ((await dbGetAllByIndex('customRecords', 'locationId', loc.id)).length) locGroups.add('custom1');

      const locCb = el('input', { type: 'checkbox', class: 'export-checkbox' });
      const locSel = { cb: locCb, groups: new Map() };
      selected.locs.set(loc.id, locSel);
      locCb.addEventListener('change', () => {
        for (const g of locSel.groups.values()) { g.checked = locCb.checked; }
      });

      const locBlock = el('div', { class: 'export-loc' }, [
        el('div', { class: 'export-loc-row' }, [
          el('span', { class: 'name' }, loc.locationId),
          locCb
        ])
      ]);
      const groupList = {
        spatial: 'Spatial info',
        soilBorehole: 'Soil Boreholes',
        soilSample: 'Soil Samples',
        gwSample: 'Groundwater Samples',
        svSample: 'Soil Vapour Samples',
        gwWellGauge: 'Groundwater Well Gauges',
        fieldMeasurement: 'Field Measurements',
        custom1: 'Custom 1'
      };
      for (const [key, name] of Object.entries(groupList)) {
        if (!locGroups.has(key)) continue;
        const cb = el('input', { type: 'checkbox', class: 'export-checkbox' });
        locSel.groups.set(key, cb);
        locBlock.appendChild(el('div', { class: 'export-attr-row' }, [
          el('span', { class: 'name' }, name),
          cb
        ]));
      }
      treeContainer.appendChild(locBlock);
    }
  }

  async function runExport() {
    const projectId = parseInt(getVal('exp-proj'));
    const selLocs = [];
    for (const [locId, info] of selected.locs) {
      const selectedGroups = [];
      for (const [g, cb] of info.groups) if (cb.checked) selectedGroups.push(g);
      if (selectedGroups.length > 0) selLocs.push({ locId, groups: selectedGroups });
    }
    if (selLocs.length === 0) { await alertDialog('No locations / groups selected.', 'Export'); return; }
    await exportXlsx(projectId, selLocs);
  }

  rebuild();
}

// ===== Workbook export =====
async function exportXlsx(projectId, selLocs) {
  if (typeof XLSX === 'undefined') {
    await alertDialog('Spreadsheet library failed to load. Check your internet connection and reload the app.', 'Export error');
    return;
  }
  const proj = await dbGet('projects', projectId);
  const sheets = {};

  // ----- Project sheet -----
  sheets['Project'] = [
    ['Project_Number', 'Project_Name', 'Description', 'Client', 'Notes', 'Exported'],
    [proj.projectNumber, proj.projectName, proj.description, proj.client, proj.notes, new Date().toISOString()]
  ];

  // ----- Locations sheet -----
  const locRows = [['Location_Code', 'Location_Name', 'Alternate_Name', 'Description', 'Latitude', 'Longitude', 'Easting', 'Northing', 'Datum', 'Zone', 'GPS_Mode', 'Accuracy_m', 'Notes']];
  for (const { locId } of selLocs) {
    const loc = await dbGet('locations', locId);
    const sp = (await dbGet('spatial', locId)) || {};
    locRows.push([
      loc.locationId, loc.siteName, loc.alternateName, loc.description,
      sp.latitude ?? '', sp.longitude ?? '', sp.easting ?? '', sp.northing ?? '',
      'GDA2020', 'MGA54', sp.gpsMode || '', sp.accuracy ?? '', loc.notes
    ]);
  }
  if (locRows.length > 1) sheets['Locations'] = locRows;

  // ----- Schemas for the rest -----
  const boreRows = [['Location_Code', 'Borehole_ID', 'Drill_Date', 'Driller', 'Drilling_Method', 'Logger', 'Total_Depth_m', 'Notes']];
  const lithRows = [['Location_Code', 'Borehole_ID', 'Depth_From_m', 'Depth_To_m', 'Fill_Natural', 'Major_Constituent', 'Minor_Constituents', 'Grain_Size', 'Plasticity', 'Primary_Colour', 'Combination', 'Secondary_Colour', 'Colour_Shade', 'Moisture', 'Consistency_Cohesive', 'Consistency_Non_Cohesive', 'Grading', 'Particle_Shape', 'Inclusion_1', 'Inclusion_1_Amount', 'Inclusion_2', 'Inclusion_2_Amount', 'Inclusion_3', 'Inclusion_3_Amount', 'Notes']];
  const sampleRows = [['Sample_ID', 'Location_Code', 'Borehole_ID', 'Parent_Sample_ID', 'Sampled_Date_Time', 'Depth', 'Depth_Lower', 'Matrix', 'Sample_Type', 'Sample_Method', 'Sampler', 'Sample_Code', 'Notes']];
  const fmRows = [['Location_Code', 'Borehole_ID', 'Depth_From_m', 'Depth_To_m', 'Date_Time', 'Measurement_Type', 'Measurement', 'Units', 'Notes']];
  const customRows = [['Location_Code', 'Attribute_Type', 'Value', 'Date_Time', 'Notes']];
  const gaugeRows = [['Location_Code', 'Gauge_Date_Time', 'Well_Depth_m', 'Depth_To_Water_m', 'Standing_Water_Level_m', 'Notes']];
  const wellRows = [['Location_Code', 'Borehole_ID', 'Water_Intersection_Depth_m', 'Screen_From_m', 'Screen_To_m', 'Sand_From_m', 'Sand_To_m', 'Bentonite_From_m', 'Bentonite_To_m', 'Grout_From_m', 'Grout_To_m', 'Backfill_From_m', 'Backfill_To_m', 'Notes']];

  function parentFor(s, pool) {
    if (s.sampleType === 'Field_D' || s.sampleType === 'Interlab_D') {
      return pool.find(x => Math.abs((x.depthFrom||0) - (s.depthFrom||0)) < 1e-6 && x.sampleType === 'Normal')?.sampleId || '';
    }
    return '';
  }

  for (const { locId, groups } of selLocs) {
    const loc = await dbGet('locations', locId);
    if (groups.includes('soilBorehole')) {
      const bores = await dbGetAllByIndex('soilBoreholes', 'locationId', locId);
      for (const b of bores) {
        boreRows.push([loc.locationId, b.boreholeId, b.drillDate, b.driller, b.drillingMethod, b.logger, b.totalDepth, b.notes]);
        const liths = await dbGetAllByIndex('soilLithologies', 'boreholeId', b.id);
        liths.sort((a, b) => (a.depthFrom || 0) - (b.depthFrom || 0));
        for (const l of liths) {
          lithRows.push([loc.locationId, b.boreholeId, l.depthFrom, l.depthTo, l.fillNatural || '', l.majorConstituent, l.minorConstituents, l.grainSize, l.plasticity, l.primaryColour, l.combination, l.secondaryColour, l.colourShade, l.moisture, l.consistencyCohesive, l.consistencyNonCohesive, l.grading, l.particleShape, l.inclusion1, l.inclusion1Amount, l.inclusion2, l.inclusion2Amount, l.inclusion3, l.inclusion3Amount, l.notes]);
        }
        const samps = await dbGetAllByIndex('soilBoreSamples', 'boreholeId', b.id);
        for (const s of samps) {
          sampleRows.push([s.sampleId, loc.locationId, b.boreholeId, parentFor(s, samps), s.dateTime, s.depthFrom, s.depthTo, 'Soil', s.sampleType, s.sampleMethod, s.sampler, s.sampleCode, s.notes]);
        }
        const bfms = await dbGetAllByIndex('soilBoreFieldMeas', 'boreholeId', b.id);
        for (const f of bfms) {
          fmRows.push([loc.locationId, b.boreholeId, f.depthFrom, f.depthTo, f.dateTime, f.measurementType, f.measurement, f.units, f.notes]);
        }
        const wc = await dbGet('wellConstruction', b.id);
        if (wc) {
          wellRows.push([loc.locationId, b.boreholeId, wc.waterIntersectionDepth, wc.screenFrom, wc.screenTo, wc.sandFrom, wc.sandTo, wc.bentoniteFrom, wc.bentoniteTo, wc.groutFrom, wc.groutTo, wc.backfillFrom, wc.backfillTo, wc.notes]);
        }
      }
    }
    if (groups.includes('soilSample')) {
      const samps = await dbGetAllByIndex('soilSamples', 'locationId', locId);
      for (const s of samps) {
        sampleRows.push([s.sampleId, loc.locationId, '', parentFor(s, samps), s.dateTime, s.depthFrom, s.depthTo, 'Soil', s.sampleType, s.sampleMethod, s.sampler, s.sampleCode, s.notes]);
      }
    }
    if (groups.includes('gwSample')) {
      const samps = await dbGetAllByIndex('gwSamples', 'locationId', locId);
      for (const s of samps) {
        sampleRows.push([s.sampleId, loc.locationId, '', parentFor(s, samps), s.dateTime, s.depthFrom, s.depthTo, 'Water', s.sampleType, s.sampleMethod, s.sampler, s.sampleCode, s.notes]);
      }
    }
    if (groups.includes('svSample')) {
      const samps = await dbGetAllByIndex('svSamples', 'locationId', locId);
      for (const s of samps) {
        sampleRows.push([s.sampleId, loc.locationId, '', parentFor(s, samps), s.dateTime, s.depthFrom, s.depthTo, 'Vapour', s.sampleType, s.sampleMethod, s.sampler, s.sampleCode, s.notes]);
      }
    }
    if (groups.includes('gwWellGauge')) {
      const gauges = await dbGetAllByIndex('gwWellGauges', 'locationId', locId);
      for (const g of gauges) {
        const swl = (g.wellDepth != null && g.depthToWater != null) ? g.depthToWater : '';
        gaugeRows.push([loc.locationId, g.dateTime, g.wellDepth, g.depthToWater, swl, g.notes]);
      }
    }
    if (groups.includes('fieldMeasurement')) {
      const fms = await dbGetAllByIndex('fieldMeasurements', 'locationId', locId);
      for (const f of fms) {
        fmRows.push([loc.locationId, '', '', '', f.dateTime, f.measurementType, f.measurement, f.units, f.notes]);
      }
    }
    if (groups.includes('custom1')) {
      const customs = await dbGetAllByIndex('customRecords', 'locationId', locId);
      for (const c of customs) {
        customRows.push([loc.locationId, c.attributeType, c.value, c.dateTime, c.notes]);
      }
    }
  }

  if (boreRows.length > 1) sheets['Soil Boreholes'] = boreRows;
  if (lithRows.length > 1) sheets['Soil Lithology'] = lithRows;
  if (sampleRows.length > 1) sheets['Samples'] = sampleRows;
  if (fmRows.length > 1) sheets['Field Measurements'] = fmRows;
  if (gaugeRows.length > 1) sheets['GW Well Gauges'] = gaugeRows;
  if (wellRows.length > 1) sheets['GW Well Construction'] = wellRows;
  if (customRows.length > 1) sheets['Custom'] = customRows;

  // Build workbook
  const wb = XLSX.utils.book_new();
  for (const [sheetName, rows] of Object.entries(sheets)) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    // Auto-fit column widths approximately
    const colWidths = [];
    for (let c = 0; c < rows[0].length; c++) {
      let max = String(rows[0][c] || '').length;
      for (let r = 1; r < rows.length; r++) {
        const v = rows[r][c];
        const len = v == null ? 0 : String(v).length;
        if (len > max) max = len;
      }
      colWidths.push({ wch: Math.min(Math.max(max + 1, 10), 40) });
    }
    ws['!cols'] = colWidths;
    XLSX.utils.book_append_sheet(wb, ws, sheetName.substring(0, 31)); // 31 char sheet name limit
  }

  // Generate the file as an array buffer, then trigger one download
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const filename = `${proj.projectNumber}_LocDat_Export.xlsx`;
  triggerDownload(blob, filename);
  toast(`Exported ${Object.keys(sheets).length} sheet(s) → ${filename}`);
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 1000);
}

// ===== Screen: Photo Export =====
async function screenPhotoExport(projectId) {
  clearApp();
  const proj = await dbGet('projects', projectId);
  $app().appendChild(header({ title: 'Export Photos', breadcrumb: proj.projectName }));
  const content = el('div', { class: 'content' });
  const photos = await dbGetAllByIndex('photos', 'projectId', projectId);
  photos.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (photos.length === 0) {
    content.appendChild(el('p', {}, 'No photos for this project.'));
    $app().appendChild(content);
    return;
  }
  const selected = new Set();

  const counter = el('span', { class: 'text-small', style: 'margin-right:auto' }, `0 of ${photos.length} selected`);
  function updateCounter() { counter.textContent = `${selected.size} of ${photos.length} selected`; }

  const selectAllBtn = el('button', { class: 'btn btn-small', onclick: () => {
    const allSelected = selected.size === photos.length;
    selected.clear();
    if (!allSelected) for (const p of photos) selected.add(p.id);
    // refresh card classes
    document.querySelectorAll('.photo-card').forEach(card => {
      const id = parseInt(card.dataset.photoId);
      card.classList.toggle('selected', selected.has(id));
    });
    updateCounter();
    selectAllBtn.textContent = selected.size === photos.length ? 'Deselect All' : 'Select All';
  }}, 'Select All');

  const exportBtn = el('button', { class: 'btn btn-primary', onclick: async () => {
    if (selected.size === 0) { await alertDialog('Select at least one photo.', 'Export'); return; }
    if (typeof JSZip === 'undefined') {
      await alertDialog('Zip library failed to load. Check your internet connection and reload the app.', 'Export error');
      return;
    }
    const origLabel = exportBtn.textContent;
    exportBtn.disabled = true;
    exportBtn.textContent = `Building zip… (0/${selected.size})`;
    try {
      const zip = new JSZip();
      let n = 0;
      for (const id of selected) {
        const p = photos.find(x => x.id === id);
        if (!p) continue;
        // Avoid duplicate filenames (same base name from different items)
        let fname = p.filename;
        let dedupe = 1;
        while (zip.file(fname)) {
          fname = p.filename.replace(/(\.\w+)$/, `_${dedupe}$1`);
          dedupe++;
        }
        zip.file(fname, p.blob);
        n++;
        exportBtn.textContent = `Building zip… (${n}/${selected.size})`;
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const filename = `${proj.projectNumber || 'LocDat'}_Photos.zip`;
      triggerDownload(zipBlob, filename);
      toast(`Exported ${n} photo(s) → ${filename}`);
    } catch (err) {
      console.error(err);
      await alertDialog('Failed to build zip: ' + (err.message || err), 'Export error');
    } finally {
      exportBtn.disabled = false;
      exportBtn.textContent = origLabel;
    }
  }}, 'Export as Zip');

  const controlBar = el('div', { class: 'row', style: 'gap:10px; margin-bottom:10px; align-items:center' }, [
    counter,
    selectAllBtn,
    exportBtn
  ]);
  content.appendChild(controlBar);

  // Group by date
  const byDate = {};
  for (const p of photos) {
    const d = p.createdAt.slice(0, 10);
    (byDate[d] ||= []).push(p);
  }
  for (const [date, arr] of Object.entries(byDate)) {
    content.appendChild(el('div', { class: 'photo-date-header' }, date));
    const grid = el('div', { class: 'photo-grid' });
    for (const p of arr) {
      const url = URL.createObjectURL(p.blob);
      const card = el('div', { class: 'photo-card', 'data-photo-id': String(p.id), onclick: () => {
        if (selected.has(p.id)) { selected.delete(p.id); card.classList.remove('selected'); }
        else { selected.add(p.id); card.classList.add('selected'); }
        updateCounter();
        selectAllBtn.textContent = selected.size === photos.length ? 'Deselect All' : 'Select All';
      }}, [
        el('div', { class: 'check' }, '✓'),
        el('img', { src: url }),
        el('div', { class: 'fname' }, p.filename)
      ]);
      grid.appendChild(card);
    }
    content.appendChild(grid);
  }
  $app().appendChild(content);
}

// ===== Screen: Settings =====
async function screenSettings() {
  clearApp();
  $app().appendChild(header({ title: 'Settings' }));
  const content = el('div', { class: 'content' });
  const settings = await getSettings();
  const a = settings.autoIds || DEFAULT_SETTINGS.autoIds;
  const c = settings.customAttrGroup || DEFAULT_SETTINGS.customAttrGroup;

  content.appendChild(el('div', { class: 'settings-section' }, [
    el('h3', {}, 'Your Details'),
    formRow('Your Name:', textInput('set-username', settings.userName || '')),
    el('div', { class: 'text-small' }, 'Pre-populates as "Sampler" on new samples.')
  ]));

  content.appendChild(el('div', { class: 'settings-section' }, [
    el('h3', {}, 'Auto Generating IDs'),
    formRow('Location ID prefix:', textInput('set-loc', a.locationPrefix || '')),
    formRow('Soil Bore ID prefix:', textInput('set-sb', a.soilBorePrefix || '')),
    formRow('Soil Bore Sample prefix:', textInput('set-sbs', a.soilBoreSamplePrefix || '')),
    formRow('Soil Sample ID prefix:', textInput('set-ss', a.soilSamplePrefix || '')),
    formRow('GW Sample ID prefix:', textInput('set-gw', a.gwSamplePrefix || 'GW')),
    formRow('SV Sample ID prefix:', textInput('set-sv', a.svSamplePrefix || 'SV')),
    el('div', { class: 'text-small' }, 'Tokens: use [SoilBoreId] in Soil Bore Sample prefix to insert the parent bore ID.')
  ]));

  content.appendChild(el('div', { class: 'settings-section' }, [
    el('h3', {}, 'Custom Attribute Group'),
    formRow('Attribute Group Name:', textInput('set-cg-name', c.name || 'CUSTOM1')),
    formRow('Attribute 1 Name:', textInput('set-c1n', c.attr1Name || '')),
    formRow('Attribute 1 units:', textInput('set-c1u', c.attr1Units || '')),
    formRow('Attribute 2 Name:', textInput('set-c2n', c.attr2Name || '')),
    formRow('Attribute 2 units:', textInput('set-c2u', c.attr2Units || '')),
    formRow('Attribute 3 Name:', textInput('set-c3n', c.attr3Name || '')),
    formRow('Attribute 3 units:', textInput('set-c3u', c.attr3Units || ''))
  ]));

  content.appendChild(saveBar(async () => {
    settings.userName = getVal('set-username');
    settings.autoIds = {
      locationPrefix: getVal('set-loc'),
      soilBorePrefix: getVal('set-sb'),
      soilBoreSamplePrefix: getVal('set-sbs'),
      soilSamplePrefix: getVal('set-ss'),
      gwSamplePrefix: getVal('set-gw'),
      svSamplePrefix: getVal('set-sv')
    };
    settings.customAttrGroup = {
      name: getVal('set-cg-name'),
      attr1Name: getVal('set-c1n'), attr1Units: getVal('set-c1u'),
      attr2Name: getVal('set-c2n'), attr2Units: getVal('set-c2u'),
      attr3Name: getVal('set-c3n'), attr3Units: getVal('set-c3u')
    };
    await saveSettings(settings);
  }));

  // Logout section
  const authData = getAuthData();
  if (authData) {
    content.appendChild(el('div', { class: 'settings-section', style: 'border-top:1px solid #ddd; padding-top:20px; margin-top:20px' }, [
      el('h3', {}, 'Authentication'),
      el('button', { 
        class: 'btn btn-danger btn-small',
        onclick: async () => {
          if (await confirmDialog('This will log you out and require you to enter the password again on next launch.', 'Logout')) {
            clearAuthData();
            toast('Logged out');
            screenLogin();
          }
        }
      }, 'Logout')
    ]));
  }

  content.appendChild(el('div', { style: 'text-align:center; padding:20px 0' }, [
    el('button', { class: 'btn btn-small', onclick: () => navigate(screenAboutLocDat) }, 'About LocDat')
  ]));

  $app().appendChild(content);
}

// ===== Screen: About LocDat =====
function screenAboutLocDat() {
  clearApp();
  $app().appendChild(header({ title: 'About LocDat' }));
  const content = el('div', { class: 'content', style: 'padding:24px; text-align:center' });
  content.appendChild(el('p', { style: 'margin:16px 0; font-size:14px; color:#666' }, `© 2018 LocDat was designed by James Coley. All rights reserved.`));
  content.appendChild(el('p', { style: 'margin:16px 0; font-size:14px' }, [
    'Contact at ',
    el('a', { href: 'mailto:jamescoley1986@gmail.com', style: 'color:#8BC34A' }, 'jamescoley1986@gmail.com')
  ]));
  $app().appendChild(content);
}

// ===== Generic helper to build a GW or SV sample screen =====
// ESDAT Matrix: 'Water' for GW, 'Vapour' for SV
function buildMatrixSampleScreen(config) {
  return async function(sampId) {
    clearApp();
    const s = await dbGet(config.store, sampId);
    const loc = await dbGet('locations', s.locationId);
    const proj = await dbGet('projects', loc.projectId);

    $app().appendChild(header({ title: config.title, breadcrumb: proj.projectName, subtitle: loc.locationId }));
    const content = el('div', { class: 'content' });

    content.appendChild(el('div', { class: 'row', style: 'justify-content:flex-end' }, [
      el('button', { class: 'btn btn-danger btn-small', onclick: async () => {
        if (await confirmDialog(`Are you sure you want to delete ${s.sampleId}?`, 'Delete sample')) {
          await dbDelete(config.store, sampId);
          setDirty(false); toast('Sample deleted'); navBack();
        }
      }}, 'Delete ' + config.title)
    ]));

    const idI = textInput('m-id', s.sampleId);
    const autoBtn = el('button', { class: 'btn btn-small', onclick: async () => {
      const currentType = getVal('m-type') || s.sampleType || 'Normal';
      if (currentType === 'Field_D' || currentType === 'Interlab_D') {
        idI.value = await nextDuplicateId(loc.projectId, currentType);
      } else {
        const settings = await getSettings();
        const prefix = settings.autoIds?.[config.prefixKey] || config.defaultPrefix;
        const existing = await dbGetAllByIndex(config.store, 'locationId', loc.id);
        idI.value = nextAutoId(prefix, existing.map(e => e.sampleId));
      }
      setDirty();
    }}, 'Auto');
    content.appendChild(el('div', { class: 'form-field' }, [
      el('label', {}, config.title + ' ID:'),
      el('div', { class: 'field-group' }, [idI, autoBtn])
    ]));

    content.appendChild(formRow(config.fromLabel, depthInputWithButtons('m-from', s.depthFrom ?? 0)));
    content.appendChild(formRow(config.toLabel, depthInputWithButtons('m-to', s.depthTo ?? 0)));

    const dtI = textInput('m-dt', s.dateTime || '');
    content.appendChild(el('div', { class: 'form-field' }, [
      el('label', {}, 'Date / Time:'),
      el('div', { class: 'field-group' }, [
        dtI, el('button', { class: 'btn btn-small', onclick: () => { dtI.value = nowStr(); setDirty(); }}, 'Now')
      ])
    ]));
    content.appendChild(formRow('Sample Type:', selectInput('m-type', SAMPLE_TYPES, s.sampleType || 'Normal')));
    content.appendChild(formRow('Sample Method:', selectInput('m-method', config.methods, s.sampleMethod || '')));
    content.appendChild(formRow('Sampler:', textInput('m-sampler', s.sampler || '')));
    content.appendChild(formRow('Sample Code:', textInput('m-code', s.sampleCode || '')));

    content.appendChild(el('div', { class: 'form-field vertical' }, [
      el('label', {}, config.title + ' Notes:'),
      textArea('m-notes', s.notes || '')
    ]));

    content.appendChild(photoPreviewUI(`loc:${loc.id}:${config.photoKey}:${sampId}`, loc.projectId, `${loc.locationId}_${s.sampleId}`, config.title + ' Photo'));

    const dupAction = async (dupType) => {
      const dup = { ...s };
      delete dup.id;
      dup.sampleType = dupType;
      dup.sampleId = await nextDuplicateId(loc.projectId, dupType);
      dup.createdAt = new Date().toISOString();
      dup.id = await dbAdd(config.store, dup);
      toast('Duplicate created');
      navigate(config.screen, dup.id);
    };
    content.appendChild(el('div', { style: 'text-align:center; padding:12px 0; display:flex; gap:8px; justify-content:center' }, [
      el('button', { class: 'btn', onclick: () => dupAction('Field_D') }, 'Create FD'),
      el('button', { class: 'btn', onclick: () => dupAction('Interlab_D') }, 'Create ILD')
    ]));

    content.appendChild(saveBar(async () => {
      s.sampleId = idI.value.trim() || s.sampleId;
      s.depthFrom = parseFloat(getVal('m-from')) || 0;
      s.depthTo = parseFloat(getVal('m-to')) || 0;
      s.dateTime = dtI.value;
      s.sampleType = getVal('m-type');
      s.sampleMethod = getVal('m-method');
      s.sampler = getVal('m-sampler');
      s.sampleCode = getVal('m-code');
      s.notes = getVal('m-notes');
      await dbPut(config.store, s);
    }));

    $app().appendChild(content);
  };
}

const screenGwSample = buildMatrixSampleScreen({
  store: 'gwSamples', title: 'Groundwater Sample',
  prefixKey: 'gwSamplePrefix', defaultPrefix: 'GW',
  photoKey: 'gwsamp',
  fromLabel: 'Sample Depth from (m):', toLabel: 'Sample Depth to (m):',
  methods: SAMPLE_METHODS_GW,
  get screen() { return screenGwSample; }
});
const screenSvSample = buildMatrixSampleScreen({
  store: 'svSamples', title: 'Soil Vapour Sample',
  prefixKey: 'svSamplePrefix', defaultPrefix: 'SV',
  photoKey: 'svsamp',
  fromLabel: 'Sample Depth from (m):', toLabel: 'Sample Depth to (m):',
  methods: SAMPLE_METHODS_SV,
  get screen() { return screenSvSample; }
});

async function createAndEditGwSample(locId) {
  const settings = await getSettings();
  const prefix = settings.autoIds?.gwSamplePrefix || 'GW';
  const existing = await dbGetAllByIndex('gwSamples', 'locationId', locId);
  const id = nextAutoId(prefix, existing.map(e => e.sampleId));
  const obj = {
    locationId: locId, sampleId: id,
    depthFrom: 0, depthTo: 0,
    dateTime: nowStr(),
    sampleType: 'Normal', sampleMethod: '',
    sampler: settings.userName || '', sampleCode: '', notes: '',
    createdAt: new Date().toISOString()
  };
  obj.id = await dbAdd('gwSamples', obj);
  navigate(screenGwSample, obj.id);
}
async function createAndEditSvSample(locId) {
  const settings = await getSettings();
  const prefix = settings.autoIds?.svSamplePrefix || 'SV';
  const existing = await dbGetAllByIndex('svSamples', 'locationId', locId);
  const id = nextAutoId(prefix, existing.map(e => e.sampleId));
  const obj = {
    locationId: locId, sampleId: id,
    depthFrom: 0, depthTo: 0,
    dateTime: nowStr(),
    sampleType: 'Normal', sampleMethod: '',
    sampler: settings.userName || '', sampleCode: '', notes: '',
    createdAt: new Date().toISOString()
  };
  obj.id = await dbAdd('svSamples', obj);
  navigate(screenSvSample, obj.id);
}

// ===== Screen: GW Well Gauge =====
async function screenGwWellGauge(gaugeId) {
  clearApp();
  const g = await dbGet('gwWellGauges', gaugeId);
  const loc = await dbGet('locations', g.locationId);
  const proj = await dbGet('projects', loc.projectId);

  $app().appendChild(header({ title: 'GW Well Gauge', breadcrumb: proj.projectName, subtitle: loc.locationId }));
  const content = el('div', { class: 'content' });

  content.appendChild(el('div', { class: 'row', style: 'justify-content:flex-end' }, [
    el('button', { class: 'btn btn-danger btn-small', onclick: async () => {
      if (await confirmDialog('Delete this GW well gauge record?', 'Delete gauge')) {
        await dbDelete('gwWellGauges', gaugeId);
        setDirty(false); toast('Gauge deleted'); navBack();
      }
    }}, 'Delete Well Gauge')
  ]));

  const dtI = textInput('g-dt', g.dateTime || '');
  content.appendChild(el('div', { class: 'form-field' }, [
    el('label', {}, 'Date / Time:'),
    el('div', { class: 'field-group' }, [
      dtI, el('button', { class: 'btn btn-small', onclick: () => { dtI.value = nowStr(); setDirty(); }}, 'Now')
    ])
  ]));
  content.appendChild(formRow('Well Depth (m):', depthInputWithButtons('g-wd', g.wellDepth ?? '')));
  content.appendChild(formRow('Depth to Water (m):', depthInputWithButtons('g-dtw', g.depthToWater ?? '')));
  content.appendChild(formRow('Gauged By:', textInput('g-by', g.gaugedBy || '')));
  content.appendChild(el('div', { class: 'form-field vertical' }, [
    el('label', {}, 'Gauge Notes:'),
    textArea('g-notes', g.notes || '')
  ]));

  content.appendChild(photoPreviewUI(`gauge:${gaugeId}`, proj.id, `${loc.locationId}_gauge`, 'Gauge Photo'));

  content.appendChild(saveBar(async () => {
    g.dateTime = dtI.value;
    g.wellDepth = parseFloat(getVal('g-wd')) || null;
    g.depthToWater = parseFloat(getVal('g-dtw')) || null;
    g.gaugedBy = getVal('g-by');
    g.notes = getVal('g-notes');
    await dbPut('gwWellGauges', g);
  }));

  $app().appendChild(content);
}

async function createAndEditGwWellGauge(locId) {
  const settings = await getSettings();
  const obj = {
    locationId: locId,
    dateTime: nowStr(),
    wellDepth: null, depthToWater: null,
    gaugedBy: settings.userName || '',
    notes: '',
    createdAt: new Date().toISOString()
  };
  obj.id = await dbAdd('gwWellGauges', obj);
  navigate(screenGwWellGauge, obj.id);
}

// ===== Init =====
function showFatalError(htmlContent) {
  document.body.innerHTML = `<div style="padding:24px;font-family:system-ui,sans-serif;color:#111;max-width:640px;margin:0 auto">${htmlContent}</div>`;
}

async function initApp() {
  // Populate version footer
  const vf = document.getElementById('version-footer');
  if (vf) vf.textContent = `${APP_STAGE} · v${APP_VERSION}`;
  // Detect file:// — IndexedDB usually won't persist and may throw in modern Chrome
  if (location.protocol === 'file:') {
    showFatalError(`
      <h2 style="color:#E0594E">Can't run from file://</h2>
      <p>Chrome blocks IndexedDB (local storage) when HTML files are opened directly from disk, so LocDat needs to be served from a simple local web server.</p>
      <p><strong>Option 1 — Use the included launcher:</strong></p>
      <ul>
        <li>Windows: double-click <code>start-windows.bat</code></li>
        <li>Mac/Linux: run <code>./start-unix.sh</code> in Terminal</li>
      </ul>
      <p><strong>Option 2 — Launch manually:</strong> open a terminal in this folder and run:
        <pre style="background:#f0f0f0;padding:10px;border-radius:4px">python3 -m http.server 8000</pre>
        Then open <a href="http://localhost:8000">http://localhost:8000</a> in Chrome.</p>
      <p><strong>Option 3 — Deploy online</strong> (GitHub Pages, Netlify Drop, etc.) and open the hosted URL.</p>
    `);
    return;
  }
  // Check required CDN libraries loaded (proj4 + Leaflet are critical for spatial; XLSX/JSZip checked at export time)
  if (typeof proj4 === 'undefined' || typeof L === 'undefined') {
    showFatalError(`
      <h2 style="color:#E0594E">Map libraries failed to load</h2>
      <p>LocDat needs these libraries (loaded automatically from the web):</p>
      <ul>
        <li>${typeof proj4 !== 'undefined' ? '✅' : '❌'} proj4js (coordinate conversion)</li>
        <li>${typeof L !== 'undefined' ? '✅' : '❌'} Leaflet (map display)</li>
        <li>${typeof XLSX !== 'undefined' ? '✅' : '❌'} SheetJS (Excel export)</li>
        <li>${typeof JSZip !== 'undefined' ? '✅' : '❌'} JSZip (photo zip)</li>
      </ul>
      <p>Your network blocked one or both of these. Check your internet connection, or try a different network.</p>
      <p>If on a corporate network, the domains to allow are <code>unpkg.com</code> and <code>cdnjs.cloudflare.com</code>.</p>
    `);
    return;
  }
  try {
    await openDB();
    await getSettings(); // initialize defaults
    
    // Check authentication status
    const authStatus = await checkAuthStatus();
    if (!authStatus.authenticated) {
      screenLogin();
    } else {
      screenHome();
    }
  } catch (err) {
    console.error(err);
    showFatalError(`<h2 style="color:#E0594E">Error initialising app</h2><p>${err.message || err}</p><p>Try clearing this site's data in Chrome settings, then reload.</p>`);
  }
}

window.addEventListener('load', initApp);

// Warn on page close with unsaved changes
window.addEventListener('beforeunload', (e) => {
  if (state.dirty) { e.preventDefault(); e.returnValue = ''; }
});
