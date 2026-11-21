
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const jsFiles = [
  'js/config.js',
  'js/utils.js',
  'js/components/helpers.js',
  'js/components/sources.js',
  'js/components/gain-loss.js',
  'js/components/filters.js',
  'js/components/converters.js',
  'js/components/routing.js',
  'js/components/passives.js',
  'js/components/terminals.js',
  'js/components/containers.js',
  'js/state.js',
  'js/geometry.js',
  'js/solvers/power-solver.js',
  'js/solvers/noise-solver.js',
  'js/solvers/budget-solver.js'
];

const sandbox = {
  console: console,
  Math: Math,
  isFinite: isFinite,
  isNaN: isNaN,
  parseFloat: parseFloat,
  parseInt: parseInt,
  Array: Array,
  Object: Object,
  String: String,
  Number: Number,
  Boolean: Boolean,
  RegExp: RegExp,
  window: {},
  document: { getElementById: () => null, addEventListener: () => {} },
  navigator: { userAgent: '' }
};
sandbox.window = sandbox;
vm.createContext(sandbox);

for (const f of jsFiles) {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), sandbox);
}

const inputData = JSON.parse(fs.readFileSync(0, 'utf8'));
sandbox.bdData = inputData.schematic;
sandbox.budgetMode = inputData.power_budget || 'primary';

const result = vm.runInContext(`
  settings = { powerBudget: budgetMode };
  if (bdData.sheets && bdData.sheets.length) {
    sheets = bdData.sheets.map(sh => ({
      id: sh.id,
      name: sh.name,
      blocks: sh.blocks || [],
      conns: sh.connections || sh.conns || [],
      view: sh.view
    }));
    cur = 0;
    adoptSheet(0);
  } else {
    sheets = [{ id: 's1', name: 'Sheet 1', blocks: bdData.blocks || [], conns: bdData.connections || bdData.conns || [], view: { tx: 60, ty: 56, scale: 1 } }];
    cur = 0;
    adoptSheet(0);
  }

  const powers = computePowers(budgetMode);
  const noise = computeNoise(powers);

  const outputs = [];
  const allB = allBlocks();
  const allC = allConns();

  for (const b of allB) {
    if (b.type === 'rfout') {
      const cn = allC.find(c => c.to.block === b.id);
      let pwr = null, nf = null;
      if (cn) {
        const k = key(cn.from.block, cn.from.port);
        pwr = powers[k] !== undefined ? Number(powers[k].toFixed(2)) : null;
        const nfObj = noise[k];
        nf = (nfObj && isFinite(nfObj.F) && nfObj.F > 0) ? Number((10 * Math.log10(nfObj.F)).toFixed(2)) : null;
      }
      outputs.push({
        id: b.id,
        label: (b.params && b.params.label) || b.id,
        output_power_dbm: pwr,
        noise_figure_db: nf
      });
    }
  }
  JSON.stringify({ outputs, powers, noise: Object.fromEntries(Object.entries(noise).map(([k, v]) => [k, (v && isFinite(v.F) && v.F > 0) ? Number((10 * Math.log10(v.F)).toFixed(2)) : null])) });
`, sandbox);

process.stdout.write(result);
