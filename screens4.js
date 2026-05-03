// ===== LocDat screens4.js — Project Hub & COC Batch (v0.4.0) =====

// ----- COC Batch helpers -----

function makeCocBatchName(projNumber, dispatchDate, laboratory) {
  const lab = (laboratory || 'Lab').replace(/\s+/g, '_');
  return `${projNumber || 'PRJ'}_${dispatchDate || 'undated'}_${lab}`;
}

// Returns the best COC batch ID for a new sample:
// - Normal / Field_D  → today's Primary batch (first one if multiple)
// - Interlab_D        → today's Secondary batch, fallback to Primary
async function getDefaultCocBatchId(projectId, sampleType) {
  const today = new Date().toISOString().slice(0, 10);
  const batches = await dbGetAllByIndex('cocBatches', 'projectId', projectId);
  const active  = batches.filter(b => !b.sent && b.dispatchDate === today);

  if (sampleType === 'Interlab_D') {
    const sec = active.find(b => b.labRole === 'Secondary');
    if (sec) return sec.id;
  }
  const pri = active.find(b => b.labRole === 'Primary');
  return pri ? pri.id : null;
}

// Fetch all field samples across every store that belong to a given batch,
// enriched with the location's display code.
async function getAllSamplesForBatch(batchId) {
  const stores = ['soilBoreSamples', 'soilSamples', 'gwSamples', 'svSamples', 'otherSamples'];
  const results = [];
  const locCache = new Map();

  const getLocCode = async (locId) => {
    if (!locId) return '—';
    if (locCache.has(locId)) return locCache.get(locId);
    const loc = await dbGet('locations', locId);
    const code = loc ? (loc.locationId || '—') : '—';
    locCache.set(locId, code);
    return code;
  };

  for (const store of stores) {
    const all = await dbGetAll(store);
    for (const s of all) {
      if (s.cocBatchId === batchId) {
        let locCode = '—';
        if (store === 'soilBoreSamples' && s.boreholeId) {
          const bore = await dbGet('soilBoreholes', s.boreholeId);
          if (bore) locCode = await getLocCode(bore.locationId);
        } else if (s.locationId) {
          locCode = await getLocCode(s.locationId);
        }
        results.push({ ...s, _store: store, _locCode: locCode });
      }
    }
  }
  // Sort by sample ID
  results.sort((a, b) => (a.sampleId || '').localeCompare(b.sampleId || ''));
  return results;
}

// Build a Map<batchId → batchName> for use during export
async function buildBatchNameMap(projectId) {
  const batches = await dbGetAllByIndex('cocBatches', 'projectId', projectId);
  const map = new Map();
  for (const b of batches) map.set(b.id, b.batchName);
  return map;
}

// ----- COC Batch select widget (used in all sample forms) -----
// Returns the wrapping form-field div.  The <select> has id='samp-coc'.
// After quick-create the select is refreshed in-place.
async function buildCocBatchField(projectId, currentBatchId, sampleType) {
  const batches = await dbGetAllByIndex('cocBatches', 'projectId', projectId);
  const defaultId = (currentBatchId != null) ? currentBatchId
                  : await getDefaultCocBatchId(projectId, sampleType);

  const sel = document.createElement('select');
  sel.id = 'samp-coc';
  sel.style.flex = '1';
  sel.addEventListener('change', () => setDirty());

  const populate = (batches, selectedId) => {
    while (sel.firstChild) sel.removeChild(sel.firstChild);
    const none = document.createElement('option');
    none.value = '';
    none.textContent = '— No batch —';
    sel.appendChild(none);
    for (const b of batches) {
      const opt = document.createElement('option');
      opt.value = String(b.id);
      const sent = b.sent ? ' ✓SENT' : '';
      opt.textContent = `${b.batchName} (${b.labRole})${sent}`;
      // Sent batches are disabled for new assignment but selectable if already assigned
      if (b.sent && String(b.id) !== String(selectedId)) opt.disabled = true;
      if (String(b.id) === String(selectedId)) opt.selected = true;
      sel.appendChild(opt);
    }
    if (!selectedId) sel.value = '';
  };

  populate(batches, defaultId);

  const newBtn = el('button', { class: 'btn btn-small', type: 'button', onclick: async () => {
    const batch = await quickCreateCocBatch(projectId);
    if (batch) {
      const updated = await dbGetAllByIndex('cocBatches', 'projectId', projectId);
      populate(updated, batch.id);
      setDirty();
    }
  }}, '+ New');

  return el('div', { class: 'form-field' }, [
    el('label', {}, 'COC Batch:'),
    el('div', { class: 'field-group' }, [sel, newBtn])
  ]);
}

