const vscode = require('vscode');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

/**
 * Antigravity Multi-Account Switcher (Top Right Sidebar & In-Editor Navigation)
 * Version 3.4.0
 * 
 * Features:
 * - Top Right Secondary Sidebar panel (alongside Claude Code and Codex)
 * - Top Right Editor Title button (⚡ Switch Google Account)
 * - Auto-detects Google Cloud (GCP) vs Personal (Consumer) accounts
 * - 1-Click instant switching with auto-restart & tab restoration
 * - Clean "Add Another Google Account" (Personal or GCP Cloud)
 * - QuickPick title bar with Add & Refresh action buttons
 * - Rate limit detection with auto-switch prompts
 * - Optional bottom status bar item (default disabled, moved to Top Right)
 */
function activate(context) {
    console.log('Antigravity Account Switcher v3.4.0 (Top Right Panel & Modal) active');

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

    async function restoreWorkspaceState(state) {
        if (!state) return;
        try {
            await new Promise(r => setTimeout(r, 600));

            if (state.openEditors && state.openEditors.length > 0) {
                let activeUri = null;
                for (const ed of state.openEditors) {
                    try {
                        const uri = vscode.Uri.parse(ed.uri);
                        const doc = await vscode.workspace.openTextDocument(uri);
                        await vscode.window.showTextDocument(doc, {
                            viewColumn: ed.viewColumn || 1,
                            preserveFocus: !ed.isActive,
                            preview: false
                        });
                        if (ed.isActive) {
                            activeUri = uri;
                        }
                    } catch (e) {}
                }
                if (activeUri) {
                    try {
                        const doc = await vscode.workspace.openTextDocument(activeUri);
                        await vscode.window.showTextDocument(doc, { preserveFocus: false });
                    } catch (e) {}
                }
            }
        } catch (e) {
            console.error('Error during workspace restoration:', e);
        }
    }

    const pendingState = getPendingWorkspaceState();
    if (pendingState) {
        restoreWorkspaceState(pendingState);
    }

    function runProfileManager(action, profileName = null) {
        return new Promise((resolve) => {
            let cmd = `python3 "${scriptPath}" --action ${action}`;
            if (profileName) {
                cmd += ` --profile-name "${profileName.replace(/"/g, '\\"')}"`;
            }
            exec(cmd, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
                if (err) {
                    resolve({ success: false, error: stderr || err.message });
                    return;
                }
                const output = stdout.trim();
                let parsed = null;
                try {
                    parsed = JSON.parse(output);
                } catch (e) {
                    parsed = output;
                }
                resolve({ success: true, data: parsed });
            });
        });
    }

    async function detectCurrentAccount() {
        const res = await runProfileManager('DetectAccount');
        if (res.success && typeof res.data === 'object' && res.data) {
            return {
                email: res.data.Email || '',
                authMethod: res.data.AuthMethod || 'consumer',
                projectId: res.data.ProjectId || '',
                displayName: res.data.DisplayName || '',
                profileName: res.data.ProfileName || '',
                isCloud: !!res.data.IsCloud
            };
        }
        return {
            email: '',
            authMethod: 'consumer',
            projectId: '',
            displayName: '',
            profileName: '',
            isCloud: false
        };
    }

    async function getProfiles() {
        const res = await runProfileManager('List');
        if (res.success && Array.isArray(res.data)) {
            return res.data;
        }
        return [];
    }

    // ============================================
    // STATUS BAR ITEM (OPTIONAL / MOVE TO TOP RIGHT)
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
                const label = acct.projectId ? `Cloud: ${acct.projectId}` : (acct.displayName || 'Google Cloud');
                accountStatusBarItem.text = `$(cloud) ${label}`;
                accountStatusBarItem.color = '#38bdf8';
                accountStatusBarItem.tooltip = `Active Session: ${acct.email || 'Google Cloud'}\nMode: Google Cloud (Project: ${acct.projectId || 'N/A'})\nClick to open Account Switcher menu`;
            } else {
                const label = acct.email || activeProfile || 'Personal';
                accountStatusBarItem.text = `$(pass-filled) ${label}`;
                accountStatusBarItem.color = '#4ade80';
                accountStatusBarItem.tooltip = `Active Session: ${label}\nMode: Personal Google Account\nClick to open Account Switcher menu`;
            }
        } else {
            accountStatusBarItem.text = `$(warning) Antigravity: Sign In`;
            accountStatusBarItem.color = '#fbbf24';
            accountStatusBarItem.tooltip = `No Google Account detected. Click to Sign In.`;
        }

        const showBottom = vscode.workspace.getConfiguration('antigravitySwitcher').get('showBottomStatusBar', false);
        if (showBottom) {
            accountStatusBarItem.show();
        } else {
            accountStatusBarItem.hide();
        }

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

        if (accountViewProvider) {
            accountViewProvider.update();
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
            vscode.window.showErrorMessage(`Failed to switch profile to ${profileName}: ${result.error}`);
        }
    }

    // ============================================
    // SELECT ACCOUNT QUICKPICK MODAL
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
                const label = acct.email || activeProfile || 'Personal';
                activeItem = {
                    label: `$(pass-filled) ${label}`,
                    description: '✓ ACTIVE PERSONAL SESSION',
                    detail: 'Active Personal Google Account',
                    action: 'already_active',
                    email: acct.email,
                    target: acct.profileName,
                    alwaysShow: true
                };
            }
        }

        const items = [];

        if (activeItem) {
            items.push(activeItem);
        }

        if (inactiveItems.length > 0) {
            items.push({
                label: 'SAVED ACCOUNTS (CLICK TO SWITCH)',
                kind: vscode.QuickPickItemKind.Separator
            });
            items.push(...inactiveItems);
        }

        items.push({
            label: 'ACTIONS',
            kind: vscode.QuickPickItemKind.Separator
        });

        items.push({
            label: '$(add) Add / Sign In to Another Google Account...',
            detail: 'Add another Personal Google ID or connect another Google Cloud Project',
            action: 'add_new',
            alwaysShow: true
        });

        items.push({
            label: '$(sidebar-right) Open Account Panel in Top Right Secondary Sidebar',
            detail: 'View and manage accounts in the dedicated Top Right panel alongside Claude Code',
            action: 'open_top_right',
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

        // Create advanced QuickPick Modal
        const qp = vscode.window.createQuickPick();
        qp.title = '⚡ Antigravity Google Account Switcher';
        const currentLabel = acct.isCloud ? `Cloud: ${acct.projectId}` : (acct.email || activeProfile || 'None');
        qp.placeholder = `Current: ${currentLabel} • Select an account to switch or add new`;
        qp.items = items;
        qp.matchOnDescription = true;
        qp.matchOnDetail = true;
        qp.ignoreFocusOut = false;

        qp.buttons = [
            { iconPath: new vscode.ThemeIcon('add'), tooltip: 'Add / Sign In to Another Google Account' },
            { iconPath: new vscode.ThemeIcon('sidebar-right'), tooltip: 'Open Top Right Sidebar Panel' },
            { iconPath: new vscode.ThemeIcon('refresh'), tooltip: 'Sync Current Account' }
        ];

        qp.onDidTriggerButton(async (button) => {
            qp.hide();
            if (button.tooltip.includes('Add')) {
                triggerAddNewAccount(acct);
            } else if (button.tooltip.includes('Top Right')) {
                openTopRightPanel();
            } else if (button.tooltip.includes('Sync')) {
                triggerSync(acct);
            }
        });

        qp.onDidAccept(async () => {
            const selected = qp.selectedItems[0];
            qp.hide();
            if (!selected) return;

            if (selected.action === 'already_active') {
                // Already active
            } else if (selected.action === 'switch') {
                switchAccount(selected.target);
            } else if (selected.action === 'add_new') {
                triggerAddNewAccount(acct);
            } else if (selected.action === 'open_top_right') {
                openTopRightPanel();
            } else if (selected.action === 'sync') {
                triggerSync(acct);
            } else if (selected.action === 'delete') {
                triggerDelete(profiles);
            }
        });

        qp.show();
    });
    context.subscriptions.push(selectAccountCmd);

    async function openTopRightPanel() {
        try {
            await vscode.commands.executeCommand('antigravityAccountView.focus');
        } catch (e) {
            try {
                await vscode.commands.executeCommand('workbench.action.focusAuxiliaryBar');
            } catch (e2) {}
        }
    }

    const openPanelCmd = vscode.commands.registerCommand('antigravity-switcher.openTopRightPanel', openTopRightPanel);
    context.subscriptions.push(openPanelCmd);

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
                'To add a Google Cloud (GCP) Account:\n1. Open Antigravity Desktop App (/Applications/Antigravity.app)\n2. Sign in with your GCP Project ID\n3. In this IDE, click "Sync Current Account Credentials"!',
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

    async function triggerDelete(profilesOrTarget) {
        let targetName = null;
        if (typeof profilesOrTarget === 'string') {
            targetName = profilesOrTarget;
        } else {
            const profiles = Array.isArray(profilesOrTarget) ? profilesOrTarget : await getProfiles();
            const deleteItems = profiles.map(p => ({
                label: `${p.IsCloud ? '$(cloud)' : '$(account)'} ${p.Email || p.Name}`,
                description: p.IsCloud ? `☁️ GCP: ${p.ProjectId}` : '👤 Personal',
                target: p.Name || p.name
            }));
            const toDelete = await vscode.window.showQuickPick(deleteItems, {
                placeHolder: 'Select an account to remove from the switcher list'
            });
            if (toDelete) {
                targetName = toDelete.target;
            }
        }

        if (targetName) {
            const conf = await vscode.window.showWarningMessage(
                `Remove "${targetName}" from switcher?`,
                { modal: true },
                'Remove'
            );
            if (conf === 'Remove') {
                await runProfileManager('Delete', targetName);
                vscode.window.showInformationMessage(`Removed "${targetName}".`);
                updateStatusBar();
            }
        }
    }

    // ============================================
    // TOP RIGHT SECONDARY SIDEBAR WEBVIEW PROVIDER
    // ============================================
    class AntigravityAccountViewProvider {
        constructor(extensionUri) {
            this._extensionUri = extensionUri;
            this._view = null;
        }

        resolveWebviewView(webviewView) {
            this._view = webviewView;
            webviewView.webview.options = {
                enableScripts: true,
                localResourceRoots: [this._extensionUri]
            };

            webviewView.webview.html = this._getHtmlForWebview();

            webviewView.webview.onDidReceiveMessage(async (data) => {
                if (data.type === 'switch') {
                    await switchAccount(data.profile);
                } else if (data.type === 'add') {
                    const acct = await detectCurrentAccount();
                    await triggerAddNewAccount(acct);
                } else if (data.type === 'delete') {
                    await triggerDelete(data.profile);
                } else if (data.type === 'ready' || data.type === 'refresh') {
                    this.update();
                } else if (data.type === 'openModal') {
                    vscode.commands.executeCommand('antigravity-switcher.selectAccount');
                }
            });

            this.update();
        }

        async update() {
            if (!this._view) return;
            try {
                const acct = await detectCurrentAccount();
                const profiles = await getProfiles();
                this._view.webview.postMessage({
                    type: 'state',
                    active: acct,
                    profiles: profiles
                });
            } catch (e) {
                console.error('Failed to update webview:', e);
            }
        }

        _getHtmlForWebview() {
            return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  * { box-sizing: border-box; }
  body {
    font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
    font-size: var(--vscode-font-size, 13px);
    color: var(--vscode-foreground, #cccccc);
    background-color: var(--vscode-sideBar-background, #1e1e1e);
    padding: 14px;
    margin: 0;
  }
  .header-title {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: var(--vscode-descriptionForeground, #888888);
    margin-bottom: 10px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .refresh-icon {
    cursor: pointer;
    opacity: 0.7;
    font-size: 14px;
    transition: opacity 0.2s;
  }
  .refresh-icon:hover { opacity: 1; }
  .active-card {
    background: var(--vscode-editor-background, #252526);
    border: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.12));
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 18px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.25);
  }
  .active-top {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
  }
  .avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: rgba(255,255,255,0.08);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
  }
  .active-details {
    flex: 1;
    min-width: 0;
  }
  .active-email {
    font-size: 13px;
    font-weight: 600;
    color: var(--vscode-editor-foreground, #ffffff);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 12px;
    margin-top: 2px;
  }
  .badge-personal {
    background: rgba(74, 222, 128, 0.15);
    color: #4ade80;
    border: 1px solid rgba(74, 222, 128, 0.3);
  }
  .badge-cloud {
    background: rgba(56, 189, 248, 0.15);
    color: #38bdf8;
    border: 1px solid rgba(56, 189, 248, 0.3);
  }
  .status-line {
    font-size: 11px;
    color: #4ade80;
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px solid rgba(255,255,255,0.06);
  }
  .pulse-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #4ade80;
    box-shadow: 0 0 6px #4ade80;
  }
  .profiles-container {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 14px;
  }
  .profile-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: var(--vscode-editor-background, #252526);
    border: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.08));
    border-radius: 6px;
    padding: 8px 10px;
    transition: all 0.15s ease;
  }
  .profile-row:hover {
    border-color: rgba(255,255,255,0.2);
    background: var(--vscode-list-hoverBackground, rgba(255,255,255,0.04));
  }
  .p-info {
    flex: 1;
    min-width: 0;
    margin-right: 8px;
  }
  .p-email {
    font-size: 12px;
    font-weight: 500;
    color: var(--vscode-editor-foreground, #eeeeee);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .p-meta {
    font-size: 10px;
    color: var(--vscode-descriptionForeground, #888888);
    margin-top: 1px;
  }
  .p-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .btn-switch {
    background: var(--vscode-button-background, #0e639c);
    color: var(--vscode-button-foreground, #ffffff);
    border: none;
    border-radius: 4px;
    padding: 4px 9px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    transition: opacity 0.15s;
  }
  .btn-switch:hover {
    background: var(--vscode-button-hoverBackground, #1177bb);
  }
  .btn-del {
    background: transparent;
    color: var(--vscode-descriptionForeground, #888888);
    border: none;
    border-radius: 4px;
    padding: 4px 6px;
    font-size: 11px;
    cursor: pointer;
    opacity: 0.5;
    transition: opacity 0.15s;
  }
  .btn-del:hover {
    opacity: 1;
    color: #f87171;
  }
  .btn-add {
    width: 100%;
    padding: 8px;
    font-size: 12px;
    font-weight: 600;
    border-radius: 6px;
    border: 1px dashed var(--vscode-button-border, rgba(255,255,255,0.25));
    background: transparent;
    color: var(--vscode-foreground, #cccccc);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    transition: all 0.15s;
  }
  .btn-add:hover {
    background: var(--vscode-list-hoverBackground, rgba(255,255,255,0.08));
    border-color: var(--vscode-button-background, #38bdf8);
    color: #ffffff;
  }
  .quick-modal-btn {
    width: 100%;
    margin-top: 8px;
    padding: 7px;
    font-size: 11px;
    font-weight: 500;
    border-radius: 6px;
    border: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.1));
    background: rgba(255,255,255,0.03);
    color: var(--vscode-descriptionForeground, #999999);
    cursor: pointer;
    transition: all 0.15s;
  }
  .quick-modal-btn:hover {
    background: rgba(255,255,255,0.06);
    color: var(--vscode-foreground, #ffffff);
  }
</style>
</head>
<body>
  <div class="header-title">
    <span>Active Account</span>
    <span class="refresh-icon" id="btn-refresh" title="Refresh Accounts">↻</span>
  </div>

  <div class="active-card" id="active-card">
    <div class="active-top">
      <div class="avatar" id="active-avatar">👤</div>
      <div class="active-details">
        <div class="active-email" id="active-email">Loading account...</div>
        <div class="badge badge-personal" id="active-badge">Personal Account</div>
      </div>
    </div>
    <div class="status-line">
      <span class="pulse-dot"></span>
      <span id="active-status">Active Session • Ready</span>
    </div>
  </div>

  <div class="header-title">
    <span>Saved Google Accounts</span>
  </div>

  <div class="profiles-container" id="profiles-list">
    <div style="font-size: 11px; color: var(--vscode-descriptionForeground); text-align: center; padding: 12px;">Loading accounts...</div>
  </div>

  <button class="btn-add" id="btn-add">+ Add Another Google Account</button>
  <button class="quick-modal-btn" id="btn-quick-modal">⚡ Open QuickPick Modal Dropdown</button>

<script>
  const vscode = acquireVsCodeApi();

  document.getElementById('btn-refresh').addEventListener('click', () => {
    vscode.postMessage({ type: 'refresh' });
  });

  document.getElementById('btn-add').addEventListener('click', () => {
    vscode.postMessage({ type: 'add' });
  });

  document.getElementById('btn-quick-modal').addEventListener('click', () => {
    vscode.postMessage({ type: 'openModal' });
  });

  window.addEventListener('message', event => {
    const message = event.data;
    if (message.type === 'state') {
      renderState(message.active, message.profiles);
    }
  });

  function renderState(active, profiles) {
    if (!active) active = {};
    if (!profiles) profiles = [];

    const isCloud = !!active.IsCloud || !!active.isCloud;
    const email = active.Email || active.email || active.displayName || 'No Account Detected';
    const projId = active.ProjectId || active.projectId || '';

    document.getElementById('active-email').textContent = email;
    document.getElementById('active-avatar').textContent = isCloud ? '☁️' : '👤';
    const badge = document.getElementById('active-badge');
    if (isCloud) {
      badge.textContent = projId ? '☁️ Cloud (' + projId + ')' : '☁️ Google Cloud';
      badge.className = 'badge badge-cloud';
    } else {
      badge.textContent = '🟢 Personal Google Account';
      badge.className = 'badge badge-personal';
    }

    const container = document.getElementById('profiles-list');
    container.innerHTML = '';

    const otherProfiles = profiles.filter(p => {
      const pEmail = p.Email || p.email || p.Name;
      const pIsCloud = !!p.IsCloud;
      return !(pEmail.toLowerCase() === email.toLowerCase() && pIsCloud === isCloud);
    });

    if (otherProfiles.length === 0) {
      container.innerHTML = '<div style="font-size: 11px; color: var(--vscode-descriptionForeground); text-align: center; padding: 10px;">No other saved accounts. Click below to add one!</div>';
      return;
    }

    otherProfiles.forEach(p => {
      const pName = p.Name || p.name;
      const pEmail = p.Email || p.email || pName;
      const pCloud = !!p.IsCloud;
      const pProj = p.ProjectId || '';

      const row = document.createElement('div');
      row.className = 'profile-row';

      const info = document.createElement('div');
      info.className = 'p-info';
      info.innerHTML = \`<div class="p-email">\${pCloud ? '☁️' : '👤'} \${pEmail}</div>
                         <div class="p-meta">\${pCloud ? 'Google Cloud (' + (pProj || 'GCP') + ')' : 'Personal Account'}</div>\`;

      const actions = document.createElement('div');
      actions.className = 'p-actions';

      const switchBtn = document.createElement('button');
      switchBtn.className = 'btn-switch';
      switchBtn.textContent = '⇄ Switch';
      switchBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'switch', profile: pName });
      });

      const delBtn = document.createElement('button');
      delBtn.className = 'btn-del';
      delBtn.title = 'Remove';
      delBtn.textContent = '✕';
      delBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'delete', profile: pName });
      });

      actions.appendChild(switchBtn);
      actions.appendChild(delBtn);

      row.appendChild(info);
      row.appendChild(actions);
      container.appendChild(row);
    });
  }

  vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
        }
    }

    const accountViewProvider = new AntigravityAccountViewProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('antigravityAccountView', accountViewProvider)
    );

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
                '⚠️ Antigravity rate limit detected! Use the Top Right account switcher to add another Google account.'
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
