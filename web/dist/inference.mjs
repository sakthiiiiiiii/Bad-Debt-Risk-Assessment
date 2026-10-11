// Portable inference for the fitted sklearn models. No retraining or approximated trees.
export function fill(values, features) {
  if (!Array.isArray(values) || values.length !== features.length) throw new Error('Enter all 12 feature values.');
  return values.map((value, i) => {
    if (value === null || value === '') return features[i].median;
    if (!Number.isFinite(Number(value))) throw new Error(`${features[i].label} must be a finite number.`);
    return Number(value);
  });
}
const sigmoid = x => 1 / (1 + Math.exp(-x));
export function predict(id, values, models) {
  const m = models[id];
  if (id === 'lr') return sigmoid(m.intercept + values.reduce((sum, v, i) => sum + (v - m.mean[i]) / m.scale[i] * m.coef[i], 0));
  if (id === 'hgb') {
    let result = m.baseline;
    for (const tree of m.trees) {
      let node = tree[0];
      while (!node[5]) node = tree[values[node[2]] <= node[3] ? node[0] : node[1]];
      result += node[4];
    }
    return sigmoid(result);
  }
  let result = 0;
  for (const root of m.roots) {
    let offset = root * 24;
    while (m.view.getInt32(offset, true) !== -1) {
      const feature = m.view.getInt32(offset + 8, true);
      // sklearn's random forest converts input values to float32 before traversal.
      const left = Math.fround(values[feature]) <= m.view.getFloat64(offset + 12, true);
      offset = (root + m.view.getInt32(offset + (left ? 0 : 4), true)) * 24;
    }
    result += m.view.getFloat32(offset + 20, true);
  }
  return result / m.roots.length;
}
export function consensus(values, models) {
  return Object.fromEntries(['hgb', 'rf', 'lr'].map(id => [id, predict(id, values, models)]));
}
export function explain(id, values, models, background) {
  // Interventional permutation SHAP estimate, deterministic, two antithetic orders
  // for each background row. Contributions telescope exactly to prediction - baseline.
  const contributions = values.map(() => 0);
  let baseline = 0;
  for (let b = 0; b < background.length; b++) {
    const base = background[b];
    baseline += predict(id, base, models) / background.length;
    const order = values.map((_, i) => (i + b * 5) % values.length);
    for (const sequence of [order, [...order].reverse()]) {
      const working = [...base];
      let previous = predict(id, working, models);
      for (const i of sequence) {
        working[i] = values[i];
        const next = predict(id, working, models);
        contributions[i] += (next - previous) / (background.length * 2);
        previous = next;
      }
    }
  }
  return {baseline, contributions, score: predict(id, values, models)};
}