// Quick-create modal: date + lab + role only.  Returns the created batch or null.
async function quickCreateCocBatch(projectId) {
  const settings = await getSettings();
  const proj     = await dbGet('projects', projectId);
  const today    = new Date().toISOString().slice(0, 10);
  const d        = settings.cocDefaults || {};

  return new Promise(resolve => {
    const dateI = el('input', { type: 'date', id: 'qcoc-date', value: today, oninput: () => {} });
    const labI  = textInput('qcoc-lab', '');
    const roleI = document.createElement('select');
    roleI.id = 'qcoc-role';
    for (const r of COC_LAB_ROLES) {
      const o = document.createElement('option');
      o.value = r; o.textContent = r;
      roleI.appendChild(o);
    }

    const m = modal([
      el('h3', {}, 'New COC Batch'),
      formRow('Dispatch Date:', dateI),
      formRow('Laboratory:', labI),
      formRow('Lab Role:', roleI),
      el('div', { class: 'modal-actions' }, [
        el('button', { class: 'btn btn-primary', onclick: async () => {
          const dispatchDate = dateI.value || today;
          const laboratory   = labI.value.trim() || 'Lab';
          const labRole      = roleI.value || 'Primary';
          const batchName    = makeCocBatchName(proj.projectNumber, dispatchDate, laboratory);
          const batch = {
            projectId,
            batchName,
            dispatchDate,
            laboratory,
            labRole,
            dispatchContactName:  d.dispatchContactName  || '',
            dispatchContactPhone: d.dispatchContactPhone || '',
            dispatchContactEmail: d.dispatchContactEmail || '',
            resultsEmail1: d.resultsEmail1 || '',
            resultsEmail2: d.resultsEmail2 || '',
            sent: false,
            notes: '',
            createdAt: new Date().toISOString()
          };
          batch.id = await dbAdd('cocBatches', batch);
          setDirty(false);  // batch is saved — clear dirty so navigate() doesn't prompt discard
          m.close();
          toast('COC Batch created');
          resolve(batch);
        }}, 'Save & Create'),
        el('button', { class: 'btn', onclick: () => { m.close(); resolve(null); }}, 'Cancel')
      ])
    ]);
  });
}

