
const rawData = window.DASHBOARD_DATA || { records: [], meta: {}, summary: {} };
const records = (rawData.records || []).filter(r => Object.values(r || {}).some(v => String(v || '').trim() !== ''));
const monthOrder = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const charts = {};
let leadsRendered = false;

const chartPalette = {
  primary: '#f5a703',
  primarySoft: '#ffd67d',
  dark: '#141414',
  slate: '#6f6a64',
  soft: '#d9d1c4',
  line: '#ece3d7'
};

function canonicalStatus(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v.includes('ativa') || v.includes('activa')) return 'Ativa';
  if (v.includes('perd')) return 'Perdida';
  if (v.includes('duplic')) return 'Duplicada';
  return String(value || '').trim();
}
function uniqueValues(list) { return [...new Set(list.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'pt')); }
function monthNameFromNumber(value) { const n = Number(value); return monthOrder[n - 1] || ''; }
function setupMeta() {
  const sourceFile = document.getElementById('sourceFile');
  const dateRange = document.getElementById('dateRange');
  if (sourceFile) sourceFile.textContent = `Fonte: ${rawData.meta.source_file || '-'}`;
  if (dateRange) dateRange.textContent = `Período: ${rawData.meta.date_min || '-'} a ${rawData.meta.date_max || '-'}`;
}
function setupTabs() {
  const buttons = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.tab-panel');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      buttons.forEach(b => b.classList.toggle('active', b === btn));
      panels.forEach(panel => panel.classList.toggle('active', panel.id === `tab-${tab}`));
      if (tab === 'cronograma') setTimeout(() => renderCronogramaTab(), 80);
      if (tab === 'indicadores-leads') setTimeout(() => ensureLeadsRendered(true), 80);
      if (tab === 'campanhas') setTimeout(() => renderCampaignsTab(), 80);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}
