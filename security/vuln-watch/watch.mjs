#!/usr/bin/env node
// ARGUS vulnerability watch.
//
// Compares what ARGUS runs on against live vulnerability feeds and tells the
// team what affects us and how to fix it:
//   - OSV.dev           every npm package + exact version in our lockfiles
//   - CISA KEV          vulnerabilities being exploited in real-world attacks
//                       (escalates matching findings; also matched against the
//                       infrastructure listed in security/inventory.json)
//   - Node.js releases  security releases newer than the Node version we run
//
// Usage:
//   node security/vuln-watch/watch.mjs --dry-run   print the report, change nothing
//   node security/vuln-watch/watch.mjs             also open/reopen GitHub issues
//                                                  (needs GITHUB_TOKEN, GITHUB_REPOSITORY)
// Optional: SLACK_WEBHOOK_URL posts a summary of new findings.
//
// Only Node.js built-ins are used, so the watcher adds no dependencies of its own.

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const DRY_RUN = process.argv.includes('--dry-run') || !process.env.GITHUB_TOKEN;
const REPO = process.env.GITHUB_REPOSITORY;
const LABEL = 'vuln-watch';
const SEV_ORDER = ['ACTIVELY EXPLOITED', 'CRITICAL', 'HIGH', 'MODERATE', 'MEDIUM', 'LOW', 'UNKNOWN'];
const KEV_URL ='https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json';
const NODE_INDEX_URL = 'https://nodejs.org/dist/index.json';
const OSV = 'https://api.osv.dev/v1';

async function getJson(url, init) {
    for (let attempt = 1; ; attempt++) {
        const res = await fetch(url, { ...init, headers: { 'user-agent': 'argus-vuln-watch', ...(init?.headers || {}) } });
        if (res.ok) return res.json();
        if (attempt >= 3 || res.status < 500) throw new Error(`${init?.method || 'GET'} ${url} -> ${res.status} ${await res.text().catch(() => '')}`.slice(0, 500));
        await new Promise(r => setTimeout(r, 2000 * attempt));
    }
}

// --- Inventory ---------------------------------------------------------------

function readLockfile({ app, path: rel }) {
    const lock = JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
    const out = [];
    for (const [key, info] of Object.entries(lock.packages || {})) {
        if (!key || !info.version) continue; // "" is the project itself
        const name = info.name || key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length);
        out.push({ app, name, version: info.version, dev: !!info.dev, direct: key === `node_modules/${name}` && isDirect(lock, name) });
    }
    return out;
}

function isDirect(lock, name) {
    const root = lock.packages?.[''] || {};
    return !!(root.dependencies?.[name] || root.devDependencies?.[name]);
}

// --- Feeds -------------------------------------------------------------------

async function osvFindings(packages) {
    const unique = [...new Map(packages.map(p => [`${p.name}@${p.version}`, p])).values()];
    const idsByPkg = new Map();
    for (let i = 0; i < unique.length; i += 500) {
        const batch = unique.slice(i, i + 500);
        const res = await getJson(`${OSV}/querybatch`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ queries: batch.map(p => ({ package: { name: p.name, ecosystem: 'npm' }, version: p.version })) }),
        });
        res.results.forEach((r, j) => {
            if (r.vulns?.length) idsByPkg.set(`${batch[j].name}@${batch[j].version}`, r.vulns.map(v => v.id));
        });
    }
    const details = new Map();
    for (const id of new Set([...idsByPkg.values()].flat())) details.set(id, await getJson(`${OSV}/vulns/${encodeURIComponent(id)}`));

    // One finding per installed package version, listing every advisory that affects it,
    // so the team gets one issue (and one upgrade) per package instead of one per advisory.
    const findings = [];
    for (const p of packages) {
        const advisories = [];
        for (const id of idsByPkg.get(`${p.name}@${p.version}`) || []) {
            const v = details.get(id);
            if (v.withdrawn) continue;
            const fixed = (v.affected || [])
                .filter(a => a.package?.name === p.name)
                .flatMap(a => (a.ranges || []).flatMap(r => (r.events || []).filter(e => e.fixed).map(e => e.fixed)))
                .filter(f => cmpSemver(f, p.version) > 0)
                .sort(cmpSemver);
            advisories.push({
                id,
                aliases: v.aliases || [],
                summary: v.summary || (v.details || '').split('\n')[0].slice(0, 160),
                severity: (v.database_specific?.severity || 'UNKNOWN').toUpperCase(),
                firstFixed: fixed[0] || null,
                url: `https://osv.dev/vulnerability/${id}`,
            });
        }
        if (!advisories.length) continue;
        advisories.sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity));
        const fixes = advisories.map(a => a.firstFixed).filter(Boolean).sort(cmpSemver);
        findings.push({
            kind: 'package',
            key: `pkg|${p.app}|${p.name}|${p.version}`,
            id: advisories.map(a => a.id).join(', '),
            severity: advisories[0].severity,
            advisories,
            app: p.app, pkg: p.name, version: p.version, dev: p.dev, direct: p.direct,
            // The lowest version that fixes every advisory that has a fix.
            fixTo: fixes.at(-1) || null,
            unfixed: advisories.filter(a => !a.firstFixed).map(a => a.id),
        });
    }
    return findings;
}

