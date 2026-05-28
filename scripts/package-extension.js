const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'dist');
const manifestPath = path.join(root, 'manifest.json');
const skipTests = process.argv.includes('--skip-tests') || process.env.SKIP_TESTS === '1';

const packageItems = [
  'manifest.json',
  'newtab.html',
  'options.html',
  'popup.html',
  'css',
  'img',
  'js',
  'lib',
];

function assertInside(parent, target) {
  const relative = path.relative(parent, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Refusing to operate outside ${parent}: ${target}`);
  }
}

function removeIfExists(target) {
  assertInside(root, target);
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
}

function copyRecursive(source, destination) {
  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    fs.mkdirSync(destination, { recursive: true });
    for (const entry of fs.readdirSync(source)) {
      copyRecursive(path.join(source, entry), path.join(destination, entry));
    }
    return;
  }

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function countFiles(directory) {
  let count = 0;
  let bytes = 0;

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = countFiles(fullPath);
      count += nested.count;
      bytes += nested.bytes;
    } else {
      count += 1;
      bytes += fs.statSync(fullPath).size;
    }
  }

  return { count, bytes };
}

function psLiteral(value) {
  return `'${value.replace(/'/g, "''")}'`;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: options.capture ? 'pipe' : 'inherit',
    shell: options.shell || false,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    const detail = result.stderr || result.stdout || '';
    throw new Error(`${command} ${args.join(' ')} failed\n${detail}`.trim());
  }

  return result.stdout || '';
}

function zipDirectory(sourceDir, zipPath) {
  const command = [
    '$ErrorActionPreference = "Stop"',
    `Compress-Archive -Path ${psLiteral(path.join(sourceDir, '*'))} -DestinationPath ${psLiteral(zipPath)} -CompressionLevel Optimal`,
  ].join('; ');

  run('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command]);
}

function hashFile(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex').toUpperCase();
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!manifest.version) {
    throw new Error('manifest.json is missing version');
  }

  const version = manifest.version;
  const stageDir = path.join(distDir, `chrome-store-package-${version}`);
  const zipPath = path.join(distDir, `shuiguo-nav-chrome-${version}.zip`);

  if (!skipTests) {
    console.log('Running tests...');
    run('npm', ['test'], { shell: true });
  }

  fs.mkdirSync(distDir, { recursive: true });
  removeIfExists(stageDir);
  removeIfExists(zipPath);
  fs.mkdirSync(stageDir, { recursive: true });

  for (const item of packageItems) {
    const source = path.join(root, item);
    if (!fs.existsSync(source)) {
      throw new Error(`Package item does not exist: ${item}`);
    }
    copyRecursive(source, path.join(stageDir, item));
  }

  zipDirectory(stageDir, zipPath);

  const staged = countFiles(stageDir);
  const zipStat = fs.statSync(zipPath);
  const sha256 = hashFile(zipPath);

  console.log('');
  console.log(`Chrome Web Store package created`);
  console.log(`Version: ${version}`);
  console.log(`Zip: ${zipPath}`);
  console.log(`Zip size: ${zipStat.size} bytes`);
  console.log(`Packaged files: ${staged.count}`);
  console.log(`Packaged source bytes: ${staged.bytes}`);
  console.log(`SHA256: ${sha256}`);
  console.log('');
  console.log('Excluded by design: .git, node_modules, tests, docs, dist');
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