function populateSelect(id, values, label = 'Todos') {
  const select = document.getElementById(id); if (!select) return;
  select.innerHTML = '';
  const defaultOption = document.createElement('option');
  defaultOption.value = ''; defaultOption.textContent = label; select.appendChild(defaultOption);
  values.forEach(value => { const option = document.createElement('option'); option.value = value; option.textContent = value; select.appendChild(option); });
}
function setupFilters() {
  populateSelect('filterAno', uniqueValues(records.map(r => r['Ano'])));
  populateSelect('filterMes', monthOrder.filter(m => records.some(r => monthNameFromNumber(r['Mês']) === m)));
  populateSelect('filterEstado', uniqueValues(records.map(r => canonicalStatus(r['Estado']))));
  populateSelect('filterEtapa', uniqueValues(records.map(r => r['Etapa'])));
  populateSelect('filterEquipa', uniqueValues(records.map(r => r['Equipas'])));
  populateSelect('filterSubOrigem', uniqueValues(records.map(r => r['SubOrigem'])));
  ['filterAno','filterMes','filterEstado','filterEtapa','filterEquipa','filterSubOrigem','tableSearch'].forEach(id => {
    const el = document.getElementById(id); if (el) el.addEventListener('input', () => ensureLeadsRendered(true));
  });
  const btnReset = document.getElementById('btnReset');
  if (btnReset) btnReset.addEventListener('click', () => {
    ['filterAno','filterMes','filterEstado','filterEtapa','filterEquipa','filterSubOrigem','tableSearch'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    ensureLeadsRendered(true);
  });
  const btnExportCsv = document.getElementById('btnExportCsv');
  const btnExportXlsx = document.getElementById('btnExportXlsx');
  if (btnExportCsv) btnExportCsv.addEventListener('click', exportCsv);
  if (btnExportXlsx) btnExportXlsx.addEventListener('click', exportXlsx);
}
function getFilteredRecords() {
  const ano = document.getElementById('filterAno')?.value || '';
  const mes = document.getElementById('filterMes')?.value || '';
  const estado = document.getElementById('filterEstado')?.value || '';
  const etapa = document.getElementById('filterEtapa')?.value || '';
  const equipa = document.getElementById('filterEquipa')?.value || '';
  const subOrigem = document.getElementById('filterSubOrigem')?.value || '';
  const search = (document.getElementById('tableSearch')?.value || '').trim().toLowerCase();
  return records.filter(r => {
    const okAno = !ano || String(r['Ano'] || '') === String(ano);
    const okMes = !mes || monthNameFromNumber(r['Mês']) === mes;
    const okEstado = !estado || canonicalStatus(r['Estado']) === estado;
    const okEtapa = !etapa || r['Etapa'] === etapa;
    const okEquipa = !equipa || r['Equipas'] === equipa;
    const okSub = !subOrigem || r['SubOrigem'] === subOrigem;
    const blob = Object.values(r).join(' | ').toLowerCase();
    const okSearch = !search || blob.includes(search);
    return okAno && okMes && okEstado && okEtapa && okEquipa && okSub && okSearch;
  });
}
function groupCount(items, keyFn, top = null, sorter = null) {
  const map = new Map();
  items.forEach(item => { const key = keyFn(item); if (!key) return; map.set(key, (map.get(key) || 0) + 1); });
  let arr = [...map.entries()].map(([label, value]) => ({ label, value }));
  arr.sort(sorter || ((a, b) => b.value - a.value || a.label.localeCompare(b.label, 'pt')));
  if (top) arr = arr.slice(0, top);
  return arr;
}
function badgeClass(status) {
  const s = canonicalStatus(status).toLowerCase();
  if (s.includes('ativa')) return 'at'; if (s.includes('perd')) return 'pe'; if (s.includes('duplic')) return 'du'; return 'neu';
}
function updateKpis(filtered) {
  const campaignSet = new Set();
  filtered.forEach(r => ['Campanhas','Campanha II','Campanha III','Campanha IV','Campanha V'].forEach(c => { if (r[c]) campaignSet.add(r[c]); }));
  const ativas = filtered.filter(r => canonicalStatus(r['Estado']) === 'Ativa').length;
  const perdidas = filtered.filter(r => canonicalStatus(r['Estado']) === 'Perdida').length;
  const duplicadas = filtered.filter(r => canonicalStatus(r['Estado']) === 'Duplicada').length;
  document.getElementById('kpiTotal').textContent = filtered.length.toLocaleString('pt-PT');
  document.getElementById('kpiAtivas').textContent = ativas.toLocaleString('pt-PT');
  document.getElementById('kpiPerdidas').textContent = perdidas.toLocaleString('pt-PT');
  document.getElementById('kpiDuplicadas').textContent = duplicadas.toLocaleString('pt-PT');
  document.getElementById('kpiCampanhas').textContent = campaignSet.size.toLocaleString('pt-PT');
  document.getElementById('kpiZonas').textContent = uniqueValues(filtered.map(r => r['Zona'])).length.toLocaleString('pt-PT');
}
function chartDataFromFiltered(filtered) {
  const meses = groupCount(filtered, r => (r['Ano'] && r['Mês']) ? `${r['Ano']}-${String(r['Mês']).padStart(2, '0')}` : '', null, (a, b) => a.label.localeCompare(b.label));
  const estado = groupCount(filtered, r => canonicalStatus(r['Estado']), 10);
  const etapa = groupCount(filtered, r => r['Etapa'], 12);
  const suborigem = groupCount(filtered, r => r['SubOrigem'], 10);
  const equipas = groupCount(filtered, r => r['Equipas'], 10);
  const zonas = groupCount(filtered, r => r['Zona'], 12);
  const campanhasPrincipais = groupCount(filtered, r => r['Campanhas'], 12);
  const repeatedExpanded = []; filtered.forEach(r => ['Campanha II','Campanha III','Campanha IV','Campanha V'].forEach(c => { if (r[c]) repeatedExpanded.push({ campaign: r[c] }); }));
  const campanhasRepetidas = groupCount(repeatedExpanded, x => x.campaign, 12);
  return { meses, estado, etapa, suborigem, equipas, zonas, campanhasPrincipais, campanhasRepetidas };
}
function colorList(length) {
  const base = [chartPalette.primary, chartPalette.dark, chartPalette.primarySoft, chartPalette.soft, '#9b927f', '#c5baa8', '#3a3a3a'];
  return Array.from({ length }, (_, i) => base[i % base.length]);
}
function baseOptions(type, options = {}) {
  const cfg = {
    responsive: true, normalized: true, maintainAspectRatio: false, animation: false, resizeDelay: 220,
    interaction: { mode: 'nearest', intersect: false },
    plugins: {
      legend: { display: !!options.showLegend, position: 'top', labels: { color: chartPalette.dark, font: { family: 'Manrope', weight: '700' } } },
      tooltip: { backgroundColor: '#111111', titleFont: { family: 'Manrope', weight: '800' }, bodyFont: { family: 'Manrope', weight: '700' } }
    }
  };
  if (type !== 'doughnut') {
    cfg.indexAxis = options.horizontal ? 'y' : 'x';
    cfg.scales = options.horizontal
      ? { x: { beginAtZero: true, grid: { color: chartPalette.line }, ticks: { precision: 0, color: chartPalette.slate, font: { family: 'Manrope', weight: '700' } } }, y: { grid: { display: false }, ticks: { color: chartPalette.dark, font: { family: 'Manrope', weight: '700' } } } }
      : { x: { grid: { display: false }, ticks: { color: chartPalette.dark, font: { family: 'Manrope', weight: '700' }, maxRotation: 40, minRotation: 0, autoSkip: false } }, y: { beginAtZero: true, grid: { color: chartPalette.line }, ticks: { precision: 0, color: chartPalette.slate, font: { family: 'Manrope', weight: '700' } } } };
  }
  return cfg;
}
function buildChart(chartId, type, labels, values, options = {}) {
  const canvas = document.getElementById(chartId); if (!canvas) return;
  if (charts[chartId]) { charts[chartId].destroy(); delete charts[chartId]; }
  charts[chartId] = new Chart(canvas, {
    type,
    data: { labels, datasets: [{ label: options.label || 'Total', data: values, borderWidth: type === 'line' ? 3 : 1, borderColor: type === 'line' ? chartPalette.primary : colorList(values.length), backgroundColor: type === 'line' ? 'rgba(245,167,3,0.16)' : colorList(values.length), fill: type === 'line', tension: 0.28, pointRadius: type === 'line' ? 3 : 0, pointHoverRadius: type === 'line' ? 4 : 0, barThickness: options.horizontal ? 18 : undefined, maxBarThickness: 34 }] },
    options: baseOptions(type, options)
  });
}
function renderCharts(filtered) {
  const d = chartDataFromFiltered(filtered);
  buildChart('chartMeses', 'bar', d.meses.map(x => x.label), d.meses.map(x => x.value));
  buildChart('chartEstado', 'doughnut', d.estado.map(x => x.label), d.estado.map(x => x.value), { showLegend: true });
  buildChart('chartEtapa', 'bar', d.etapa.map(x => x.label), d.etapa.map(x => x.value), { horizontal: true });
  buildChart('chartSubOrigem', 'doughnut', d.suborigem.map(x => x.label), d.suborigem.map(x => x.value), { showLegend: true });
  buildChart('chartCampanhas', 'bar', d.campanhasPrincipais.map(x => x.label), d.campanhasPrincipais.map(x => x.value), { horizontal: true });
  buildChart('chartCampanhasRep', 'bar', d.campanhasRepetidas.map(x => x.label), d.campanhasRepetidas.map(x => x.value), { horizontal: true });
  buildChart('chartEquipas', 'bar', d.equipas.map(x => x.label), d.equipas.map(x => x.value), { horizontal: true });
  buildChart('chartZonas', 'bar', d.zonas.map(x => x.label), d.zonas.map(x => x.value), { horizontal: true });
  buildChart('chartTimeline', 'line', d.meses.map(x => x.label), d.meses.map(x => x.value), { label: 'Registos' });
}
function renderTable(filtered) {
  const body = document.getElementById('detailTableBody'); body.innerHTML = '';
  filtered.slice(0, 500).forEach(r => {
    const tr = document.createElement('tr');
    const campaigns = ['Campanhas','Campanha II','Campanha III','Campanha IV','Campanha V'].map(c => r[c]).filter(Boolean).join(' | ');
    tr.innerHTML = `
      <td class="small">${r['Referência'] || ''}</td>
      <td class="small">${r['Data de criação'] || ''}</td>
      <td><span class="badge ${badgeClass(r['Estado'])}">${canonicalStatus(r['Estado']) || ''}</span></td>
      <td>${r['Etapa'] || ''}</td>
      <td>${r['SubOrigem'] || ''}</td>
      <td>${r['Equipas'] || ''}</td>
      <td>${campaigns}</td>
      <td>${r['Zona'] || ''}</td>`;
    body.appendChild(tr);
  });
  document.getElementById('tableCount').textContent = `A mostrar ${Math.min(filtered.length, 500)} de ${filtered.length} registos filtrados.`;
}
function renderFilterLabel(filtered) {
  const fields = [['Ano', document.getElementById('filterAno').value],['Mês', document.getElementById('filterMes').value],['Estado', document.getElementById('filterEstado').value],['Etapa', document.getElementById('filterEtapa').value],['Equipa', document.getElementById('filterEquipa').value],['SubOrigem', document.getElementById('filterSubOrigem').value]].filter(([, value]) => value);
  document.getElementById('activeFiltersLabel').textContent = fields.length ? `Filtros ativos: ${fields.map(([k, v]) => `${k}: ${v}`).join(' • ')} • ${filtered.length} registos` : `Sem filtros ativos • ${filtered.length} registos`;
}
function exportCsv() {
  const filtered = getFilteredRecords();
  const headers = ['Ano','Mês','Referência','Origem','SubOrigem','Estado','Etapa','Data de criação','Equipas','Campanhas','Campanha II','Campanha III','Campanha IV','Campanha V','Zona'];
  const rows = [headers.join(';')].concat(
    filtered.map(r => headers.map(h => `"${String(r[h] || '').replaceAll('\"', '\"\"')}"`).join(';'))
  );
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'dashboard_ci_filtrado.csv';
  link.click();
}

function exportXlsx() {
  const filtered = getFilteredRecords();
  const worksheet = XLSX.utils.json_to_sheet(filtered);
  const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, 'Dashboard'); XLSX.writeFile(workbook, 'dashboard_ci_filtrado.xlsx');
}

