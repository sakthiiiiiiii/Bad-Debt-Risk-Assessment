// Customer input form. Personal identifiers are never sent to the prediction worker.
export function initPredictor(portfolio, request) {
  const form = document.querySelector('#customer-prediction-form');
  const fields = document.querySelector('#customer-inputs');
  const error = document.querySelector('#prediction-error');
  const status = document.querySelector('#prediction-status');
  const result = document.querySelector('#customer-result');
  const submit = document.querySelector('#predict-customer');
  let revision = 0;
  const percentage = value => `${(value * 100).toFixed(1)}%`;

  const descriptions = {
    RISK_SCORE: 'Creditworthiness score based on recorded financial behavior.',
    ENQUIRIES_6M: 'Number of credit enquiries in the previous six months.',
    ENQUIRIES_12M: 'Number of credit enquiries in the previous twelve months.',
    NO_MONTHS_VCR228: 'Bureau VCR228 month-based field; exact meaning is not documented.',
    NO_SUM_VCR053: 'Bureau VCR053 aggregate field; exact meaning is not documented.',
    NO_SCORE: 'Credit score supplied by Credit Rater 21.',
    SCORE_CR22: 'Credit score supplied by Credit Rater 22.',
    NO_SCORE_CR21: 'Additional CR21 score field; detailed definition is not provided.',
    RISK_RELATIVE_CR21: 'CR21 risk-relative index; its calculation is not documented.',
    RISK_RELATIVE_ODDS_CR21: 'CR21 risk-relative odds; its calculation is not documented.',
    EMPLOYED_NO_MTHS: 'Employment-month field; detailed definition is not provided.',
    NO_ADDRESS_AT_MONTHS: 'Months-at-address field; detailed definition is not provided.',
  };
  const number = value => new Intl.NumberFormat('en-IN', {maximumFractionDigits:8}).format(value);
  fields.innerHTML = portfolio.features.map((feature, i) => `<label for="customer-input-${i}">${feature.label}<small>${feature.key}</small><input type="number" id="customer-input-${i}" data-credit-input="${i}" step="any" required placeholder="Example: ${feature.median}" aria-invalid="false" aria-describedby="feature-help-${i} feature-range-${i} prediction-error"><span class="feature-explanation" id="feature-help-${i}">${descriptions[feature.key]}</span><span class="feature-range" id="feature-range-${i}">Training range: ${number(feature.min)} to ${number(feature.max)}</span></label>`).join('');
  const inputs = [...fields.querySelectorAll('input')];
  function invalidate() {
    revision++;
    result.hidden = true;
    status.textContent = 'Enter values, then click Predict customer risk.';
    submit.disabled = false;
  }
  form.addEventListener('input', invalidate);
  document.querySelector('#load-example').onclick = () => {
    const example = portfolio.customers[0];
    inputs.forEach((input, i) => {input.value = example.values[i]; input.setAttribute('aria-invalid', 'false');});
    document.querySelector('#prediction-customer-id').value = example.customerId || '';
    invalidate();
    error.textContent = '';
    status.textContent = 'Test sample loaded. Replace these values to assess another customer.';
  };
  document.querySelector('#clear-customer-form').onclick = () => {
    form.reset();
    invalidate();
    inputs.forEach(input => input.setAttribute('aria-invalid', 'false'));
    error.textContent = '';
    inputs[0].focus();
  };
  form.onsubmit = async event => {
    event.preventDefault();
    const invalid = inputs.filter(input => input.value.trim() === '' || input.validity.badInput || !Number.isFinite(Number(input.value)));
    inputs.forEach(input => input.setAttribute('aria-invalid', String(invalid.includes(input))));
    if (invalid.length) {
      error.textContent = `Enter a number for all 12 credit/risk fields. ${invalid.length} field(s) need a value.`;
      result.hidden = true;
      invalid[0].focus();
      return;
    }
    const current = ++revision;
    error.textContent = '';
    status.textContent = 'Predicting with all three models...';
    submit.disabled = true;
    result.hidden = true;
    try {
      const {scores} = await request('predict', {values: inputs.map(input => Number(input.value))});
      if (current !== revision) return;
      const votes = Object.values(scores).filter(score => score >= .5).length;
      const high = votes >= 2;
      const id = document.querySelector('#prediction-customer-id').value.trim();
      document.querySelector('#prediction-for').textContent = id ? `Result for customer ${id}` : 'Customer prediction result';
      const heading = document.querySelector('#customer-risk-label');
      heading.textContent = high ? 'High risk' : 'Low risk';
      heading.className = high ? 'high-text' : 'low-text';
      document.querySelector('#customer-votes').textContent = `${Math.max(votes, 3 - votes)} of 3 models predict ${high ? 'Bad' : 'Good'} at the 50% cutoff.`;
      document.querySelector('#customer-model-results').innerHTML = portfolio.engines.map(engine => {
        const score = scores[engine.id];
        return `<article class="customer-model-result"><h3>${engine.name}</h3><strong class="${score >= .5 ? 'high-text' : 'low-text'}">${score >= .5 ? 'High risk' : 'Low risk'}</strong><p>${score >= .5 ? 'Bad' : 'Good'} outcome</p><span>Bad risk score: ${percentage(score)}</span></article>`;
      }).join('');
      result.hidden = false;
      status.textContent = 'Prediction complete.';
      result.scrollIntoView({block: 'nearest'});
    } catch (failure) {
      if (current === revision) {
        error.textContent = `${failure.message} Click Predict customer risk to retry.`;
        status.textContent = 'Prediction could not complete.';
      }
    } finally {
      if (current === revision) submit.disabled = false;
    }
  };
}