function cmpSemver(a, b) {
    const pa = a.replace(/^v/, '').split('.').map(Number), pb = b.replace(/^v/, '').split('.').map(Number);
    for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
    return 0;
}

async function nodeFindings(node) {
    if (!node?.version) return [];
    const releases = await getJson(NODE_INDEX_URL);
    const major = node.version.split('.')[0];
    const sameMajor = releases.filter(r => r.version.startsWith(`v${major}.`));
    const newerSecurity = sameMajor.filter(r => r.security && cmpSemver(r.version, node.version) > 0);
    if (!newerSecurity.length) return [];
    const latest = sameMajor.sort((a, b) => cmpSemver(b.version, a.version))[0];
    return [{
        kind: 'node',
        key: `node-security|${latest.version}`,
        id: `Node.js security release ${newerSecurity.map(r => r.version).join(', ')}`,
        severity: 'HIGH',
        summary: `We run Node.js v${node.version}; ${newerSecurity.length} newer security release(s) exist in the v${major} line.`,
        fixTo: latest.version,
        where: node.where,
        url: 'https://nodejs.org/en/blog/vulnerability',
    }];
}

function kevInfraFindings(kev, components, lookbackDays) {
    const since = new Date(Date.now() - lookbackDays * 864e5).toISOString().slice(0, 10);
    const out = [];
    for (const v of kev.vulnerabilities) {
        if (v.dateAdded < since) continue;
        const text = `${v.vendorProject} ${v.product}`;
        for (const c of components) {
            if (!new RegExp(c.kev, 'i').test(text)) continue;
            out.push({
                kind: 'infra',
                key: `${v.cveID}|${c.name}`,
                id: v.cveID,
                severity: 'ACTIVELY EXPLOITED',
                summary: `${v.vendorProject} ${v.product}: ${v.vulnerabilityName}`,
                component: c, kev: v,
                url: `https://nvd.nist.gov/vuln/detail/${v.cveID}`,
            });
        }
    }
    return out;
}

// --- Report ------------------------------------------------------------------

const rank = f => SEV_ORDER.indexOf(f.exploited ? 'ACTIVELY EXPLOITED' : f.severity);

function title(f) {
    if (f.kind === 'package') {
        const n = f.advisories.length;
        return `[vuln-watch] ${f.exploited ? 'EXPLOITED ' : ''}${f.severity} ${f.pkg} ${f.version} (${f.app}): ${n} advisor${n === 1 ? 'y' : 'ies'}`;
    }
    if (f.kind === 'node') return `[vuln-watch] HIGH Node.js security release available (${f.fixTo})`;
    return `[vuln-watch] EXPLOITED ${f.id} affects ${f.component.name}`;
}

