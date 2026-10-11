import {fill, consensus, explain} from './inference.mjs';
let data, models;
async function read(path, json = true) {
  const response = await fetch(path, {signal: AbortSignal.timeout(60000)});
  if (!response.ok) throw new Error(`Could not load model assets (${response.status}). Reload to retry.`);
  return json ? response.json() : response;
}
async function load() {
  const [portfolio, lr, hgb, rf, compressed] = await Promise.all([
    read('assets/portfolio.json'), read('assets/lr.json'), read('assets/hgb.json'),
    read('assets/rf.json'), read('assets/rf.bin.gz', false)
  ]);
  const bytes = await new Response(compressed.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  models = {lr, hgb, rf: {...rf, view: new DataView(bytes)}};
  data = portfolio;
  return {...data, customers: data.customers.map(c => ({...c, scores: consensus(c.values, models)}))};
}
self.onmessage = async ({data: message}) => {
  try {
    let result;
    if (message.type === 'load') result = await load();
    else {
      if (!models) throw new Error('Models are still loading.');
      const values = fill(message.values, data.features);
      result = message.type === 'predict'
        ? {scores: consensus(values, models)}
        : {scores: consensus(values, models), explanation: explain(message.model, values, models, data.background)};
    }
    self.postMessage({requestId: message.requestId, result});
  } catch (error) {
    self.postMessage({requestId: message.requestId, error: error.message});
  }
};