// ----- Screen: Project Hub -----
async function screenProjectHub(projectId) {
  clearApp();
  const proj = await dbGet('projects', projectId);
  $app().appendChild(header({ title: proj.projectName, breadcrumb: proj.projectNumber || 'Project' }));
  const content = el('div', { class: 'content' });

  // ---- Locations section ----
  const locations = await dbGetAllByIndex('locations', 'projectId', projectId);
  locations.sort((a, b) => a.id - b.id);

  let locsOpen = true;
  const locsBody = el('div', { class: 'hub-section-body' });
  const locsToggle = el('button', { class: 'hub-toggle', onclick: () => {
    locsOpen = !locsOpen;
    locsBody.style.display = locsOpen ? '' : 'none';
    locsToggle.textContent = locsOpen ? '▾' : '▸';
  }}, '▾');

  const locsHeader = el('div', { class: 'hub-section-header' }, [
    el('h3', {}, `Locations (${locations.length})`),
    locsToggle,
    el('button', { class: 'btn btn-small hub-add', onclick: async () => {
      const newLoc = await createNewLocation(projectId);
      state.currentLocationId = newLoc.id;
      navigate(screenLocations, projectId);
    }}, '+ Add')
  ]);

  for (const loc of locations) {
    const row = el('div', { class: 'hub-list-item', onclick: () => {
      state.currentLocationId = loc.id;
      navigate(screenLocations, projectId);
    }}, [
      el('div', { class: 'hub-item-main' }, [
        el('span', { class: 'hub-item-id' }, loc.locationId || '(new)'),
        el('span', { class: 'hub-item-name' }, loc.siteName || '')
      ]),
      el('span', { class: 'hub-item-arrow' }, '›')
    ]);
    locsBody.appendChild(row);
  }

  if (locations.length === 0) {
    locsBody.appendChild(el('p', { class: 'hub-empty' }, 'No locations yet. Tap + Add to create one.'));
  }

  content.appendChild(el('div', { class: 'hub-section' }, [locsHeader, locsBody]));

  // ---- COC Batches section ----
  const batches = await dbGetAllByIndex('cocBatches', 'projectId', projectId);
  batches.sort((a, b) => b.id - a.id); // newest first

  let cocsOpen = true;
  const cocsBody = el('div', { class: 'hub-section-body' });
  const cocsToggle = el('button', { class: 'hub-toggle', onclick: () => {
    cocsOpen = !cocsOpen;
    cocsBody.style.display = cocsOpen ? '' : 'none';
    cocsToggle.textContent = cocsOpen ? '▾' : '▸';
  }}, '▾');

  const cocsHeader = el('div', { class: 'hub-section-header' }, [
    el('h3', {}, `COC Batches (${batches.length})`),
    cocsToggle,
    el('button', { class: 'btn btn-small hub-add', onclick: async () => {
      await createAndEditCocBatch(projectId);
    }}, '+ New')
  ]);

  for (const b of batches) {
    const sentBadge = b.sent ? el('span', { class: 'badge badge-sent' }, 'SENT') : null;
    const roleBadge = el('span', { class: `badge badge-${b.labRole === 'Primary' ? 'primary' : 'secondary'}` }, b.labRole);
    const row = el('div', { class: 'hub-list-item', onclick: () => navigate(screenCocBatch, b.id) }, [
      el('div', { class: 'hub-item-main' }, [
        el('div', { style: 'display:flex; gap:6px; align-items:center; flex-wrap:wrap' }, [
          el('span', { class: 'hub-item-id' }, b.batchName),
          roleBadge,
          ...(sentBadge ? [sentBadge] : [])
        ]),
        el('span', { class: 'hub-item-name' }, b.dispatchDate + (b.laboratory ? ' · ' + b.laboratory : ''))
      ]),
      el('span', { class: 'hub-item-arrow' }, '›')
    ]);
    cocsBody.appendChild(row);
  }

  if (batches.length === 0) {
    cocsBody.appendChild(el('p', { class: 'hub-empty' }, 'No COC batches yet. Tap + New to create one.'));
  }

  content.appendChild(el('div', { class: 'hub-section' }, [cocsHeader, cocsBody]));
  $app().appendChild(content);
}

