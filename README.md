# Antigravity Account Manager

Multi-account profile manager for **Google Antigravity IDE** on macOS. Switch seamlessly between multiple Google Accounts (Personal Gmail & Google Cloud Projects) to manage quotas and workspaces without manual re-logins.

---

## ✨ Features

- **Google Cloud & Personal Account Detection:** Automatically identifies whether you are logged in via a standard Personal Google Account or a Google Cloud (GCP) Project ID.
- **Visual Status Bar Badge:**
  - ☁️ **Sky Blue (`#38bdf8`)**: Active Google Cloud Project session.
  - 🟢 **Bright Green (`#4ade80`)**: Active Personal Google session.
- **Active Profile Always on Top:** The current session is highlighted at the top of the QuickPick menu with live status.
- **Seamless 1-Click Switching:** Swaps macOS Keychain credentials, refreshes background language servers, and reloads the window automatically.
- **State & Tab Preservation:** Preserves open files, split editor layouts, and active workspace folders across reloads.
- **Quota / Rate Limit Alerts:** Detects model quota limits (429 / Resource Exhausted) and suggests switching to an alternate profile.

---

## 🚀 How to Use

### 1. Open the Account Switcher Menu
- **Click the status bar item** in the bottom left corner:
  - Personal: `$(pass-filled) user@gmail.com`
  - Cloud: `$(cloud) Cloud: project-id`
- Or use the command palette (`Cmd + Shift + P`):
  - Run: `Antigravity: Switch Google Account (Dropdown)`

---

### 2. Switching Between Accounts
1. Click on the status bar icon.
2. Select any profile under **"SWITCH TO ANOTHER ACCOUNT"**.
3. The IDE will instantly apply credentials and reload the window with your tabs preserved.

---

### 3. Adding a New Google Account
1. Open the menu and click **`$(add) Add / Sign In to Another Google Account...`**.
2. Choose account type:
   - **Personal Google Account:** Saves current credentials, signs out from Keychain, and reloads so you can sign in with your second Google account.
   - **Google Cloud (GCP) Project:** Instructions to sign in via the Antigravity Desktop app using your GCP Project ID, then sync credentials back.
3. Once logged in, the extension auto-detects and saves your new profile.

---

### 4. Syncing & Removing Profiles
- **Sync Current Session:** Click `$(refresh) Sync Current Account Credentials` to update saved Keychain tokens.
- **Remove a Profile:** Click `$(trash) Remove a Saved Account Profile...` and select the profile to delete.

---

## 🛠️ Installation

### Option 1: Symlink to Antigravity Extensions Folder
```bash
ln -s "$(pwd)" ~/.antigravity-ide/extensions/antigravity-account-manager
```
Then restart Antigravity IDE.

### Option 2: Build & Install `.vsix`
```bash
# Install vsce if not installed
npm install -g @vscode/vsce

# Package the extension
vsce package --no-dependencies

# Install into Antigravity
code --install-extension antigravity-account-manager-*.vsix
```

---

## ⚙️ System Requirements

- **Platform:** macOS (utilizes macOS Keychain via `security` command)
- **Runtime:** Python 3.8+ (for Keychain and profile file management)
- **Editor:** Antigravity IDE (VS Code engine `^1.85.0`)

---

## 📄 License & Credits

- Distributed under the **MIT License**.
