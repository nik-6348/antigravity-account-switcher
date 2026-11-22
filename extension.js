const vscode = require('vscode');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

/**
 * Antigravity Multi-Account Switcher (Premium Dropdown UI with Cloud & Personal Support)
 * Version 3.2.0
 * 
 * Features:
 * - Auto-detects Google Cloud (GCP) vs Personal (Consumer) accounts
 * - Single clean status bar item:
 *     * ☁️ Cloud Blue (#38bdf8) for Google Cloud projects
 *     * 🟢 Bright Green (#4ade80) for Personal Google accounts
 * - Active account ALWAYS at the top of the dropdown with live badge
 * - Dedicated "Switch to Another Account" section with Cloud/Personal icons
 * - 1-Click instant switching with auto-restart & tab restoration
 * - Clean "Add Another Google Account" (Personal or GCP Cloud)
 * - QuickPick title bar with Add & Refresh action buttons
 * - Rate limit detection with auto-switch prompts
 */
function activate(context) {
    console.log('Antigravity Account Switcher v3.2.0 (Cloud & Personal Support) active');

    const scriptPath = path.join(context.extensionPath, 'scripts', 'profile_manager.py');
    const homedir = os.homedir();
    const appSupportDir = path.join(homedir, 'Library', 'Application Support', 'Antigravity IDE');

    const ACTIVE_PROFILE_FILE = path.join(appSupportDir, 'active_profile.txt');
    const PENDING_STATE_FILE = path.join(appSupportDir, 'pending_state.json');

    function getActiveProfile() {
        try {
            if (fs.existsSync(ACTIVE_PROFILE_FILE)) {
                return fs.readFileSync(ACTIVE_PROFILE_FILE, 'utf8').trim();
            }
        } catch (e) {
            console.error('Error reading active profile:', e);
        }
        return null;
    }

    function setActiveProfile(profileName) {
        try {
            const dir = path.dirname(ACTIVE_PROFILE_FILE);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(ACTIVE_PROFILE_FILE, profileName.trim(), 'utf8');
            return true;
        } catch (e) {
            console.error('Error saving active profile:', e);
            return false;
        }
    }

    function saveFullWorkspaceState() {
        try {
            const state = {
                version: 1,
                timestamp: new Date().toISOString(),
                workspaceFolders: [],
                openEditors: [],
                activeEditorUri: null
            };

            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders && workspaceFolders.length > 0) {
                state.workspaceFolders = workspaceFolders.map(f => f.uri.fsPath);
            }

            if (vscode.window.tabGroups) {
                const tabGroups = vscode.window.tabGroups;
                for (const group of tabGroups.all) {
                    for (const tab of group.tabs) {
                        if (tab.input && tab.input.uri) {
                            state.openEditors.push({
                                uri: tab.input.uri.toString(),
                                viewColumn: group.viewColumn || 1,
                                isActive: tabGroups.activeTabGroup === group && group.activeTab === tab
                            });
                        }
                    }
                }
                const activeEditor = vscode.window.activeTextEditor;
                if (activeEditor) {
                    state.activeEditorUri = activeEditor.document.uri.toString();
                }
            }

            const dir = path.dirname(PENDING_STATE_FILE);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(PENDING_STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
            return true;
        } catch (e) {
            console.error('Error saving workspace state:', e);
        }
        return false;
    }

    function getPendingWorkspaceState() {
        try {
            if (fs.existsSync(PENDING_STATE_FILE)) {
                const stateJson = fs.readFileSync(PENDING_STATE_FILE, 'utf8');
                const state = JSON.parse(stateJson);
                fs.unlinkSync(PENDING_STATE_FILE);
                return state;
            }
        } catch (e) {
            console.error('Error reading pending state:', e);
        }
        return null;
    }

    async function restoreEditors(state) {
        if (!state || !state.openEditors || state.openEditors.length === 0) return;

        const editorsByColumn = {};
        for (const editor of state.openEditors) {
            const col = editor.viewColumn || 1;
            if (!editorsByColumn[col]) {
                editorsByColumn[col] = [];
            }
            editorsByColumn[col].push(editor);
        }

        for (const [column, editors] of Object.entries(editorsByColumn)) {
            for (const editor of editors) {
                try {
                    const uri = vscode.Uri.parse(editor.uri);
                    if (fs.existsSync(uri.fsPath)) {
                        await vscode.window.showTextDocument(uri, {
                            viewColumn: parseInt(column),
                            preview: false,
                            preserveFocus: !editor.isActive
                        });
                    }
                } catch (e) {}
            }
        }

        if (state.activeEditorUri) {
            try {
                const uri = vscode.Uri.parse(state.activeEditorUri);
                if (fs.existsSync(uri.fsPath)) {
                    await vscode.window.showTextDocument(uri, { preview: false });
                }
            } catch (e) {}
        }
    }

    // Workspace & tab restoration on startup
    const pendingState = getPendingWorkspaceState();
    if (pendingState) {
        if (pendingState.workspaceFolders && pendingState.workspaceFolders.length > 0) {
            const firstFolder = pendingState.workspaceFolders[0];
            const currentWorkspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

            if (currentWorkspace !== firstFolder && fs.existsSync(firstFolder)) {
                vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(firstFolder), false).then(() => {
                    setTimeout(() => restoreEditors(pendingState), 2000);
                });
            } else {
                restoreEditors(pendingState);
            }
        } else if (pendingState.openEditors && pendingState.openEditors.length > 0) {
            restoreEditors(pendingState);
        }
    }

    function runProfileManager(action, profileName = '') {
        return new Promise((resolve) => {
            const args = profileName
                ? `--action "${action}" --profile-name "${profileName}"`
                : `--action "${action}"`;
            const command = `python3 "${scriptPath}" ${args}`;

            exec(command, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
                if (error) {
                    resolve({ success: false, output: stdout, error: stderr || error.message });
                } else {
                    resolve({ success: true, output: stdout, error: null });
                }
            });
        });
    }

    async function getProfiles() {
        const result = await runProfileManager('List');
        if (!result.success && !result.output) return [];

        try {
            const parsed = JSON.parse(result.output.trim());
            if (Array.isArray(parsed)) return parsed;
            if (Array.isArray(parsed.Profiles)) return parsed.Profiles;
        } catch (e) {
            const match = result.output.match(/\[[\s\S]*?\]/);
            if (match) {
                try {
                    const profiles = JSON.parse(match[0]);
                    return Array.isArray(profiles) ? profiles : [];
                } catch (e2) {}
            }
        }
        return [];
    }

    async function detectCurrentAccount() {
        const result = await runProfileManager('DetectAccount');
        try {
            const parsed = JSON.parse(result.output.trim());
            return {
                email: parsed.Email || '',
                authMethod: parsed.AuthMethod || 'consumer',
                projectId: parsed.ProjectId || '',
                displayName: parsed.DisplayName || parsed.Email || '',
                profileName: parsed.ProfileName || parsed.Email || '',
                isCloud: !!parsed.IsCloud
            };
        } catch (e) {
            return {
                email: '',
                authMethod: 'consumer',
                projectId: '',
                displayName: '',
                profileName: '',
                isCloud: false
            };
        }
    }

    // ============================================
    // STATUS BAR ITEM (SMART BADGE: CLOUD / PERSONAL)
    // ============================================
    const accountStatusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left,
        500
    );
    accountStatusBarItem.command = 'antigravity-switcher.selectAccount';
    context.subscriptions.push(accountStatusBarItem);

    async function updateStatusBar() {
        const acct = await detectCurrentAccount();
        const activeProfile = getActiveProfile();

        if (acct.email || acct.projectId || activeProfile) {
            if (acct.isCloud) {
                // Google Cloud Session
                const label = acct.projectId ? `Cloud: ${acct.projectId}` : (acct.displayName || 'Google Cloud');
                accountStatusBarItem.text = `$(cloud) ${label}`;
                accountStatusBarItem.color = '#38bdf8'; // Sky Blue
                accountStatusBarItem.tooltip = `Active Session: ${acct.email || 'Google Cloud'}\nMode: Google Cloud (Project: ${acct.projectId || 'N/A'})\nClick to open Account Switcher menu`;
            } else {
                // Personal Google Account
                const label = acct.email || activeProfile || 'Personal';
                accountStatusBarItem.text = `$(pass-filled) ${label}`;
                accountStatusBarItem.color = '#4ade80'; // Bright Green
                accountStatusBarItem.tooltip = `Active Session: ${label}\nMode: Personal Google Account\nClick to open Account Switcher menu`;
            }
        } else {
            accountStatusBarItem.text = `$(warning) Antigravity: Sign In`;
            accountStatusBarItem.color = '#fbbf24';
            accountStatusBarItem.tooltip = `No Google Account detected. Click to Sign In.`;
        }
        accountStatusBarItem.show();

        // Auto-save account into profiles if new
        if (acct.profileName) {
            const profiles = await getProfiles();
            const exists = profiles.some(p => 
                (p.Name && p.Name.toLowerCase() === acct.profileName.toLowerCase()) ||
                (p.DisplayName && p.DisplayName.toLowerCase() === acct.displayName.toLowerCase())
            );
            if (!exists) {
                await runProfileManager('Save', acct.profileName);
                setActiveProfile(acct.profileName);
            }
        }
    }

    /**
     * Switch to target profile (Instant Direct Reload with zero popups)
     */
    async function switchAccount(profileName) {
        const acct = await detectCurrentAccount();
        const activeProfile = getActiveProfile();

        if ((activeProfile && activeProfile.toLowerCase() === profileName.toLowerCase()) ||
            (acct.profileName && acct.profileName.toLowerCase() === profileName.toLowerCase())) {
            return;
        }

        saveFullWorkspaceState();
        setActiveProfile(profileName);

        const result = await runProfileManager('Load', profileName);
        if (result.success) {
            await vscode.commands.executeCommand('workbench.action.reloadWindow');
        } else {
            vscode.window.showErrorMessage(`Failed to switch account: ${result.error || result.output}`);
        }
    }

    // ============================================
    // PREMIUM QUICKPICK DROPDOWN (ACTIVE AT TOP)
    // ============================================
    const selectAccountCmd = vscode.commands.registerCommand('antigravity-switcher.selectAccount', async () => {
        const profiles = await getProfiles();
        const acct = await detectCurrentAccount();
        const activeProfile = getActiveProfile() || acct.profileName;

        let activeItem = null;
        const inactiveItems = [];

        for (const p of profiles) {
            const pName = p.Name || p.name;
            const pEmail = p.Email || p.email || pName;
            const pDisp = p.DisplayName || pName;
            const isCloud = !!p.IsCloud;
            const projId = p.ProjectId || '';

            const isActive = activeProfile && (
                activeProfile.toLowerCase() === pName.toLowerCase() ||
                (acct.profileName && acct.profileName.toLowerCase() === pName.toLowerCase()) ||
                (acct.email && pEmail && acct.email.toLowerCase() === pEmail.toLowerCase() && acct.isCloud === isCloud)
            );

            if (isActive) {
                if (isCloud) {
                    activeItem = {
                        label: `$(cloud) ${pEmail}`,
                        description: `☁️ ACTIVE GOOGLE CLOUD [Project: ${projId}]`,
                        detail: `Active Google Cloud Project session (${projId}) • Cloud billing & quota`,
                        action: 'already_active',
                        email: pEmail,
                        target: pName,
                        alwaysShow: true
                    };
                } else {
                    activeItem = {
                        label: `$(pass-filled) ${pEmail}`,
                        description: '✓ ACTIVE PERSONAL SESSION',
                        detail: 'Active Personal Google Account • Standard Gemini quota',
                        action: 'already_active',
                        email: pEmail,
                        target: pName,
                        alwaysShow: true
                    };
                }
            } else {
                if (isCloud) {
                    inactiveItems.push({
                        label: `$(cloud) ${pEmail}`,
                        description: `☁️ Google Cloud Project: ${projId || 'GCP'}`,
                        detail: 'Instant switch to Google Cloud session (auto-restarts IDE & restores open tabs)',
                        action: 'switch',
                        email: pEmail,
                        target: pName,
                        alwaysShow: true
                    });
                } else {
                    inactiveItems.push({
                        label: `$(account) ${pEmail}`,
                        description: '👤 Personal Google Account',
                        detail: 'Instant switch to Personal Google session (auto-restarts IDE & restores open tabs)',
                        action: 'switch',
                        email: pEmail,
                        target: pName,
                        alwaysShow: true
                    });
                }
            }
        }

        // If active account was not in profiles list yet, create active item for it
        if (!activeItem && (acct.email || acct.projectId || activeProfile)) {
            if (acct.isCloud) {
                activeItem = {
                    label: `$(cloud) ${acct.email || acct.projectId}`,
                    description: `☁️ ACTIVE GOOGLE CLOUD [${acct.projectId}]`,
                    detail: `Active Google Cloud Project session (${acct.projectId})`,
                    action: 'already_active',
                    email: acct.email,
                    target: acct.profileName,
                    alwaysShow: true
                };
            } else {
                activeItem = {
                    label: `$(pass-filled) ${acct.email || activeProfile}`,
                    description: '✓ ACTIVE PERSONAL SESSION',
                    detail: 'Active Personal Google Account',
                    action: 'already_active',
                    email: acct.email,
                    target: acct.profileName,
                    alwaysShow: true
                };
            }
        }

        // Build list: ACTIVE ACCOUNT ALWAYS AT THE TOP!
        const items = [];

        // 1. Current Active Account (TOP)
        items.push({
            label: 'CURRENT ACTIVE ACCOUNT',
            kind: vscode.QuickPickItemKind.Separator
        });

        if (activeItem) {
            items.push(activeItem);
        }

        // 2. Inactive Accounts to switch to
        if (inactiveItems.length > 0) {
            items.push({
                label: 'SWITCH TO ANOTHER ACCOUNT',
                kind: vscode.QuickPickItemKind.Separator
            });
            for (const item of inactiveItems) {
                items.push(item);
            }
        }

        // 3. Actions Section
        items.push({
            label: 'MANAGE ACCOUNTS',
            kind: vscode.QuickPickItemKind.Separator
        });

        items.push({
            label: '$(add) Add / Sign In to Another Google Account...',
            detail: 'Add another Personal Google ID or connect another Google Cloud Project',
            action: 'add_new',
            alwaysShow: true
        });

        items.push({
            label: '$(refresh) Sync Current Account Credentials',
            detail: `Update saved token and files for "${activeProfile || acct.displayName || 'active'}"`,
            action: 'sync',
            alwaysShow: true
        });

        if (profiles.length > 1) {
            items.push({
                label: '$(trash) Remove a Saved Account Profile...',
                detail: 'Delete an account from the switcher list',
                action: 'delete',
                alwaysShow: true
            });
        }

        // Create advanced QuickPick
        const qp = vscode.window.createQuickPick();
        qp.title = 'Antigravity Google Account Switcher';
        const currentLabel = acct.isCloud ? `Cloud: ${acct.projectId}` : (acct.email || activeProfile || 'None');
        qp.placeholder = `Current: ${currentLabel} • Select an account to switch or add new`;
        qp.items = items;
        qp.matchOnDescription = true;
        qp.matchOnDetail = true;
        qp.ignoreFocusOut = false;

        // Title bar quick buttons
        qp.buttons = [
            { iconPath: new vscode.ThemeIcon('add'), tooltip: 'Add / Sign In to Another Google Account' },
            { iconPath: new vscode.ThemeIcon('refresh'), tooltip: 'Sync Current Account' }
        ];

        qp.onDidTriggerButton(async (button) => {
            qp.hide();
            if (button.tooltip.includes('Add')) {
                triggerAddNewAccount(acct);
            } else if (button.tooltip.includes('Sync')) {
                triggerSync(acct);
            }
        });

        qp.onDidAccept(async () => {
            const selected = qp.selectedItems[0];
            qp.hide();
            if (!selected) return;

            if (selected.action === 'already_active') {
                // Already active, silently do nothing
            } else if (selected.action === 'switch') {
                switchAccount(selected.target);
            } else if (selected.action === 'add_new') {
                triggerAddNewAccount(acct);
            } else if (selected.action === 'sync') {
                triggerSync(acct);
            } else if (selected.action === 'delete') {
                triggerDelete(profiles);
            }
        });

        qp.show();
    });
    context.subscriptions.push(selectAccountCmd);

    async function triggerAddNewAccount(acct) {
        const choice = await vscode.window.showQuickPick([
            {
                label: '$(account) Add Personal Google Account (Standard)',
                description: 'Sign into another Gmail / Google ID via standard login',
                detail: 'Saves current session, clears active credentials, and restarts IDE for Sign-In',
                action: 'personal'
            },
            {
                label: '$(cloud) Connect Google Cloud (GCP) Project',
                description: 'Login via Antigravity Desktop App with a GCP Project ID',
                detail: 'Shows step-by-step instructions to link a Google Cloud Vertex project',
                action: 'cloud'
            }
        ], {
            placeHolder: 'Which type of Google Account do you want to add?'
        });

        if (!choice) return;

        if (choice.action === 'personal') {
            saveFullWorkspaceState();
            const res = await runProfileManager('PrepareSignOut');
            if (res.success) {
                await vscode.commands.executeCommand('workbench.action.reloadWindow');
            }
        } else if (choice.action === 'cloud') {
            vscode.window.showInformationMessage(
                'To add a Google Cloud (GCP) Account:\n1. Open Antigravity Desktop App (/Applications/Antigravity.app)\n2. Sign in with your GCP Project ID\n3. In this IDE, click the status bar > "Sync Current Account Credentials"!',
                { modal: true },
                'Got It'
            );
        }
    }

    async function triggerSync(acct) {
        const profName = acct.profileName || getActiveProfile();
        if (!profName) {
            vscode.window.showErrorMessage('No active Google Account detected to sync.');
            return;
        }
        await runProfileManager('Save', profName);
        setActiveProfile(profName);
        vscode.window.showInformationMessage(`✓ Credentials updated for "${profName}".`);
        updateStatusBar();
    }

    async function triggerDelete(profiles) {
        const deleteItems = profiles.map(p => ({
            label: `${p.IsCloud ? '$(cloud)' : '$(account)'} ${p.Email || p.Name}`,
            description: p.IsCloud ? `☁️ GCP: ${p.ProjectId}` : '👤 Personal',
            target: p.Name || p.name
        }));
        const toDelete = await vscode.window.showQuickPick(deleteItems, {
            placeHolder: 'Select an account to remove from the switcher list'
        });
        if (toDelete) {
            const conf = await vscode.window.showWarningMessage(
                `Remove "${toDelete.target}" from switcher?`,
                { modal: true },
                'Remove'
            );
            if (conf === 'Remove') {
                await runProfileManager('Delete', toDelete.target);
                vscode.window.showInformationMessage(`Removed "${toDelete.target}".`);
                updateStatusBar();
            }
        }
    }

    // ============================================
    // RATE LIMIT AUTO-DETECTION & SWITCH
    // ============================================
    const RATE_LIMIT_PATTERNS = [
        'rate limit', 'quota exceeded', 'too many requests', 'limit reached',
        'resource exhausted', '429', 'RESOURCE_EXHAUSTED',
        'overloaded', 'capacity', 'rate_limit_error', 'overloaded_error'
    ];
    let lastRateLimitAlert = 0;

    async function handleRateLimitDetected() {
        const now = Date.now();
        if (now - lastRateLimitAlert < 60000) return;
        lastRateLimitAlert = now;

        const profiles = await getProfiles();
        const acct = await detectCurrentAccount();
        const activeProfile = getActiveProfile();

        const alternates = profiles.filter(p => {
            const pName = p.Name || p.name;
            return (!activeProfile || pName.toLowerCase() !== activeProfile.toLowerCase()) &&
                   (!acct.profileName || pName.toLowerCase() !== acct.profileName.toLowerCase());
        });

        if (alternates.length === 0) {
            vscode.window.showWarningMessage(
                '⚠️ Antigravity rate limit detected! Use the account dropdown in the status bar to add your 2nd Google account.'
            );
            return;
        }

        const options = alternates.map(p => p.Name || p.DisplayName || p.Email);
        options.push('Dismiss');

        const currentDesc = acct.isCloud ? `Cloud Project ${acct.projectId}` : (acct.email || 'this account');
        const picked = await vscode.window.showWarningMessage(
            `⚠️ Rate limit reached on ${currentDesc}! Switch to another account?`,
            ...options
        );

        if (picked && picked !== 'Dismiss') {
            switchAccount(picked);
        }
    }

    const diagnosticListener = vscode.languages.onDidChangeDiagnostics((e) => {
        for (const uri of e.uris) {
            const diags = vscode.languages.getDiagnostics(uri);
            for (const d of diags) {
                const msg = d.message.toLowerCase();
                if (RATE_LIMIT_PATTERNS.some(p => msg.includes(p))) {
                    handleRateLimitDetected();
                    return;
                }
            }
        }
    });
    context.subscriptions.push(diagnosticListener);

    // Periodic check (every 10s)
    const syncInterval = setInterval(() => {
        updateStatusBar();
    }, 10000);
    context.subscriptions.push({ dispose: () => clearInterval(syncInterval) });

    // Initial render
    updateStatusBar();
}

function deactivate() {
    console.log('Antigravity Account Switcher deactivated');
}

module.exports = {
    activate,
    deactivate
};
