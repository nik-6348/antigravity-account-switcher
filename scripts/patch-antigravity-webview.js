const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

function findAgyExtension() {
    const candidatePaths = [
        '/Applications/Antigravity IDE.app/Contents/Resources/app/extensions/agy',
        path.join(os.homedir(), 'Applications/Antigravity IDE.app/Contents/Resources/app/extensions/agy')
    ];

    for (const cPath of candidatePaths) {
        const extFile = path.join(cPath, 'vscode', 'extension.js');
        if (fs.existsSync(extFile)) {
            return { agyDir: cPath, extFile };
        }
    }
    return null;
}

const PROXY_CODE = `
// === ANTIGRAVITY ACCOUNT SWITCHER REVERSE PROXY START ===
(function() {
    if (global.__agyProxyInitialized) return;
    global.__agyProxyInitialized = true;

    const http = require('http');
    const net = require('net');
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const { exec } = require('child_process');

    let _proxyServer = null;
    let _proxyPort = 0;
    let _targetPort = 0;
    const home = os.homedir();
    const scriptPath = path.join(home, 'Desktop', 'projects', 'ai-service', 'antigravity-account-switcher', 'scripts', 'profile_manager.py');
    const injectedJsPath = path.join(__dirname, '..', 'antigravity_switcher_injected.js');

    global.__agyGetProxy = function(targetUrl) {
        try {
            const parsed = new URL(targetUrl);
            _targetPort = parseInt(parsed.port, 10);
        } catch (e) {
            return targetUrl;
        }

        if (_proxyServer && _proxyPort > 0) {
            return 'http://127.0.0.1:' + _proxyPort + '/';
        }

        _proxyServer = http.createServer((req, res) => {
            // API: Account Info
            if (req.url === '/api/antigravity-switcher/info') {
                const cmd = 'python3 "' + scriptPath + '" --action DetectAccount && python3 "' + scriptPath + '" --action List';
                exec(cmd, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
                    const lines = (stdout || '').trim().split('\\n');
                    let current = {}, profiles = [];
                    try { current = JSON.parse(lines[0] || '{}'); } catch(e){}
                    try { profiles = JSON.parse(lines[1] || '[]'); } catch(e){}
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ current, profiles }));
                });
                return;
            }

            // API: Switch Account
            if (req.url === '/api/antigravity-switcher/switch' && req.method === 'POST') {
                let body = '';
                req.on('data', c => body += c);
                req.on('end', () => {
                    try {
                        const data = JSON.parse(body || '{}');
                        const targetProfile = data.profile;
                        const vscode = require('vscode');
                        if (targetProfile) {
                            const cmd = 'python3 "' + scriptPath + '" --action Load --profile-name "' + targetProfile.replace(/"/g, '\\\\"') + '"';
                            exec(cmd, (err) => {
                                if (!err) {
                                    vscode.commands.executeCommand('workbench.action.reloadWindow');
                                    res.writeHead(200, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ success: true }));
                                } else {
                                    res.writeHead(500, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ success: false, error: err.message }));
                                }
                            });
                        } else {
                            vscode.commands.executeCommand('antigravity-switcher.selectAccount');
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: true }));
                        }
                    } catch (e) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: e.message }));
                    }
                });
                return;
            }

            // API: Add Account
            if (req.url === '/api/antigravity-switcher/add' && req.method === 'POST') {
                const vscode = require('vscode');
                const cmd = 'python3 "' + scriptPath + '" --action PrepareSignOut';
                exec(cmd, (err) => {
                    if (!err) {
                        vscode.commands.executeCommand('workbench.action.reloadWindow');
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true }));
                    } else {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, error: err.message }));
                    }
                });
                return;
            }

            // Injected Script
            if (req.url === '/antigravity_switcher_injected.js') {
                if (fs.existsSync(injectedJsPath)) {
                    res.writeHead(200, { 'Content-Type': 'application/javascript' });
                    res.end(fs.readFileSync(injectedJsPath, 'utf8'));
                } else {
                    res.writeHead(404);
                    res.end('Not found');
                }
                return;
            }

            // Reverse Proxy all other requests
            const isHtml = (req.url === '/' || req.url.startsWith('/?') || req.url.startsWith('/c/'));
            const options = {
                hostname: '127.0.0.1',
                port: _targetPort,
                path: req.url,
                method: req.method,
                headers: { ...req.headers, host: '127.0.0.1:' + _targetPort }
            };
            if (isHtml) {
                delete options.headers['accept-encoding'];
            }

            const proxyReq = http.request(options, (proxyRes) => {
                if (isHtml && proxyRes.statusCode === 200) {
                    let body = '';
                    proxyRes.setEncoding('utf8');
                    proxyRes.on('data', chunk => body += chunk);
                    proxyRes.on('end', () => {
                        body = body.replace('</body>', '<script src="/antigravity_switcher_injected.js"></script></body>');
                        const headers = { ...proxyRes.headers };
                        delete headers['transfer-encoding'];
                        headers['content-length'] = Buffer.byteLength(body);
                        res.writeHead(proxyRes.statusCode, headers);
                        res.end(body);
                    });
                } else {
                    res.writeHead(proxyRes.statusCode, proxyRes.headers);
                    proxyRes.pipe(res);
                }
            });

            proxyReq.on('error', (err) => {
                res.writeHead(502);
                res.end('Bad Gateway: ' + err.message);
            });

            req.pipe(proxyReq);
        });

        // WebSocket upgrade forwarding
        _proxyServer.on('upgrade', (req, socket, head) => {
            const target = net.connect(_targetPort, '127.0.0.1', () => {
                target.write(req.method + ' ' + req.url + ' HTTP/' + req.httpVersion + '\\r\\n');
                for (let i = 0; i < req.rawHeaders.length; i += 2) {
                    target.write(req.rawHeaders[i] + ': ' + req.rawHeaders[i + 1] + '\\r\\n');
                }
                target.write('\\r\\n');
                if (head && head.length) target.write(head);
                socket.pipe(target);
                target.pipe(socket);
            });
            target.on('error', () => socket.destroy());
            socket.on('error', () => target.destroy());
        });

        _proxyServer.listen(0, '127.0.0.1');
        _proxyPort = _proxyServer.address().port;
        console.log('[Antigravity Switcher] Local proxy server running on port ' + _proxyPort + ' -> ' + _targetPort);
        return 'http://127.0.0.1:' + _proxyPort + '/';
    };
})();
// === ANTIGRAVITY ACCOUNT SWITCHER REVERSE PROXY END ===
`;

