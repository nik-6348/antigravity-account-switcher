# Antigravity Account Manager

Multi-account profile manager for **Google Antigravity IDE** on macOS. Switch seamlessly between multiple Google Accounts (Personal Gmail & Google Cloud Projects) to manage quotas and workspaces without manual re-logins.

---

## ✨ Features

- **Top Right Secondary Sidebar Panel:** Access account controls from the dedicated **Top Right** auxiliary panel (alongside Claude Code and Codex).
- **Top Right Editor Button:** Click the `⚡` account button in the top right corner of any active editor or chat header to trigger the instant switcher modal.
- **Google Cloud & Personal Account Detection:** Automatically identifies whether you are logged in via a standard Personal Google Account or a Google Cloud (GCP) Project ID.
- **1-Click Switching in Top Right Panel:** View all saved accounts with live badges and click `[ ⇄ Switch ]` for instant zero-hassle account switches.
- **Clean Workspace (No Bottom Bar Clutter):** Bottom status bar is kept clean by default and controls are relocated to the Top Right.
- **State & Tab Preservation:** Preserves open files, split editor layouts, and active workspace folders across reloads.
- **Quota / Rate Limit Alerts:** Detects model quota limits (429 / Resource Exhausted) and suggests switching to an alternate profile.

---

## 🚀 How to Use (Top Right Access)

### 1. Dedicated Top Right Panel (Secondary Sidebar)
- Look at the **Top Right** auxiliary sidebar icons (next to Claude Code and Codex).
- Click the **Antigravity Accounts** icon.
- A sleek panel opens on the right showing:
  - **Active Account:** Email, Personal / Cloud badge, and ready status.
  - **Saved Accounts:** Direct list with 1-click **`[ ⇄ Switch ]`** buttons.
  - **`+ Add Another Google Account`** button.
  - **`⚡ Open QuickPick Modal Dropdown`** button.

### 2. Top Right Editor Title Button
- In the top right header of any editor tab or chat window, click the **`⚡ Switch Google Account`** icon.
- A sleek modal dropdown appears from the top with all accounts and actions.

### 3. Keyboard Shortcut & Command Palette
- **Keyboard Shortcut:** `Cmd + Alt + A`
- **Command Palette (`Cmd + Shift + P`):**
  - Run: `⚡ Switch Google Account`
  - Run: `⚡ Open Antigravity Accounts in Top Right Panel`

---

## 🛠️ Installation & Sync

```bash
# Symlink or copy to Antigravity Extensions directory
cp -R . ~/.antigravity-ide/extensions/venomchampion.antigravity-account-switcher-2.3.0/
```
Then reload window (`Cmd + Shift + P` -> `Developer: Reload Window`).

---

## 📄 License

Distributed under the **MIT License**.
