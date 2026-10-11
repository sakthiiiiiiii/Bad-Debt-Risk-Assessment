import {initPredictor} from './predictor.mjs';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const icons = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  layers: '<path d="m12 3 10 5-10 5L2 8Zm-9 9 9 5 9-5M3 17l9 5 9-5"/>',
  book: '<path d="M12 5v15M3 4c4-1 6 0 9 2 3-2 5-3 9-2v15c-4-1-6 0-9 2-3-2-5-3-9-2Z"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Zm-4 9 3 3 5-6"/>',
  sliders: '<path d="M4 7h7m5 0h4M4 17h3m5 0h8"/><circle cx="13" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  activity: '<path d="M2 12h4l3-8 6 16 3-8h4"/>',
  branch: '<circle cx="6" cy="5" r="2"/><circle cx="18" cy="7" r="2"/><circle cx="6" cy="19" r="2"/><path d="M6 7v10m0-4c8 0 12-1 12-4"/>',
  chart: '<path d="M4 20V4m0 16h17M8 15l4-5 4 2 5-7"/>',
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.activity}</svg>`;
$$('[data-icon]').forEach(el => el.innerHTML = icon(el.dataset.icon));
const pct = n => `${(n * 100).toFixed(1)}%`;
const fmt = n => new Intl.NumberFormat('en-IN', {maximumFractionDigits: 2}).format(n);
const band = value => value < .5 ? 'low' : 'high';
const bandName = {low: 'Low risk', monitor: 'Monitor', high: 'High risk'};
const colors = {low: 'var(--color-success)', monitor: 'var(--color-warning)', high: 'var(--color-danger)'};
const riskLabel = score => score >= .5 ? 'High risk' : 'Low risk';
const outcome = score => score >= .5 ? 'Bad' : 'Good';
const outcomeBadge = score => `<span class="prediction-result ${score >= .5 ? 'high-text' : 'low-text'}">${outcome(score)}</span>`;
const badge = score => `<span class="risk-badge ${band(score)}"><i class="dot ${band(score)}"></i>${bandName[band(score)]}</span>`;
const descriptions = {hgb: 'Sequential trees · strongest test AUC', rf: 'Ensemble of 50 decision trees', lr: 'A transparent linear baseline'};
let portfolio, worker, active = 'hgb', filter = 'all', query = '', page = 1, sort = 'id', direction = 1;
let selected, original, scenario, revision = 0, scenarioTimer;
let nextId = 0;
const pending = new Map();
function request(type, body = {}) {
  const requestId = ++nextId;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {pending.delete(requestId); reject(new Error('This request took too long. Please retry.'));}, type === 'load' ? 90000 : 20000);
    pending.set(requestId, {resolve, reject, timeout});
    worker.postMessage({type, requestId, ...body});
  });
}
function announce(message) { $('#announcement').textContent = message; }
function readURL() {
  const p = new URLSearchParams(location.search);
  active = ['hgb','rf','lr'].includes(p.get('model')) ? p.get('model') : 'hgb';
  filter = ['all','low','high'].includes(p.get('risk')) ? p.get('risk') : 'all';
  query = (p.get('q') || '').slice(0, 80);
  page = Math.max(1, Number.parseInt(p.get('page'), 10) || 1);
  sort = p.get('sort') === 'risk' ? 'risk' : 'id';
  direction = p.get('direction') === '-1' ? -1 : 1;
}
function writeURL() {
  const p = new URLSearchParams({model: active, risk: filter, page, sort, direction});
  // Customer searches can contain personal details; keep them out of the URL.
  history.replaceState(null, '', `${location.pathname}?${p}${location.hash}`);
}
function renderCards() {
  $('#model-cards').innerHTML = portfolio.engines.map(e => `<button class="model-card" data-model="${e.id}" aria-pressed="${active === e.id}" aria-label="Select ${e.name}"><span class="model-top"><span class="model-icon">${icon(e.id === 'rf' ? 'branch' : e.id === 'lr' ? 'chart' : 'layers')}</span>${e.id === 'hgb' ? '<span class="model-flag">BEST AUC</span>' : ''}<span class="radio">${active === e.id ? '✓' : ''}</span></span><span class="model-name">${e.name}</span><span class="model-desc">${descriptions[e.id]}</span><span class="model-metrics"><span><strong>${e.auc.toFixed(3)}</strong>ROC AUC</span><span><strong>${pct(e.accuracy)}</strong>ACCURACY</span><span><strong>${pct(e.recall)}</strong>BAD RECALL</span></span></button>`).join('');
  $$('.model-card').forEach(button => button.onclick = () => {active = button.dataset.model; page = 1; render(); announce(`${portfolio.engines.find(e => e.id === active).name} selected.`);});
}
function renderSummary() {
  const rows = portfolio.customers;
  const high = rows.filter(c => band(c.scores[active]) === 'high').length;
  const average = rows.reduce((sum, c) => sum + c.scores[active], 0) / rows.length;
  const agreement = rows.filter(c => new Set(Object.values(c.scores).map(s => s >= .5)).size === 1).length;
  const items = [
    ['Applications in view', fmt(rows.length), `Sample of ${fmt(portfolio.testRows)} test records`, 'grid', ''],
    ['High-risk signals', fmt(high), `${pct(high / rows.length)} of applications in view`, 'shield', 'high-text'],
    ['Average risk score', pct(average), 'Selected prediction engine', 'activity', ''],
    ['Model agreement', pct(agreement / rows.length), 'All three agree at the 50% cutoff', 'layers', ''],
  ];
  $('#kpis').innerHTML = items.map(([label, value, sub, ico, tone]) => `<div class="kpi"><div class="kpi-label">${icon(ico)}${label}</div><strong class="${tone}">${value}</strong><small>${sub}</small></div>`).join('');
  const counts = Array(20).fill(0);
  rows.forEach(c => counts[Math.min(19, Math.floor(c.scores[active] * 20))]++);
  const max = Math.max(...counts, 1);
  $('#histogram').innerHTML = counts.map((count, i) => `<div class="hist-bar ${band((i+.5)/20)}" style="height:${count/max*100}%" title="${i*5}–${(i+1)*5}%: ${count} applications"></div>`).join('');
  $('#histogram').setAttribute('aria-label', `Risk score distribution. ${counts.map((c,i) => `${i*5} to ${(i+1)*5} percent: ${c}`).join('; ')}`);
  $('#spectrum-description').textContent = `How ${rows.length} applications compare under ${portfolio.engines.find(e => e.id === active).name}.`;
}
function filtered() {
  return portfolio.customers.filter(c => (filter === 'all' || band(c.scores[active]) === filter) && [c.id, c.customerId].some(value => String(value || '').toLowerCase().includes(query.toLowerCase()))).sort((a,b) => direction * (sort === 'risk' ? a.scores[active] - b.scores[active] : a.id.localeCompare(b.id)));
}
function spark(c) {
  const points = ['hgb','rf','lr'].map((id,i) => `${3+i*27},${21-c.scores[id]*18}`).join(' ');
  return `<svg class="sparkline" viewBox="0 0 62 24" role="img" aria-label="Model scores: ${['hgb','rf','lr'].map(id => `${id} ${pct(c.scores[id])}`).join(', ')}"><path d="M2 22H60" stroke="var(--color-border)"/><polyline points="${points}" fill="none" stroke="var(--color-primary)" stroke-width="1.4"/>${['hgb','rf','lr'].map((id,i) => `<circle cx="${3+i*27}" cy="${21-c.scores[id]*18}" r="2" fill="var(--color-primary)"/>`).join('')}</svg>`;
}
function renderTable() {
  const rows = filtered();
  const pages = Math.max(1, Math.ceil(rows.length / 8));
  page = Math.min(page, pages);
  $('#rows').innerHTML = rows.slice((page-1)*8, page*8).map(c => `<tr><td><button class="app-link" data-customer="${c.id}"><span class="app-avatar">${c.id.slice(-2)}</span>${c.customerId || 'ID unavailable'}</button></td><td class="number">${fmt(c.values[6])}</td><td><div class="score-cell"><span class="number">${pct(c.scores[active])}</span><span class="micro-track"><span class="${band(c.scores[active])}" style="width:${c.scores[active]*100}%"></span></span></div></td><td>${badge(c.scores[active])}</td><td>${spark(c)}</td><td class="observed">${c.actual == null ? 'Not known' : c.actual ? 'Bad' : 'Good'}</td><td class="sticky-action"><button class="inspect" data-customer="${c.id}" aria-label="Inspect ${c.id}">↗</button></td></tr>`).join('');
  $$('[data-customer]').forEach(button => button.onclick = () => openCustomer(button.dataset.customer));
  $('#no-results').hidden = rows.length !== 0;
  $('#page-count').textContent = rows.length ? `Showing ${(page-1)*8+1}–${Math.min(page*8, rows.length)} of ${rows.length} applications` : '0 applications';
  $('#page-number').textContent = `${page} / ${pages}`;
  $('#prev').disabled = page === 1;
  $('#next').disabled = page === pages;
  $('#table-total').textContent = rows.length;
  $('#id-heading').setAttribute('aria-sort', sort === 'id' ? direction === 1 ? 'ascending' : 'descending' : 'none');
  $('#risk-heading').setAttribute('aria-sort', sort === 'risk' ? direction === 1 ? 'ascending' : 'descending' : 'none');
  $$('[data-filter]').forEach(b => b.setAttribute('aria-pressed', b.dataset.filter === filter));
  $('#search').value = query;
  $('#clear-search').hidden = !query;
  writeURL();
}
function render() {renderCards(); renderSummary(); renderTable();}
function renderInputs() {
  $('#feature-fields').innerHTML = portfolio.features.map((f,i) => `<label for="feature-${i}">${f.label}<input id="feature-${i}" type="number" step="any" data-feature="${i}" value="${scenario[i]}" aria-describedby="input-error" aria-invalid="false"></label>`).join('');
  $('#sliders').innerHTML = [6,1,10].map(i => {
    const f = portfolio.features[i];
    const min = Math.min(Math.floor(f.sliderMin), scenario[i]);
    const max = Math.max(Math.ceil(f.sliderMax), scenario[i], min + 1);
    return `<div class="slider-field"><label for="slider-${i}">${f.label}<output id="output-${i}" for="slider-${i}">${fmt(scenario[i])}</output></label><input type="range" id="slider-${i}" data-slider="${i}" min="${min}" max="${max}" step="1" value="${scenario[i]}"><div class="slider-limits"><span>${fmt(min)}</span><span>${fmt(max)}</span></div></div>`;
  }).join('');
  $$('[data-slider]').forEach(input => input.oninput = () => {
    const i = Number(input.dataset.slider);
    scenario[i] = Number(input.value);
    $(`#feature-${i}`).value = input.value;
    $(`#output-${i}`).textContent = fmt(scenario[i]);
    scheduleScore();
  });
  $$('[data-feature]').forEach(input => input.oninput = () => {
    const i = Number(input.dataset.feature);
    scenario[i] = input.value === '' ? null : Number(input.value);
    const slider = $(`#slider-${i}`);
    if (slider && scenario[i] !== null) {
      slider.min = Math.min(Number(slider.min), scenario[i]);
      slider.max = Math.max(Number(slider.max), scenario[i]);
      slider.value = scenario[i];
      $(`#output-${i}`).textContent = fmt(scenario[i]);
    }
    revision++;
    clearTimeout(scenarioTimer);
    $('#scenario-label').textContent = 'UNSCORED CHANGES';
    $('#scoring-state').textContent = 'Inputs changed. Recalculate to update the score.';
    $('#score-zone').style.opacity = '.5';
    $('#recalculate').disabled = false;
  });
}
function openCustomer(id) {
  selected = id ? portfolio.customers.find(c => c.id === id) : null;
  original = selected ? [...selected.values] : portfolio.features.map(f => f.median);
  scenario = [...original];
  $('#drawer-title').textContent = selected ? `Customer ${selected.customerId || 'ID unavailable'}` : 'Assess new customer';
  $('#drawer-customer-id').textContent = selected ? `Source Customer ID: ${selected.customerId || 'No unique match'}` : 'Enter credit and risk inputs to assess a new customer.';
  $('#drawer-engine').textContent = portfolio.engines.find(e => e.id === active).name;
  $('#input-error').textContent = '';
  $('#all-fields').open = !selected;
  $('#inspection').showModal();
  renderInputs();
  scoreScenario();
}
function scheduleScore() {
  clearTimeout(scenarioTimer);
  revision++;
  $('#scoring-state').textContent = 'Recalculating scenario…';
  $('#score-zone').style.opacity = '.5';
  scenarioTimer = setTimeout(scoreScenario, 220);
}
async function scoreScenario() {
  clearTimeout(scenarioTimer);
  const current = ++revision;
  const invalid = $$('[data-feature]').find(input => input.validity.badInput || (input.value !== '' && !Number.isFinite(Number(input.value))));
  $$('[data-feature]').forEach(input => input.setAttribute('aria-invalid', String(input === invalid)));
  if (invalid) {
    $('#input-error').textContent = 'Enter a finite number, or leave a field blank to use its training median.';
    $('#all-fields').open = true;
    invalid.focus();
    $('#recalculate').disabled = false;
    return;
  }
  $('#input-error').textContent = '';
  $('#scoring-state').textContent = 'Calculating predictions and feature contributions…';
  $('#recalculate').disabled = true;
  $('#score-zone').style.opacity = '.5';
  try {
    const result = await request('score', {values: [...scenario], model: active});
    if (current !== revision || !$('#inspection').open) return;
    const score = result.scores[active];
    $('#gauge-number').textContent = pct(score);
    $('#predicted-outcome').innerHTML = `Customer risk: <span class="prediction-result ${score >= .5 ? 'high-text' : 'low-text'}">${riskLabel(score)}</span><small>Model outcome: ${outcome(score)} ? 50% score cutoff</small>`;
    $('#gauge-fill').style.strokeDasharray = `${score*100} 100`;
    $('#gauge-fill').style.stroke = colors[band(score)];
    $('#drawer-band').innerHTML = badge(score);
    const changed = scenario.some((v,i) => v !== original[i]);
    $('#scenario-label').textContent = changed ? 'WHAT-IF SCENARIO' : selected ? 'ORIGINAL' : 'NEW ASSESSMENT';
    const delta = selected ? score - selected.scores[active] : 0;
    $('#score-change').textContent = changed && selected ? `${delta >= 0 ? '+' : ''}${(delta*100).toFixed(1)} pp from original` : '';
    $('#consensus').innerHTML = portfolio.engines.map(e => `<div class="consensus-engine"><span>${e.name}</span><span class="prediction-result ${result.scores[e.id] >= .5 ? 'high-text' : 'low-text'}">${riskLabel(result.scores[e.id])}</span><span>${outcome(result.scores[e.id])}</span><strong>${pct(result.scores[e.id])}</strong><span>Bad risk score</span><div class="micro-track"><span class="${band(result.scores[e.id])}" style="width:${result.scores[e.id]*100}%"></span></div></div>`).join('');
    const mean = Object.values(result.scores).reduce((a,b) => a+b,0)/3;
    const votes = Object.values(result.scores).filter(s => s >= .5).length;
    $('#agreement').textContent = `${Math.max(votes,3-votes)}/3 AGREE`;
    $('#consensus-summary').textContent = `Mean risk score ${pct(mean)} · ${bandName[band(mean)]} · ${votes >= 2 ? 'Bad' : 'Good'} majority prediction`;
    const {baseline, contributions} = result.explanation;
    const top = contributions.map((value,i) => ({value,i})).sort((a,b) => Math.abs(b.value)-Math.abs(a.value)).slice(0,6);
    const max = Math.max(...top.map(x => Math.abs(x.value)), .001);
    $('#explanation').innerHTML = top.map(({value,i}) => `<div class="explain-row"><span class="explain-label" title="${portfolio.features[i].key}">${portfolio.features[i].label}</span><div class="explain-track"><span class="explain-bar ${value >= 0 ? 'high' : 'low'}" style="width:${Math.abs(value)/max*49}%;${value >= 0 ? 'left' : 'right'}:50%"></span></div><span class="explain-value ${value >= 0 ? 'high-text' : 'low-text'}">${value >= 0 ? '+' : ''}${(value*100).toFixed(1)}</span></div>`).join('');
    $('#explanation-note').textContent = `Top 6 contributions in percentage points. Background score ${pct(baseline)}. Permutation SHAP estimate using 8 training examples.`;
    $('#scoring-state').textContent = 'Predictions updated';
    if (!selected) $('#score-zone').scrollIntoView({block:'nearest'});
    $('#score-zone').style.opacity = '1';
  } catch (error) {
    if (current === revision) {
      $('#scoring-state').textContent = 'Could not update predictions.';
      $('#input-error').textContent = `${error.message} Use Predict customer risk to retry.`;
    }
  } finally { if (current === revision) $('#recalculate').disabled = false; }
}
function openInfo(mode) {
  $('#info-title').textContent = mode === 'models' ? 'Model performance' : 'How to read the scores';
  const intro = '<p>Three fitted classifiers use the same 12 SFM-selected features. All results below come from the project’s original, unbalanced test split.</p>';
  const evaluation = portfolio ? `<div class="table-scroll"><table><thead><tr><th>Model</th><th>AUC</th><th>Accuracy</th><th>Bad recall</th><th>Bad F1</th></tr></thead><tbody>${portfolio.engines.map(e => `<tr><td>${e.name}</td><td>${e.auc.toFixed(3)}</td><td>${pct(e.accuracy)}</td><td>${pct(e.recall)}</td><td>${e.f1.toFixed(3)}</td></tr>`).join('')}</tbody></table></div>` : '<p>Model metrics will be available after loading finishes.</p>';
  $('#info-content').innerHTML = `${intro}${mode === 'models' ? evaluation : ''}<h3>Training and evaluation</h3><p>The original labeled data contains 84,341 Good and 7,481 Bad outcomes. It was split into 75% training and 25% testing before oversampling. Training was balanced to 63,255 records per class. The 22,956 test records retain their original distribution. This dashboard shows a fixed random sample of 80 test applications.</p><p>The model comparison used this test set to select the best model. These scores are comparison results; an independent final validation is still needed for real lending use.</p><h3>A risk score, not a calibrated probability</h3><p>The gauge shows each model’s P(Bad) output. Training on oversampled data changes the class balance, so this is an <strong>uncalibrated model score</strong>. A 70% score does not establish a 70% real-world default rate.</p><h3>Risk bands and consensus</h3><p>Display bands are illustrative: <strong>Low below 50%, High at 50% or above</strong>. Customer High/Low risk and Good/Bad predictions use the same 50% cutoff. Consensus is the arithmetic mean of the three scores, not a confidence estimate. Model spread connects three model outputs, not points in time.</p><h3>Explanations and scenarios</h3><p>Feature bars are deterministic permutation SHAP estimates using eight training examples and two feature orders per example. Green contributions move toward Good; rose contributions move toward Bad. The six largest contributions are shown; all twelve sum with the background score to the model output.</p><p>What-if controls change model inputs and rerun all three classifiers. These are sensitivity tests, not evidence of a causal effect. Blank numeric fields use training medians. Unfamiliar bureau codes keep their original meaning from the source data.</p><h3>Private by design</h3><p>This workspace runs locally on your computer. Example records use invented application IDs. Entered inputs and predictions remain in browser memory and are discarded on reload. The full training dataset is not included in the webpage.</p>`;
  $('#info-dialog').showModal();
}
async function init() {
  if (worker) worker.terminate();
  worker = new Worker(new URL('./worker.mjs', import.meta.url), {type: 'module'});
  worker.onmessage = ({data: message}) => {
    const p = pending.get(message.requestId);
    if (!p) return;
    clearTimeout(p.timeout); pending.delete(message.requestId);
    message.error ? p.reject(new Error(message.error)) : p.resolve(message.result);
  };
  worker.onerror = () => {pending.forEach(p => {clearTimeout(p.timeout); p.reject(new Error('The prediction engine could not start. Reload this page.'));}); pending.clear();};
  $('#load-state').innerHTML = '<span class="spinner"></span><h2>Preparing your risk workspace</h2><p>Loading three trained prediction engines…</p>';
  try {
    portfolio = await request('load');
    initPredictor(portfolio, request);
    readURL(); render();
    $('#nav-count').textContent = portfolio.customers.length;
    $('#load-state').hidden = true;
    $('#dashboard').hidden = false;
    $('#runtime-status').textContent = '3 engines ready';
    $('#export').disabled = false;
    $('#new-assessment').disabled = false;
    $('#predict-nav').disabled = false;
    announce('Workspace ready. Three trained models and 80 example applications loaded.');
  } catch (error) {
    $('#runtime-status').textContent = 'Models unavailable';
    $('#load-state').innerHTML = '<h2>Models could not load</h2><p id="load-error"></p><button id="retry" class="button primary">Retry loading</button>';
    $('#load-error').textContent = error.message;
    $('#retry').onclick = init;
  }
}
$$('[data-filter]').forEach(button => button.onclick = () => {filter = button.dataset.filter; page = 1; renderTable();});
$('#search').oninput = event => {if (!event.isComposing) {query = event.target.value; page = 1; renderTable();}};
$('#search').oncompositionend = event => {query = event.target.value; page = 1; renderTable();};
$('#clear-search').onclick = () => {query = ''; page = 1; renderTable(); $('#search').focus();};
$('#clear-filters').onclick = () => {filter = 'all'; query = ''; page = 1; renderTable(); $('#search').focus();};
$('#prev').onclick = () => {page--; renderTable();};
$('#next').onclick = () => {page++; renderTable();};
for (const name of ['id','risk']) $(`#sort-${name}`).onclick = () => {direction = sort === name ? -direction : 1; sort = name; page = 1; renderTable();};
$('#performance-nav').onclick = () => openInfo('models');
$('#method-nav').onclick = $('#score-notes').onclick = () => openInfo('method');
function showView(view) {
  const predicting = view === 'predict';
  $('#customer-predictor').hidden = !predicting;
  $('#portfolio-view').hidden = predicting;
  $('#current-view-label').textContent = predicting ? 'Predict customer risk' : 'Portfolio overview';
  $('.page-heading h1').innerHTML = `${predicting ? 'Predict customer risk' : 'Portfolio overview'}<span class="title-dot">.</span>`;
  $('.page-heading p').textContent = predicting ? 'Enter customer credit details and compare all three model predictions.' : 'A closer look at your customers. A clearer view of their risk.';
  for (const [id, chosen] of [['predict-nav', predicting], ['portfolio-nav', !predicting]]) {
    const button = $(`#${id}`);
    button.classList.toggle('active', chosen);
    if (chosen) button.setAttribute('aria-current','page');
    else button.removeAttribute('aria-current');
  }
  $('#export').hidden = predicting;
  $('#new-assessment').hidden = predicting;
  $('#main').scrollIntoView({block:'start'});
  if (predicting) $('#customer-input-0').focus({preventScroll:true});
}
$('#predict-nav').onclick = $('#new-assessment').onclick = () => showView('predict');
$('#portfolio-nav').onclick = () => showView('portfolio');
$$('.close-dialog').forEach(button => button.onclick = () => button.closest('dialog').close());
$('#inspection').addEventListener('close', () => {revision++; clearTimeout(scenarioTimer); $('#recalculate').disabled = false;});
$('#reset-scenario').onclick = () => {scenario = [...original]; renderInputs(); scoreScenario();};
$('#scenario-form').onsubmit = event => {event.preventDefault(); scoreScenario();};
$('#export').onclick = () => {
  const rows = filtered();
  const csvCell = value => {
    let text = String(value ?? '');
    if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  };
  const csv = ['application_id,customer_id,observed_outcome,gradient_boosting_bad_score,random_forest_bad_score,logistic_regression_bad_score,selected_engine,risk_result', ...rows.map(c => [c.id,c.customerId,c.actual == null ? 'Not known' : c.actual ? 'Bad' : 'Good',c.scores.hgb,c.scores.rf,c.scores.lr,active,riskLabel(c.scores[active])].map(csvCell).join(','))].join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8'}));
  const link = document.createElement('a'); link.href = url; link.download = 'risk-observatory-scores.csv'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  announce(`Exported scores for ${rows.length} applications.`);
};
window.addEventListener('popstate', () => {if (portfolio) {readURL(); render();}});
init();