function patchAgy(target) {
    console.log(`Checking Antigravity agy extension at: ${target.extFile}`);
    let code = fs.readFileSync(target.extFile, 'utf8');

    // 1. Create backup if not exists
    const backupFile = target.extFile + '.original.bak';
    if (!fs.existsSync(backupFile)) {
        fs.writeFileSync(backupFile, code, 'utf8');
        console.log(`✓ Created backup at: ${backupFile}`);
    }

    // 2. Ensure injected JS exists in agy directory
    const srcInjectedJs = path.join(__dirname, '..', 'antigravity_switcher_injected.js');
    const dstInjectedJs = path.join(target.agyDir, 'antigravity_switcher_injected.js');
    if (fs.existsSync(srcInjectedJs)) {
        fs.copyFileSync(srcInjectedJs, dstInjectedJs);
        console.log(`✓ Copied antigravity_switcher_injected.js to ${dstInjectedJs}`);
    }

    let modified = false;

    // 3. Inject proxy logic if missing
    if (!code.includes('__agyProxyInitialized')) {
        code = PROXY_CODE + '\n' + code;
        modified = true;
        console.log('✓ Injected reverse proxy and API handlers into agy extension');
    } else {
        console.log('• Reverse proxy logic already present in agy extension.');
    }

    // 4. Hook into renderIframe
    const hookTarget = 'renderIframe(a,b,c){var d=this.buildIframeUrl(b,c);';
    const hookReplacement = 'renderIframe(a,b,c){b=global.__agyGetProxy?global.__agyGetProxy(b):b;var d=this.buildIframeUrl(b,c);';

    if (code.includes(hookTarget)) {
        code = code.replace(hookTarget, hookReplacement);
        modified = true;
        console.log('✓ Hooked into renderIframe to route chat UI through switcher proxy');
    } else if (code.includes('global.__agyGetProxy?global.__agyGetProxy(b):b')) {
        console.log('• renderIframe hook already active.');
    } else {
        console.warn('⚠️ Could not find exact renderIframe pattern. Checking alternative...');
    }

    if (modified) {
        fs.writeFileSync(target.extFile, code, 'utf8');
        console.log('🎉 Successfully applied chat UI enhancements to Antigravity!');
    } else {
        console.log('✅ Antigravity is already up to date.');
    }
}

function main() {
    console.log('=== Antigravity Chat UI Usage & Switcher Patcher ===');
    const target = findAgyExtension();
    if (!target) {
        console.error('❌ Could not find Antigravity agy extension directory in /Applications');
        process.exit(1);
    }
    patchAgy(target);
}

if (require.main === module) {
    main();
}

module.exports = { patchAgy, findAgyExtension };