function body(f) {
    const lines = [`<!-- vuln-watch-key: ${f.key} -->`];
    if (f.kind === 'package') {
        lines.push(
            `**\`${f.pkg}@${f.version}\` in \`${f.app}\`** · ${f.direct ? 'direct dependency' : 'transitive dependency'}${f.dev ? ' · dev-only (not shipped to users)' : ' · shipped'}`,
            f.exploited ? '\n> **At least one of these is on CISA\'s Known Exploited Vulnerabilities list: it is being used in real attacks. Fix now.**' : '',
            '',
            '| Advisory | Severity | Summary | Fixed in |', '|---|---|---|---|',
            ...f.advisories.map(a => {
                const cves = a.aliases.filter(x => x.startsWith('CVE-'));
                return `| [${a.id}](${a.url})${cves.length ? '<br>' + cves.join(', ') : ''} | ${a.severity} | ${a.summary.replace(/\|/g, '\\|')} | ${a.firstFixed || 'no fix yet'} |`;
            }),
            '', '### How to fix', '');
        if (f.fixTo) {
            lines.push(f.direct
                ? `1. In \`${f.app}/\`: \`npm install ${f.pkg}@^${f.fixTo}\``
                : `1. In \`${f.app}/\`: \`npm update ${f.pkg}\` (or \`npm audit fix\`). If a parent package pins an old range, upgrade the parent or add an \`overrides\` entry for \`${f.pkg}\` >= ${f.fixTo}.`);
        }
        if (f.unfixed.length) {
            lines.push(`${f.fixTo ? '1b' : '1'}. No fix is published for ${f.unfixed.join(', ')}. Check those advisories for workarounds, or replace/remove \`${f.pkg}\`.`);
        }
        lines.push('2. Run the test suites, then open a PR referencing this issue.',
            f.dev ? '3. Dev-only: not shipped to users, but it runs on developer machines and CI, so still fix it.' : '3. Shipped to production: prioritise by severity.');
    } else if (f.kind === 'node') {
        lines.push(`**${f.summary}**`, '', `Where: ${f.where}.`, '', '### How to fix', '',
            `1. Install Node.js ${f.fixTo} on every machine and the deploy host.`,
            `2. Update \`node.version\` (and the Node.js component) in \`security/inventory.json\` to ${f.fixTo.replace(/^v/, '')}.`,
            `3. Release notes: ${f.url}`);
    } else {
        const v = f.kev;
        lines.push(`**${f.summary}**`, '',
            `| | |`, `|---|---|`,
            `| CVE | [${v.cveID}](${f.url}) |`,
            `| Status | **Actively exploited** (added to CISA KEV ${v.dateAdded}${v.knownRansomwareCampaignUse === 'Known' ? ', used in ransomware campaigns' : ''}) |`,
            `| Our exposure | ${f.component.name} — ${f.component.where} (version: ${f.component.version}) |`,
            `| CISA due date (US federal) | ${v.dueDate} |`,
            '', v.shortDescription, '', '### How to respond', '',
            `1. Confirm whether the affected product/version is in use (${f.component.where}). If not, close this issue with a note.`,
            `2. Required action (CISA): ${v.requiredAction}`,
            '3. Patch every affected machine/device and record the version in `security/inventory.json`.',
            '4. If exposure is confirmed and unpatched, check logs for signs of exploitation and tell the team lead.');
    }
    lines.push('', '_Opened automatically by the ARGUS vulnerability watch (`security/vuln-watch/watch.mjs`)._');
    return lines.join('\n');
}

// --- GitHub issues -----------------------------------------------------------

async function gh(method, url, data) {
    const res = await fetch(`https://api.github.com${url}`, {
        method,
        headers: {
            authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
            accept: 'application/vnd.github+json',
            'x-github-api-version': '2022-11-28',
            'user-agent': 'argus-vuln-watch',
            ...(data ? { 'content-type': 'application/json' } : {}),
        },
        body: data ? JSON.stringify(data) : undefined,
    });
    if (!res.ok && res.status !== 422) throw new Error(`GitHub ${method} ${url} -> ${res.status} ${await res.text()}`);
    return res.status === 204 ? null : res.json();
}

async function existingIssues() {
    const byKey = new Map();
    for (let page = 1; page < 50; page++) {
        const issues = await gh('GET', `/repos/${REPO}/issues?labels=${LABEL}&state=all&per_page=100&page=${page}`);
        for (const i of issues) {
            const m = (i.body || '').match(/vuln-watch-key: (.+?) -->/);
            if (m) byKey.set(m[1], i);
        }
        if (issues.length < 100) break;
    }
    return byKey;
}

