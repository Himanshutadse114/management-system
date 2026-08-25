const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { GeneratedReport } = require('../models/reports');
const { buildReportPayload } = require('./reportDataService');
const { getObjectStorage, tenantObjectKey } = require('../storage/objectStorage');
const { generateFallback } = require('./reportFallback');

function safePart(value, fallback = 'report') {
  const cleaned = String(value || '').trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100);
  return cleaned || fallback;
}

function pythonCommand() {
  return String(process.env.PYTHON_BIN || 'python3').trim() || 'python3';
}

function runPython({ inputPath, outputPath, format, timeoutMs = 120000 }) {
  const script = path.join(__dirname, '..', '..', 'reporting', 'generate_report.py');
  return new Promise((resolve, reject) => {
    const child = spawn(pythonCommand(), [script, '--input', inputPath, '--output', outputPath, '--format', format], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUNBUFFERED: '1' }
    });
    let stdout = ''; let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      const error = new Error('Python report generation timed out.');
      error.code = 'REPORT_TIMEOUT';
      reject(error);
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve({ stdout, stderr });
      const error = new Error(`Python report generator exited with code ${code}: ${stderr.slice(-3000)}`);
      error.code = 'REPORT_PYTHON_FAILED';
      reject(error);
    });
  });
}

async function generateReport({ tenantId, branchId = null, reportType, format, locale, from, to, createdByUserId }) {
  const normalizedFormat = String(format || 'PDF').toUpperCase();
  const normalizedLocale = String(locale || 'en').toLowerCase();
  const extension = normalizedFormat === 'XLSX' ? 'xlsx' : 'pdf';
  const contentType = normalizedFormat === 'XLSX'
    ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    : 'application/pdf';

  const report = await GeneratedReport.create({
    tenantId,
    branchId,
    reportType,
    format: normalizedFormat,
    locale: normalizedLocale,
    rangeFrom: from,
    rangeTo: to,
    status: 'GENERATING',
    createdByUserId
  });

  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'outlet-report-'));
  const inputPath = path.join(tempDir, 'payload.json');
  const outputPath = path.join(tempDir, `report.${extension}`);

  try {
    const payload = await buildReportPayload({ tenantId, branchId, reportType, from, to, locale: normalizedLocale });
    report.rangeFrom = payload.range.from;
    report.rangeTo = payload.range.to;
    await report.save();
    await fs.promises.writeFile(inputPath, JSON.stringify(payload), 'utf8');

    let generator = 'python';
    try {
      await runPython({ inputPath, outputPath, format: extension });
    } catch (pythonError) {
      console.error('[reports] Python generation failed, trying Node fallback:', pythonError.message);
      generator = 'node-fallback';
      await generateFallback(payload, outputPath, extension);
    }

    const buffer = await fs.promises.readFile(outputPath);
    const now = new Date();
    const yyyy = String(now.getUTCFullYear());
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const scope = payload.branch ? safePart(payload.branch.code || payload.branch.name, 'branch') : 'all-branches';
    const fileName = `${safePart(reportType.toLowerCase())}-${scope}-${payload.range.from}-to-${payload.range.to}-${normalizedLocale}.${extension}`;
    const objectKey = tenantObjectKey({
      tenantId,
      branchId,
      category: `reports/${yyyy}/${mm}`,
      entityId: report.id,
      filename: fileName
    });
    const stored = await getObjectStorage().putObject({ key: objectKey, body: buffer, contentType });

    report.status = 'READY';
    report.objectKey = objectKey;
    report.fileName = fileName;
    report.contentType = contentType;
    report.sizeBytes = String(stored.size || buffer.length);
    report.completedAt = new Date();
    report.errorMessage = null;
    await report.save();

    return { report, generator };
  } catch (error) {
    report.status = 'FAILED';
    report.errorMessage = String(error?.message || error).slice(0, 8000);
    report.completedAt = new Date();
    await report.save().catch(() => {});
    throw error;
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function reportBuffer(report) {
  if (!report || report.status !== 'READY' || !report.objectKey) {
    const error = new Error('Report file is not available.'); error.status = 409; throw error;
  }
  return getObjectStorage().getObjectBuffer(report.objectKey);
}

module.exports = { generateReport, reportBuffer };