// ----- Screen: COC Batch Detail -----
async function screenCocBatch(batchId) {
  clearApp();
  const b    = await dbGet('cocBatches', batchId);
  const proj = await dbGet('projects', b.projectId);
  const readOnly = b.sent;

  $app().appendChild(header({ title: 'COC Batch', breadcrumb: proj.projectName, subtitle: b.batchName }));
  const content = el('div', { class: 'content' });

  // Sent banner
  if (readOnly) {
    content.appendChild(el('div', { class: 'sent-banner', style: 'display:flex; align-items:center; gap:12px' }, [
      el('span', { style: 'flex:1' }, '✓ This batch has been marked as SENT and is locked.'),
      el('button', { class: 'btn btn-small', style: 'white-space:nowrap', onclick: async () => {
        if (await confirmDialog('Unlock this batch to allow editing? You can re-send it afterwards.', 'Unlock Batch', 'Unlock', 'Cancel')) {
          b.sent = false;
          b.updatedAt = new Date().toISOString();
          await dbPut('cocBatches', b);
          setDirty(false);
          toast('Batch unlocked');
          navigate(screenCocBatch, batchId);
        }
      }}, 'Unlock')
    ]));
  }

  // Delete button
  if (!readOnly) {
    content.appendChild(el('div', { class: 'row', style: 'justify-content:flex-end' }, [
      el('button', { class: 'btn btn-danger btn-small', onclick: async () => {
        if (await confirmDialog(`Delete batch "${b.batchName}"? This cannot be undone.`, 'Delete COC Batch')) {
          await dbDelete('cocBatches', batchId);
          setDirty(false); toast('Batch deleted'); navBack();
        }
      }}, 'Delete Batch')
    ]));
  }

  // Dispatch fields
  const dispDateI = el('input', { type: 'date', id: 'coc-date', value: b.dispatchDate || '', disabled: readOnly });
  dispDateI.addEventListener('change', () => {
    setDirty();
    refreshBatchName();
  });

  const labI = textInput('coc-lab', b.laboratory || '');
  labI.addEventListener('input', refreshBatchName);
  if (readOnly) labI.setAttribute('disabled', true);

  const roleI = document.createElement('select');
  roleI.id = 'coc-role';
  if (readOnly) roleI.disabled = true;
  for (const r of COC_LAB_ROLES) {
    const o = document.createElement('option');
    o.value = r; o.textContent = r;
    if (r === b.labRole) o.selected = true;
    roleI.appendChild(o);
  }
  roleI.addEventListener('change', () => setDirty());

  const nameDisplay = el('div', { style: 'font-weight:600; color:#8BC34A; font-size:14px; padding:4px 0 8px' }, b.batchName || '');
  function refreshBatchName() {
    const nm = makeCocBatchName(proj.projectNumber, dispDateI.value, labI.value.trim());
    nameDisplay.textContent = nm;
    setDirty();
  }

  content.appendChild(nameDisplay);
  content.appendChild(formRow('Dispatch Date:', dispDateI));
  content.appendChild(formRow('Laboratory:', labI));
  content.appendChild(el('div', { class: 'form-field' }, [
    el('label', {}, 'Lab Role:'), roleI
  ]));

  // Contact info
  content.appendChild(el('div', { class: 'settings-section', style: 'margin-top:12px' }, [
    el('h3', {}, 'Dispatch Contact')
  ]));
  const cnameI  = textInput('coc-cname',  b.dispatchContactName  || ''); if (readOnly) cnameI.disabled  = true;
  const cphoneI = textInput('coc-cphone', b.dispatchContactPhone || ''); if (readOnly) cphoneI.disabled = true;
  const cemailI = textInput('coc-cemail', b.dispatchContactEmail || ''); if (readOnly) cemailI.disabled = true;
  content.appendChild(formRow('Contact Name:',  cnameI));
  content.appendChild(formRow('Contact Phone:', cphoneI));
  content.appendChild(formRow('Contact Email:', cemailI));

  content.appendChild(el('div', { class: 'settings-section', style: 'margin-top:12px' }, [
    el('h3', {}, 'Lab Results Email')
  ]));
  const em1I = textInput('coc-em1', b.resultsEmail1 || ''); if (readOnly) em1I.disabled = true;
  const em2I = textInput('coc-em2', b.resultsEmail2 || ''); if (readOnly) em2I.disabled = true;
  content.appendChild(formRow('Results Email 1:', em1I));
  content.appendChild(formRow('Results Email 2:', em2I));

  content.appendChild(el('div', { class: 'form-field vertical' }, [
    el('label', {}, 'Notes:'),
    textArea('coc-notes', b.notes || '')
  ]));

  // Mark as Sent button
  if (!readOnly) {
    content.appendChild(el('div', { style: 'text-align:center; padding:12px 0' }, [
      el('button', { class: 'btn', style: 'background:#E0594E; color:#fff', onclick: async () => {
        if (await confirmDialog('Mark this batch as SENT? This will lock it — no new samples can be added.', 'Mark as Sent', 'Mark as Sent', 'Cancel')) {
          await saveCocBatch(b, proj);
          b.sent = true;
          await dbPut('cocBatches', b);
          setDirty(false);
          toast('Batch marked as Sent');
          navigate(screenCocBatch, batchId);
        }
      }}, '✓ Mark as Sent')
    ]));
  }

  // Save bar (hidden if sent)
  if (!readOnly) {
    content.appendChild(saveBar(async () => {
      await saveCocBatch(b, proj);
    }));
  }

  // Assigned samples list
  content.appendChild(el('div', { class: 'settings-section', style: 'margin-top:20px' }, [
    el('h3', {}, 'Samples in this Batch')
  ]));
  const sampList = el('div', { class: 'coc-sample-list' });
  const samplesInBatch = await getAllSamplesForBatch(batchId);
  if (samplesInBatch.length === 0) {
    sampList.appendChild(el('p', { class: 'hub-empty' }, 'No samples assigned yet.'));
  } else {
    // Column header
    sampList.appendChild(el('div', { class: 'coc-sample-header' }, [
      el('span', {}, 'Sample ID'),
      el('span', {}, 'Location'),
      el('span', {}, 'Date / Time'),
      el('span', {}, 'Matrix'),
      el('span', {}, 'Containers')
    ]));
    for (const s of samplesInBatch) {
      const containers = Array.isArray(s.containers) && s.containers.length > 0
        ? s.containers.join(', ')
        : '—';
      sampList.appendChild(el('div', { class: 'coc-sample-row coc-sample-row--cols' }, [
        el('span', { class: 'coc-col-id' }, s.sampleId || '—'),
        el('span', { class: 'coc-col' }, s._locCode || '—'),
        el('span', { class: 'coc-col' }, s.dateTime || '—'),
        el('span', { class: 'coc-col' }, s.sampleMatrix || '—'),
        el('span', { class: 'coc-col coc-col--containers' }, containers)
      ]));
    }
  }
  content.appendChild(sampList);

  // QC Samples section
  content.appendChild(el('div', { class: 'settings-section', style: 'margin-top:20px' }, [
    el('h3', {}, 'Field QC Samples')
  ]));

  if (!readOnly) {
    const qcBtnRow = el('div', { style: 'display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px' }, [
      el('button', { class: 'btn btn-small', onclick: () => createAndEditCocQcSample(batchId, 'RINSE') }, '+ Equipment Rinse'),
      el('button', { class: 'btn btn-small', onclick: () => createAndEditCocQcSample(batchId, 'TB')    }, '+ Trip Blank'),
      el('button', { class: 'btn btn-small', onclick: () => createAndEditCocQcSample(batchId, 'TS')    }, '+ Trip Spike')
    ]);
    content.appendChild(qcBtnRow);
  }

  const qcSamples = await dbGetAllByIndex('cocQcSamples', 'cocBatchId', batchId);
  const qcList = el('div', { class: 'coc-sample-list' });
  if (qcSamples.length === 0) {
    qcList.appendChild(el('p', { class: 'hub-empty' }, 'No QC samples yet.'));
  } else {
    for (const q of qcSamples) {
      qcList.appendChild(el('div', { class: 'hub-list-item', onclick: () => navigate(screenCocQcSample, q.id) }, [
        el('div', { class: 'hub-item-main' }, [
          el('span', { class: 'hub-item-id' }, q.sampleId || '—'),
          el('span', { class: 'hub-item-name' }, COC_QC_LABELS[q.sampleType] || q.sampleType)
        ]),
        el('span', { class: 'hub-item-arrow' }, '›')
      ]));
    }
  }
  content.appendChild(qcList);
  $app().appendChild(content);

  async function saveCocBatch(b, proj) {
    b.dispatchDate        = dispDateI.value;
    b.laboratory          = labI.value.trim();
    b.labRole             = roleI.value;
    b.batchName           = makeCocBatchName(proj.projectNumber, b.dispatchDate, b.laboratory);
    b.dispatchContactName  = getVal('coc-cname');
    b.dispatchContactPhone = getVal('coc-cphone');
    b.dispatchContactEmail = getVal('coc-cemail');
    b.resultsEmail1        = getVal('coc-em1');
    b.resultsEmail2        = getVal('coc-em2');
    b.notes                = getVal('coc-notes');
    b.updatedAt            = new Date().toISOString();
    await dbPut('cocBatches', b);
  }
}