async function publish(findings) {
    await gh('POST', `/repos/${REPO}/labels`, { name: LABEL, color: 'b60205', description: 'Opened by the ARGUS vulnerability watch' });
    const existing = await existingIssues();
    const opened = [], reopened = [], updated = [];
    for (const f of findings) {
        const issue = existing.get(f.key);
        if (!issue) {
            const created = await gh('POST', `/repos/${REPO}/issues`, { title: title(f), body: body(f), labels: [LABEL] });
            opened.push({ f, url: created.html_url });
            continue;
        }
        if (f.kind !== 'package') continue;
        if (issue.state === 'closed') {
            // Closed, but the lockfile still has the vulnerable version: it wasn't fixed.
            await gh('PATCH', `/repos/${REPO}/issues/${issue.number}`, { state: 'open' });
            await gh('POST', `/repos/${REPO}/issues/${issue.number}/comments`, {
                body: `Reopened: \`${f.pkg}@${f.version}\` is still in \`${f.app}\`'s lockfile, so this is not fixed yet.`,
            });
            reopened.push({ f, url: issue.html_url });
            continue;
        }
        // Still open: report advisories published since the issue was written.
        // (The body is rewritten below to list every advisory, so it is the record.)
        const known = issue.body || '';
        const fresh = f.advisories.filter(a => !known.includes(a.id));
        if (fresh.length) {
            await gh('POST', `/repos/${REPO}/issues/${issue.number}/comments`, {
                body: [`New advisor${fresh.length === 1 ? 'y' : 'ies'} for \`${f.pkg}@${f.version}\`:`, '',
                    ...fresh.map(a => `- [${a.id}](${a.url}) · ${a.severity} · ${a.summary} · fixed in ${a.firstFixed || 'no fix yet'}`),
                    '', f.fixTo ? `Upgrading to **${f.fixTo}** or later fixes everything that has a fix.` : ''].join('\n'),
            });
            await gh('PATCH', `/repos/${REPO}/issues/${issue.number}`, { body: body(f), title: title(f) });
            updated.push({ f, url: issue.html_url });
        }
    }
    return { opened, reopened, updated };
}

async function notifySlack(opened, reopened) {
    const hook = process.env.SLACK_WEBHOOK_URL;
    if (!hook || (!opened.length && !reopened.length)) return;
    const line = x => `• ${title(x.f).replace('[vuln-watch] ', '')} — ${x.url}`;
    const text = [`*ARGUS vulnerability watch*: ${opened.length} new, ${reopened.length} reopened`, ...opened.map(line), ...reopened.map(line)].join('\n');
    const res = await fetch(hook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
    if (!res.ok) console.warn(`Slack notification failed: ${res.status}`);
}

// --- Main --------------------------------------------------------------------

const inventory = JSON.parse(fs.readFileSync(path.join(ROOT, 'security', 'inventory.json'), 'utf8'));
const packages = inventory.lockfiles.flatMap(readLockfile);
console.log(`Inventory: ${packages.length} npm packages (${new Set(packages.map(p => p.name)).size} unique), ${inventory.components.length} infrastructure components.`);

const kev = await getJson(KEV_URL);
const kevCves = new Set(kev.vulnerabilities.map(v => v.cveID));
console.log(`CISA KEV catalog ${kev.catalogVersion}: ${kev.count} actively exploited vulnerabilities.`);

const pkgFindings = (await osvFindings(packages)).map(f => ({
    ...f,
    exploited: f.advisories.some(a => a.aliases.some(x => kevCves.has(x))),
}));
const findings = [
    ...pkgFindings,
    ...(await nodeFindings(inventory.node)),
    ...kevInfraFindings(kev, inventory.components, inventory.kevLookbackDays ?? 14).map(f => ({ ...f, exploited: true })),
].sort((a, b) => rank(a) - rank(b));

console.log(`\nFindings: ${findings.length} (${findings.filter(f => f.exploited).length} actively exploited)\n`);
for (const f of findings) console.log(`  ${title(f).replace('[vuln-watch] ', '')}`);

if (DRY_RUN) {
    console.log('\nDry run: no issues opened.');
    if (process.argv.includes('--show-bodies')) for (const f of findings) console.log(`\n----- ${title(f)}\n${body(f)}`);
} else {
    if (!REPO) throw new Error('GITHUB_REPOSITORY is not set');
    const { opened, reopened, updated } = await publish(findings);
    console.log(`\nOpened ${opened.length} issue(s), reopened ${reopened.length}, updated ${updated.length}.`);
    await notifySlack([...opened, ...updated], reopened);
}