function renderCampaignsTab() {
  const summary = rawData.summary || {};
  const insights = summary.campanhas_insights || {};
  const repeatedUnique = summary.campanhas_repetidas_unicas || [];
  const repetitionLevel = summary.repeticoes_nivel || [];
  const duplicatesTable = summary.duplicados_detalhe || [];

  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  setText('kpiDuplicadasCampanhas', (insights.leads_duplicadas || 0).toLocaleString('pt-PT'));
  setText('kpiPercentDuplicadas', `${String(insights.percent_duplicadas || 0).replace('.', ',')}%`);
  setText('kpiNovos', (insights.leads_novos || 0).toLocaleString('pt-PT'));
  setText('countCampanhasTab', (insights.campanhas_unicas || 0).toLocaleString('pt-PT'));

  buildChart('chartCampanhasDuplicadas', 'bar', repeatedUnique.map(x => x.label), repeatedUnique.map(x => x.value), { horizontal: true });
  buildChart('chartNivelRepeticao', 'bar', repetitionLevel.map(x => x.label), repetitionLevel.map(x => x.value));

  const body = document.getElementById('tableDuplicadosCampanhas');
  if (body) {
    body.innerHTML = '';
    duplicatesTable.forEach(row => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="small">${row['Referência'] || ''}</td>
        <td>${row['Campanha 1'] || ''}</td>
        <td>${row['Campanha 2'] || ''}</td>
        <td>${row['Campanha 3'] || ''}</td>
        <td>${row['Campanha 4'] || ''}</td>
        <td>${row['Campanha 5'] || ''}</td>`;
      body.appendChild(tr);
    });
  }

  const count = document.getElementById('campaignsTableCount');
  if (count) count.textContent = `A mostrar ${duplicatesTable.length.toLocaleString('pt-PT')} leads repetidos.`;
}



function renderCronogramaTab() {
  const summary = rawData.summary || {};
  const cronograma = summary.cronograma || {};
  const stages = cronograma.stages || [];
  const teams = cronograma.teams || [];

  const panelTitle = document.getElementById('cronogramaPanelTitle');
  const panelSubtitle = document.getElementById('cronogramaPanelSubtitle');
  const title = document.getElementById('cronogramaTitle');
  const subtitle = document.getElementById('cronogramaSubtitle');
  const stagesMini = document.getElementById('cronogramaStagesMini');
  const grid = document.getElementById('cronogramaGrid');

  if (panelTitle) panelTitle.textContent = cronograma.title || 'Cronograma Operacional';
  if (panelSubtitle) panelSubtitle.textContent = 'Leitura dinâmica da primeira sheet do ficheiro de modelo operacional.';
  if (title) title.textContent = cronograma.title || 'Cronograma Operacional';
  if (subtitle) subtitle.textContent = cronograma.subtitle || 'Vista executiva do modelo de trabalho do Capital Imobiliário.';

  if (stagesMini) {
    stagesMini.innerHTML = '';
    stages.forEach(stage => {
      const span = document.createElement('span');
      span.className = 'mini-pill emphasis';
      span.textContent = stage;
      stagesMini.appendChild(span);
    });
  }

  if (grid) {
    grid.innerHTML = '';
    const corner = document.createElement('div');
    corner.className = 'cronograma-corner';
    corner.textContent = 'Equipas';
    grid.appendChild(corner);

    stages.forEach(stage => {
      const header = document.createElement('div');
      header.className = 'cronograma-phase';
      header.textContent = stage;
      grid.appendChild(header);
    });

    teams.forEach(team => {
      const teamDiv = document.createElement('div');
      teamDiv.className = 'cronograma-team';
      teamDiv.textContent = team.name || '';
      grid.appendChild(teamDiv);

      (team.cells || []).forEach(cellParts => {
        const cell = document.createElement('div');
        cell.className = 'cronograma-cell';
        const parts = Array.isArray(cellParts) ? cellParts.filter(Boolean) : [];
        if (parts.length) {
          const strong = document.createElement('strong');
          strong.textContent = parts[0];
          cell.appendChild(strong);
          parts.slice(1).forEach(part => {
            const span = document.createElement('span');
            span.textContent = part;
            cell.appendChild(span);
          });
        } else {
          cell.classList.add('cronograma-cell--muted');
          const strong = document.createElement('strong');
          strong.textContent = '—';
          const span = document.createElement('span');
          span.textContent = 'Sem informação';
          cell.appendChild(strong);
          cell.appendChild(span);
        }
        grid.appendChild(cell);
      });
    });
  }
}

function setupLogin() {
  const overlay = document.getElementById('loginOverlay');
  const input = document.getElementById('passwordInput');
  const button = document.getElementById('loginBtn');
  const error = document.getElementById('loginError');
  const correctPassword = 'capital2026';

  if (!overlay || !input || !button) return;

  const unlock = () => {
    sessionStorage.setItem('ci_dashboard_auth', 'true');
    overlay.style.display = 'none';
  };

  if (sessionStorage.getItem('ci_dashboard_auth') === 'true') {
    overlay.style.display = 'none';
  }

  const tryLogin = () => {
    if ((input.value || '') === correctPassword) {
      if (error) error.textContent = '';
      unlock();
    } else {
      if (error) error.textContent = 'Password incorreta';
    }
  };

  button.addEventListener('click', tryLogin);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') tryLogin();
  });
}


function renderAdditionalCounts() {
  const countHerancas = records.filter(r => ['Campanhas','Campanha II','Campanha III','Campanha IV','Campanha V'].some(c => String(r[c] || '').toLowerCase().includes('heranças'))).length;
  const countExecucao = records.filter(r => String(r['SubOrigem'] || '').toLowerCase().includes('exec')).length;
  const countDuplicadas = records.filter(r => canonicalStatus(r['Estado']) === 'Duplicada').length;
  const countParceiros = records.filter(r => ['Campanhas','Campanha II','Campanha III','Campanha IV','Campanha V'].some(c => { const val = String(r[c] || '').toLowerCase(); return val.includes('parceiro') || val.includes('encerramento') || val.includes('protocolo'); })).length;
  const campaignSet = new Set(); records.forEach(r => ['Campanhas','Campanha II','Campanha III','Campanha IV','Campanha V'].forEach(c => { if (r[c]) campaignSet.add(r[c]); }));
  const countCampanhasTab = campaignSet.size;
  const countEtapasTab = uniqueValues(records.map(r => r['Etapa'])).length;
  const countGeoTab = uniqueValues(records.map(r => r['Zona'])).length;
  const countArquivo = records.filter(r => ['SubOrigem','Etapa','Campanhas','Campanha II','Campanha III','Campanha IV','Campanha V'].some(c => { const val = String(r[c] || '').toLowerCase(); return val.includes('arquivo') || val.includes('acompanh') || val.includes('dossier') || val.includes('document'); })).length;
  const map = { countHerancas, countExecucao, countDuplicadas, countParceiros, countCampanhasTab, countEtapasTab, countGeoTab, countArquivo };
  Object.entries(map).forEach(([id, value]) => { const el = document.getElementById(id); if (el) el.textContent = value.toLocaleString('pt-PT'); });
}
function renderAll() {
  const filtered = getFilteredRecords(); updateKpis(filtered); renderCharts(filtered); renderTable(filtered); renderFilterLabel(filtered); leadsRendered = true;
}
function ensureLeadsRendered(force = false) {
  if (force || !leadsRendered) renderAll(); else Object.values(charts).forEach(chart => { try { chart.resize(); } catch (e) {} });
}
window.addEventListener('load', () => { setupLogin(); setupMeta(); setupTabs(); setupFilters(); renderAdditionalCounts(); renderCronogramaTab(); renderCampaignsTab(); });