// ----- Screen: COC QC Sample -----
async function screenCocQcSample(qcId) {
  clearApp();
  const q = await dbGet('cocQcSamples', qcId);
  const b = await dbGet('cocBatches', q.cocBatchId);
  const p = await dbGet('projects', b.projectId);

  $app().appendChild(header({
    title: COC_QC_LABELS[q.sampleType] || q.sampleType,
    breadcrumb: b.batchName,
    subtitle: q.sampleId || ''
  }));
  const content = el('div', { class: 'content' });

  content.appendChild(el('div', { class: 'row', style: 'justify-content:flex-end' }, [
    el('button', { class: 'btn btn-danger btn-small', onclick: async () => {
      if (await confirmDialog(`Delete ${q.sampleId || 'this QC sample'}?`, 'Delete')) {
        await dbDelete('cocQcSamples', qcId);
        setDirty(false); toast('QC sample deleted'); navBack();
      }
    }}, 'Delete')
  ]));

  const idI = textInput('qc-id', q.sampleId || '');
  content.appendChild(el('div', { class: 'form-field' }, [
    el('label', {}, 'Sample ID:'),
    idI
  ]));

  content.appendChild(formRow('Sample Type:', el('span', { style: 'padding:8px 4px; font-weight:600' }, COC_QC_LABELS[q.sampleType] + ' (' + q.sampleType + ')')));

  const dtI = textInput('qc-dt', q.dateTime || '');
  content.appendChild(el('div', { class: 'form-field' }, [
    el('label', {}, 'Date / Time:'),
    el('div', { class: 'field-group' }, [
      dtI, el('button', { class: 'btn btn-small', onclick: () => { dtI.value = nowStr(); setDirty(); }}, 'Now')
    ])
  ]));

  const containerBg = multiButtonGroup('qc-containers', SAMPLE_CONTAINERS, q.containers || []);
  content.appendChild(el('div', { class: 'form-field vertical' }, [
    el('label', {}, 'Containers:'),
    containerBg
  ]));

  content.appendChild(el('div', { class: 'form-field vertical' }, [
    el('label', {}, 'Notes:'),
    textArea('qc-notes', q.notes || '')
  ]));

  content.appendChild(saveBar(async () => {
    q.sampleId  = idI.value.trim() || q.sampleId;
    q.dateTime  = dtI.value;
    q.containers = containerBg.values;
    q.notes     = getVal('qc-notes');
    q.updatedAt = new Date().toISOString();
    await dbPut('cocQcSamples', q);
  }));

  $app().appendChild(content);
}

// ----- Create helpers -----
async function createAndEditCocBatch(projectId) {
  const batch = await quickCreateCocBatch(projectId);
  if (batch) navigate(screenCocBatch, batch.id);
}

async function createAndEditCocQcSample(batchId, sampleType) {
  const b = await dbGet('cocBatches', batchId);
  const p = await dbGet('projects', b.projectId);
  // Auto-generate QC sample ID: e.g. RINSE-01
  const existing = await dbGetAllByIndex('cocQcSamples', 'cocBatchId', batchId);
  const prefix   = sampleType;
  const allIds   = existing.filter(s => s.sampleType === sampleType).map(s => s.sampleId);
  const sampleId = nextAutoId(prefix + '-', allIds);
  const obj = {
    cocBatchId: batchId,
    sampleId,
    sampleType,
    dateTime: nowStr(),
    containers: [],
    notes: '',
    createdAt: new Date().toISOString()
  };
  obj.id = await dbAdd('cocQcSamples', obj);
  navigate(screenCocQcSample, obj.id);
}
