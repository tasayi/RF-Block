
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
sandbox.runMode = inputData.mode || 'solve';
sandbox.sweepCfg = inputData.sweep || null;

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

  const allB = allBlocks();
  const allC = allConns();

  if (runMode === 'sweep' && sweepCfg) {
    const start = sweepCfg.start !== undefined ? sweepCfg.start : -80;
    const stop = sweepCfg.stop !== undefined ? sweepCfg.stop : 20;
    const step = sweepCfg.step !== undefined ? sweepCfg.step : 5;
    const antId = sweepCfg.antenna_id;
    const monitorPorts = sweepCfg.monitor_ports || [];

    const points = [];
    const ampStages = allB.filter(b => (b.type === 'amp' || b.type === 'bamp' || b.type === 'custom') && b.params && b.params.p1db !== undefined && b.params.p1db !== '');
    const bottleneckLog = {};

    for (let pin = start; pin <= stop + 1e-6; pin += step) {
      const curPin = Number(pin.toFixed(2));
      for (const b of allB) {
        if (b.type === 'antenna' || b.type === 'rfin' || b.type === 'source') {
          b.params = b.params || {};
          if (!antId || b.id === antId) {
            b.params.primaryPower = curPin;
            b.params.secondaryPower = curPin;
            b.params.power = curPin;
          } else {
            b.params.primaryPower = -150.0;
            b.params.secondaryPower = -150.0;
            b.params.power = -150.0;
          }
        }
      }

      const powers = computePowers(budgetMode);
      const noise = computeNoise(powers);

      for (const amp of ampStages) {
        const p1 = Number(amp.params.p1db);
        const outKey = key(amp.id, 'out');
        const pout = powers[outKey];
        if (pout !== undefined && isFinite(pout)) {
          if (pout >= p1 - 1.0) {
            if (!bottleneckLog[amp.id]) {
              bottleneckLog[amp.id] = {
                id: amp.id,
                label: (amp.params && amp.params.label) || amp.id,
                p1db: p1,
                compressed_at_pin: curPin,
                pout_at_compression: Number(pout.toFixed(2))
              };
            }
          }
        }
      }

      const portResults = {};
      if (monitorPorts && monitorPorts.length > 0) {
        for (const pName of monitorPorts) {
          const pwr = powers[pName] !== undefined ? Number(powers[pName].toFixed(2)) : null;
          const nfObj = noise[pName];
          const nf = (nfObj && isFinite(nfObj.F) && nfObj.F > 0) ? Number((10 * Math.log10(nfObj.F)).toFixed(2)) : null;
          portResults[pName] = { power_dbm: pwr, nf_db: nf };
        }
      } else {
        for (const b of allB) {
          if (b.type === 'rfout' || (b.type === 'custom' && b.id.startsWith('custom'))) {
            for (const portId of ['in', 'o1', 'out']) {
              const k = key(b.id, portId);
              if (powers[k] !== undefined) {
                const nfObj = noise[k];
                const nf = (nfObj && isFinite(nfObj.F) && nfObj.F > 0) ? Number((10 * Math.log10(nfObj.F)).toFixed(2)) : null;
                portResults[k] = { power_dbm: Number(powers[k].toFixed(2)), nf_db: nf };
              }
            }
          }
        }
      }

      points.push({
        pin_dbm: curPin,
        ports: portResults
      });
    }

    JSON.stringify({
      mode: 'sweep',
      start,
      stop,
      step,
      bottlenecks: Object.values(bottleneckLog).sort((a, b) => a.compressed_at_pin - b.compressed_at_pin),
      points
    });
  } else {
    const powers = computePowers(budgetMode);
    const noise = computeNoise(powers);

    const outputs = [];
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
  }
`, sandbox);

process.stdout.write(result);
