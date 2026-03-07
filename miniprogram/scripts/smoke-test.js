const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const reportPath = path.join(root, 'smoke-report.json');
const checks = [];

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function exists(relPath) {
  return fs.existsSync(path.join(root, relPath));
}

function check(name, pass, detail = '') {
  checks.push({ name, pass, detail });
  const tag = pass ? 'PASS' : 'FAIL';
  console.log(`[${tag}] ${name}${detail ? ` - ${detail}` : ''}`);
}

try {
  check('app.js exists', exists('app.js'));
  check('http service exists', exists('services/http.js'));
  check('auth service exists', exists('services/auth.js'));
  check('my page exists', exists('pages/my/my.js'));

  const appJs = read('app.js');
  check(
    'apiBaseUrl configurable',
    appJs.includes("wx.getStorageSync('apiBaseUrl')"),
  );

  const authJs = read('services/auth.js');
  check('wx-login api wired', authJs.includes('/auth/wx-login'));
  check('mock token removed', !authJs.includes('mock-token-'));

  const httpJs = read('services/http.js');
  check(
    '2xx accepted',
    httpJs.includes('statusCode >= 200 && res.statusCode < 300'),
  );

  const failed = checks.filter((item) => !item.pass);
  const report = {
    timestamp: new Date().toISOString(),
    total: checks.length,
    passed: checks.length - failed.length,
    failed: failed.length,
    checks,
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\nSmoke report: ${reportPath}`);

  if (failed.length > 0) {
    process.exit(1);
  }

  console.log('Smoke test passed.');
} catch (err) {
  console.error('Smoke test crashed:', err.message);
  process.exit(1);
}
