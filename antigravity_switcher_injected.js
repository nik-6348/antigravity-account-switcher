/**
 * Antigravity Account & Usage Injected Client Script
 * Version 1.0.0
 * 
 * Injected into Antigravity Chat UI to provide:
 * 1. "⚡ Usage" button inside the chat input toolbar beside the model picker.
 * 2. Compact "Account & Usage" popup with:
 *    - Active user email & Google account type (Personal vs GCP Cloud Project)
 *    - [ ⇄ Switch Account ] button
 *    - Quota & Usage status
 *    - 1-Click instant switch to any other saved Google ID
 *    - [ + Add Another Account ] button
 */
(function() {
    if (window.__antigravitySwitcherLoaded) return;
    window.__antigravitySwitcherLoaded = true;

    console.log('[Antigravity Switcher] Chat UI injected successfully');

    let currentAccountData = null;
    let isModalOpen = false;

    // Fetch account and profiles from proxy endpoint
    async function fetchAccountData() {
        try {
            const res = await fetch('/api/antigravity-switcher/info', { cache: 'no-store' });
            if (res.ok) {
                currentAccountData = await res.json();
                return currentAccountData;
            }
        } catch (e) {
            console.error('[Antigravity Switcher] Failed to fetch account info:', e);
        }
        return null;
    }

    // Trigger account switch
    async function triggerSwitch(targetProfile) {
        try {
            const res = await fetch('/api/antigravity-switcher/switch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ profile: targetProfile || '' })
            });
            if (res.ok) {
                closeModal();
            }
        } catch (e) {
            console.error('[Antigravity Switcher] Error during switch:', e);
        }
    }

    // Trigger add new account
    async function triggerAddNew() {
        try {
            await fetch('/api/antigravity-switcher/add', { method: 'POST' });
            closeModal();
        } catch (e) {
            console.error('[Antigravity Switcher] Error triggering add account:', e);
        }
    }

    // Close modal
    function closeModal() {
        const modal = document.getElementById('antigravity-usage-modal');
        if (modal) {
            modal.remove();
        }
        isModalOpen = false;
    }

    // Render Account & Usage Modal
    async function openModal(anchorBtn) {
        if (isModalOpen) {
            closeModal();
            return;
        }

        const data = await fetchAccountData() || {};
        const curr = data.current || {};
        const profiles = data.profiles || [];

        const activeEmail = curr.Email || curr.ProfileName || 'Google Account';
        const isCloud = !!curr.IsCloud;
        const projectId = curr.ProjectId || '';
        const activeName = curr.ProfileName || curr.DisplayName || activeEmail;

        const modal = document.createElement('div');
        modal.id = 'antigravity-usage-modal';
        modal.style.cssText = `
            position: fixed;
            bottom: 60px;
            left: 12px;
            width: 320px;
            max-width: calc(100vw - 24px);
            background: #18181b;
            border: 1px solid rgba(255, 255, 255, 0.14);
            border-radius: 12px;
            box-shadow: 0 16px 40px rgba(0, 0, 0, 0.65), 0 4px 12px rgba(0, 0, 0, 0.4);
            padding: 14px;
            z-index: 999999;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            color: #f4f4f5;
            box-sizing: border-box;
            backdrop-filter: blur(12px);
            animation: agyFadeIn 0.16s ease-out;
        `;

        // Other profiles to switch to
        const otherProfiles = profiles.filter(p => {
            const pName = p.Name || p.name || '';
            const pEmail = p.Email || p.email || '';
            return pName.toLowerCase() !== activeName.toLowerCase() &&
                   (!pEmail || pEmail.toLowerCase() !== activeEmail.toLowerCase() || p.IsCloud !== isCloud);
        });

        modal.innerHTML = `
            <style>
                @keyframes agyFadeIn {
                    from { opacity: 0; transform: translateY(6px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .agy-btn-hover:hover {
                    background: #1177bb !important;
                }
                .agy-item-hover:hover {
                    background: rgba(255, 255, 255, 0.08) !important;
                }
                .agy-close-hover:hover {
                    color: #fff !important;
                    background: rgba(255, 255, 255, 0.1) !important;
                }
            </style>

            <!-- Header -->
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <div style="font-size: 13.5px; font-weight: 600; color: #ffffff; display: flex; align-items: center; gap: 6px;">
                    <span style="color: #38bdf8;">⚡</span> Account & Usage
                </div>
                <button id="agy-modal-close-btn" class="agy-close-hover" style="background: none; border: none; color: #a1a1aa; cursor: pointer; font-size: 13px; border-radius: 4px; padding: 2px 6px; line-height: 1; transition: all 0.15s;">✕</button>
            </div>

            <!-- Active Account Card -->
            <div style="background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px; padding: 10px; margin-bottom: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <span style="font-size: 9.5px; font-weight: 700; color: #a1a1aa; letter-spacing: 0.06em; text-transform: uppercase;">ACTIVE ACCOUNT</span>
                    <button id="agy-modal-switch-btn" class="agy-btn-hover" style="display: inline-flex; align-items: center; gap: 4px; padding: 3px 9px; font-size: 11px; font-weight: 600; border-radius: 6px; background: #0e639c; color: #ffffff; border: 1px solid rgba(255, 255, 255, 0.18); cursor: pointer; transition: background 0.15s; box-shadow: 0 1px 3px rgba(0,0,0,0.3);">
                        ⇄ Switch Account
                    </button>
                </div>
                <div style="font-size: 12.5px; font-weight: 500; color: #ffffff; word-break: break-all; margin-bottom: 2px;">
                    ${activeEmail}
                </div>
                <div style="font-size: 11px; color: ${isCloud ? '#38bdf8' : '#4ade80'}; display: flex; align-items: center; gap: 4px;">
                    <span>${isCloud ? '☁️' : '🟢'}</span>
                    <span>${isCloud ? `Google Cloud (Project: ${projectId || 'GCP'})` : 'Personal Google Account'}</span>
                </div>
            </div>

            <!-- Usage & Limits -->
            <div style="background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px; padding: 10px; margin-bottom: 10px;">
                <div style="font-size: 9.5px; font-weight: 700; color: #a1a1aa; letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 6px;">USAGE & LIMITS</div>
                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11.5px; margin-bottom: 4px;">
                    <span style="color: #d4d4d8;">Quota Status</span>
                    <span style="color: #4ade80; font-weight: 600;">● Active (Ready)</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #a1a1aa;">
                    <span>Model Rate Limits</span>
                    <span>Auto-Switch Enabled</span>
                </div>
            </div>

            <!-- Saved Accounts Quick Switch -->
            ${otherProfiles.length > 0 ? `
                <div style="border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 8px; margin-top: 8px;">
                    <div style="font-size: 9.5px; font-weight: 700; color: #a1a1aa; letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 6px;">
                        SWITCH TO ANOTHER ACCOUNT (${otherProfiles.length})
                    </div>
                    <div style="max-height: 120px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; padding-right: 2px;">
                        ${otherProfiles.map(p => {
                            const pName = p.Name || p.name || '';
                            const pEmail = p.Email || p.email || pName;
                            const pIsCloud = !!p.IsCloud;
                            const pProj = p.ProjectId || '';
                            return `
                                <div class="agy-switch-target agy-item-hover" data-profile="${pName.replace(/"/g, '&quot;')}" style="display: flex; justify-content: space-between; align-items: center; padding: 5px 8px; border-radius: 6px; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.06); cursor: pointer; transition: background 0.15s;">
                                    <div style="min-width: 0; flex: 1; padding-right: 6px;">
                                        <div style="font-size: 11.5px; font-weight: 500; color: #e4e4e7; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                            ${pIsCloud ? '☁️' : '👤'} ${pEmail}
                                        </div>
                                        ${pIsCloud && pProj ? `<div style="font-size: 9.5px; color: #38bdf8;">Cloud: ${pProj}</div>` : ''}
                                    </div>
                                    <span style="font-size: 10.5px; color: #38bdf8; font-weight: 600; white-space: nowrap;">Switch →</span>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            ` : ''}

            <!-- Add / Sign In Button -->
            <div style="margin-top: 10px; text-align: center;">
                <button id="agy-modal-add-btn" style="background: none; border: 1px dashed rgba(255, 255, 255, 0.15); border-radius: 6px; color: #a1a1aa; font-size: 11px; padding: 5px 12px; width: 100%; cursor: pointer; transition: all 0.15s;" onmouseover="this.style.color='#fff';this.style.borderColor='rgba(255,255,255,0.3)'" onmouseout="this.style.color='#a1a1aa';this.style.borderColor='rgba(255,255,255,0.15)'">
                    + Add / Sign In to Another Google Account
                </button>
            </div>
        `;

        document.body.appendChild(modal);
        isModalOpen = true;

        // Position above button if anchor provided
        if (anchorBtn) {
            const rect = anchorBtn.getBoundingClientRect();
            modal.style.bottom = `${window.innerHeight - rect.top + 8}px`;
            modal.style.left = `${Math.max(10, rect.left - 20)}px`;
        }

        // Close button
        document.getElementById('agy-modal-close-btn')?.addEventListener('click', (ev) => {
            ev.stopPropagation();
            closeModal();
        });

        // Switch button (opens QuickPick dropdown in IDE)
        document.getElementById('agy-modal-switch-btn')?.addEventListener('click', (ev) => {
            ev.stopPropagation();
            triggerSwitch('');
        });

        // Add button
        document.getElementById('agy-modal-add-btn')?.addEventListener('click', (ev) => {
            ev.stopPropagation();
            triggerAddNew();
        });

        // Quick switch items
        modal.querySelectorAll('.agy-switch-target').forEach(el => {
            el.addEventListener('click', (ev) => {
                ev.stopPropagation();
                const target = el.getAttribute('data-profile');
                if (target) {
                    triggerSwitch(target);
                }
            });
        });

        // Close on outside click
        const onOutsideClick = (ev) => {
            if (!modal.contains(ev.target) && ev.target !== anchorBtn) {
                closeModal();
                document.removeEventListener('click', onOutsideClick);
            }
        };
        setTimeout(() => document.addEventListener('click', onOutsideClick), 50);
    }

    // Insert "⚡ Usage" Button into Chat Input Toolbar
    function injectUsageButton() {
        if (document.getElementById('antigravity-usage-switcher-btn')) {
            return;
        }

        // Search for input toolbar containers in Antigravity chat
        const bottomToolbar = document.querySelector('[data-testid="input-box-bottom-toolbar"]');
        const inputFooter = document.querySelector('div[class*="input-footer"]') || document.querySelector('div[class*="@container/input-footer"]');
        
        const targetContainer = inputFooter || bottomToolbar;
        if (!targetContainer) {
            return;
        }

        // Find insertion anchor: next to model selector
        // Look for model selector buttons or flex containers inside toolbar
        let anchor = targetContainer.querySelector('div[class*="items-center"][class*="gap-1"]');
        if (!anchor) {
            anchor = targetContainer.querySelector('button[data-testid*="model"]') ||
                     targetContainer.querySelector('button[aria-haspopup="menu"]') ||
                     targetContainer.querySelector('div[class*="min-w-0 flex-1"]');
        }

        const btn = document.createElement('button');
        btn.id = 'antigravity-usage-switcher-btn';
        btn.type = 'button';
        btn.title = 'Antigravity Google Account & Usage (Click to Switch Account)';
        btn.innerHTML = `
            <span style="color: #38bdf8; font-size: 11px;">⚡</span>
            <span>Usage</span>
        `;
        btn.style.cssText = `
            display: inline-flex;
            align-items: center;
            gap: 4px;
            height: 22px;
            padding: 0 8px;
            border-radius: 9999px;
            font-size: 11px;
            font-weight: 500;
            color: var(--vscode-foreground, #d4d4d8);
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid rgba(255, 255, 255, 0.12);
            cursor: pointer;
            user-select: none;
            transition: all 0.15s ease;
            flex-shrink: 0;
            margin-left: 4px;
            box-sizing: border-box;
            outline: none;
        `;

        btn.onmouseover = () => {
            btn.style.background = 'rgba(255, 255, 255, 0.12)';
            btn.style.borderColor = 'rgba(255, 255, 255, 0.22)';
            btn.style.color = '#ffffff';
        };
        btn.onmouseout = () => {
            btn.style.background = 'rgba(255, 255, 255, 0.06)';
            btn.style.borderColor = 'rgba(255, 255, 255, 0.12)';
            btn.style.color = 'var(--vscode-foreground, #d4d4d8)';
        };

        btn.onclick = (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            openModal(btn);
        };

        if (anchor && anchor.parentNode) {
            anchor.parentNode.insertBefore(btn, anchor.nextSibling);
        } else {
            targetContainer.appendChild(btn);
        }
        console.log('[Antigravity Switcher] Injected "⚡ Usage" button into input toolbar');
    }

    // Observer to re-inject when chat DOM updates
    const observer = new MutationObserver(() => {
        injectUsageButton();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    // Initial injection try
    injectUsageButton();
    setTimeout(injectUsageButton, 500);
    setTimeout(injectUsageButton, 1500);
    setTimeout(injectUsageButton, 3000);
})();
