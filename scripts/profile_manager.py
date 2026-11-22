#!/usr/bin/env python3
"""
Antigravity Multi-Account Profile Manager (macOS Native with Keychain & Cloud Support)
High-performance profile management for Google Antigravity IDE.
Supports instant seamless account switching without IDE process killing.
"""
import sys
import os
import json
import shutil
import time
import subprocess
import argparse
import base64
from pathlib import Path

HOME = Path.home()
ANTIGRAVITY_IDE_DATA = HOME / "Library" / "Application Support" / "Antigravity IDE"
PROFILES_STORE = ANTIGRAVITY_IDE_DATA / "Profiles"
USER_DATA = ANTIGRAVITY_IDE_DATA / "User"
ACTIVE_PROFILE_FILE = ANTIGRAVITY_IDE_DATA / "active_profile.txt"
ANTIGRAVITY_COMPANION_DATA = HOME / "Library" / "Application Support" / "Antigravity"

PROFILES_STORE.mkdir(parents=True, exist_ok=True)


def get_keychain_token():
    """Retrieve Google Antigravity OAuth token from macOS Keychain."""
    try:
        res = subprocess.run(
            ["security", "find-generic-password", "-s", "gemini", "-a", "antigravity", "-w"],
            capture_output=True, text=True, check=True
        )
        token = res.stdout.strip()
        if token:
            return token
    except Exception:
        pass
    return ""


def set_keychain_token(token_val):
    """Write Google Antigravity OAuth token back to macOS Keychain."""
    if not token_val:
        return False
    try:
        subprocess.run(
            ["security", "add-generic-password", "-U", "-s", "gemini", "-a", "antigravity", "-w", token_val],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
        )
        return True
    except Exception:
        return False


def get_token_payload(token_str=None):
    """Decode go-keyring base64 payload into dict."""
    if token_str is None:
        token_str = get_keychain_token()
    if not token_str:
        return {}
    try:
        if token_str.startswith("go-keyring-base64:"):
            b64_part = token_str[len("go-keyring-base64:"):]
            raw_json = base64.b64decode(b64_part).decode("utf-8")
            return json.loads(raw_json)
    except Exception:
        pass
    return {}


def get_current_account_details():
    """Detect current active account: Personal Google ID vs Google Cloud (GCP) Project."""
    token = get_keychain_token()
    payload = get_token_payload(token)
    auth_method = payload.get("auth_method", "consumer")
    project_id = payload.get("project_id", "")
    email = payload.get("id_token_email", "")

    if not email:
        try:
            app_storage = ANTIGRAVITY_COMPANION_DATA / "app_storage.json"
            if app_storage.exists():
                data = json.loads(app_storage.read_text(encoding="utf-8"))
                e = data.get("agy.onboarding.lastLoginUsername")
                if e and "@" in e:
                    email = e.strip()
        except Exception:
            pass

    is_cloud = (auth_method == "gcp")
    if is_cloud and project_id:
        if email:
            display_name = f"{email} [Cloud: {project_id}]"
            profile_name = f"{email} (Cloud - {project_id})"
        else:
            display_name = f"Cloud: {project_id}"
            profile_name = f"Google Cloud ({project_id})"
    else:
        if email:
            display_name = f"{email} (Personal)"
            profile_name = f"{email} (Personal)"
        else:
            display_name = "Personal Google Account"
            profile_name = "Personal Account"

    return {
        "Email": email,
        "AuthMethod": auth_method,
        "ProjectId": project_id,
        "DisplayName": display_name,
        "ProfileName": profile_name,
        "IsCloud": is_cloud
    }


def get_profiles_list(max_profiles=10):
    """List valid saved profiles that have valid credentials."""
    profiles = []
    if PROFILES_STORE.exists():
        for item in sorted(PROFILES_STORE.iterdir(), key=lambda p: p.stat().st_mtime):
            if item.is_dir() and not item.name.startswith("."):
                token_file = item / "keychain_token.txt"
                # Only list profiles with saved credentials
                if not token_file.exists():
                    continue

                created = time.strftime("%Y-%m-%d %H:%M", time.localtime(item.stat().st_ctime))
                total_size = sum(f.stat().st_size for f in item.rglob('*') if f.is_file())
                size_mb = round(total_size / (1024 * 1024), 2)
                
                meta_file = item / "meta.json"
                
                email = item.name
                auth_method = "consumer"
                project_id = ""
                display_name = item.name
                is_cloud = False
                
                p_info = get_token_payload(token_file.read_text(encoding="utf-8").strip())
                auth_method = p_info.get("auth_method", "consumer")
                project_id = p_info.get("project_id", "")
                if p_info.get("id_token_email"):
                    email = p_info.get("id_token_email")
                
                if meta_file.exists():
                    try:
                        meta = json.loads(meta_file.read_text(encoding="utf-8"))
                        email = meta.get("email", email)
                        auth_method = meta.get("auth_method", auth_method)
                        project_id = meta.get("project_id", project_id)
                        display_name = meta.get("display_name", display_name)
                        is_cloud = meta.get("is_cloud", (auth_method == "gcp"))
                    except Exception:
                        pass
                else:
                    is_cloud = (auth_method == "gcp")
                
                clean_email = email.split(" ")[0] if " " in email else email
                if is_cloud:
                    display_name = f"{clean_email} [Cloud: {project_id}]" if project_id else f"{clean_email} [Google Cloud]"
                elif "(Personal)" not in display_name:
                    display_name = f"{clean_email} (Personal)"

                profiles.append({
                    "Name": item.name,
                    "Created": created,
                    "Size": size_mb,
                    "Email": email,
                    "AuthMethod": auth_method,
                    "ProjectId": project_id,
                    "DisplayName": display_name,
                    "IsCloud": is_cloud
                })
    return profiles


def list_profiles(max_profiles=10):
    profiles = get_profiles_list(max_profiles)
    print(json.dumps(profiles))
    return profiles


def save_profile(name="", max_profiles=10):
    acct = get_current_account_details()
    if not name or not name.strip():
        name = acct["ProfileName"]

    name = name.strip()
    import re
    if re.search(r'[\\/:*?"<>|]', name):
        name = re.sub(r'[\\/:*?"<>|]', '_', name)

    keychain_token = get_keychain_token()
    if not keychain_token:
        print(json.dumps({"Success": False, "Error": "No active Google OAuth credentials in Keychain"}))
        sys.exit(1)

    target_profile_dir = PROFILES_STORE / name
    target_profile_dir.mkdir(parents=True, exist_ok=True)

    # 1. Save macOS Keychain Token
    (target_profile_dir / "keychain_token.txt").write_text(keychain_token, encoding="utf-8")

    # 2. Save companion app auth data if present
    auth_dir = target_profile_dir / "AntigravityAuth"
    auth_dir.mkdir(parents=True, exist_ok=True)
    if ANTIGRAVITY_COMPANION_DATA.exists():
        for fname in ["credential-user-scope", "app_storage.json"]:
            fpath = ANTIGRAVITY_COMPANION_DATA / fname
            if fpath.exists():
                try:
                    shutil.copy2(fpath, auth_dir / fname)
                except Exception:
                    pass

    # 3. Save profile metadata
    meta = {
        "name": name,
        "email": acct["Email"] or name,
        "auth_method": acct["AuthMethod"],
        "project_id": acct["ProjectId"],
        "display_name": acct["DisplayName"],
        "is_cloud": acct["IsCloud"],
        "saved_at": time.strftime("%Y-%m-%d %H:%M:%S")
    }
    (target_profile_dir / "meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")

    # 4. Mark active profile
    ACTIVE_PROFILE_FILE.parent.mkdir(parents=True, exist_ok=True)
    ACTIVE_PROFILE_FILE.write_text(name, encoding="utf-8")

    out = {
        "Success": True,
        "Message": f"Profile '{name}' saved successfully",
        "Email": acct["Email"],
        "DisplayName": acct["DisplayName"],
        "IsCloud": acct["IsCloud"]
    }
    print(json.dumps(out))
    return out


def load_profile(name):
    """Instantly swap credentials and kill agy backend without killing IDE."""
    name = name.strip()
    profile_dir = PROFILES_STORE / name
    keychain_token_file = profile_dir / "keychain_token.txt"

    if not profile_dir.exists() or not keychain_token_file.exists():
        print(json.dumps({"Success": False, "Error": f"Profile '{name}' not found or credentials missing."}))
        sys.exit(1)

    saved_token = keychain_token_file.read_text(encoding="utf-8").strip()

    # 1. Restore macOS Keychain OAuth Token
    if saved_token:
        set_keychain_token(saved_token)

    # 2. Restore companion auth files if present
    if (profile_dir / "AntigravityAuth").exists():
        ANTIGRAVITY_COMPANION_DATA.mkdir(parents=True, exist_ok=True)
        for fpath in (profile_dir / "AntigravityAuth").glob("*"):
            if fpath.is_file():
                try:
                    shutil.copy2(fpath, ANTIGRAVITY_COMPANION_DATA / fpath.name)
                except Exception:
                    pass

    # 3. Update active profile tracker
    ACTIVE_PROFILE_FILE.parent.mkdir(parents=True, exist_ok=True)
    ACTIVE_PROFILE_FILE.write_text(name, encoding="utf-8")

    # 4. Terminate only background agy --hub language server so it restarts fresh with new token
    subprocess.run(["pkill", "-9", "-f", "agy --hub"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    out = {"Success": True, "Message": f"Credentials switched to '{name}'", "Profile": name}
    print(json.dumps(out))
    return out


def delete_profile(name):
    name = name.strip()
    profile_dir = PROFILES_STORE / name
    if not profile_dir.exists():
        print(json.dumps({"Success": False, "Error": f"Profile '{name}' not found."}))
        sys.exit(1)

    shutil.rmtree(profile_dir, ignore_errors=True)

    if ACTIVE_PROFILE_FILE.exists():
        try:
            current = ACTIVE_PROFILE_FILE.read_text(encoding="utf-8").strip()
            if current.lower() == name.lower():
                ACTIVE_PROFILE_FILE.unlink(missing_ok=True)
        except Exception:
            pass

    out = {"Success": True, "Message": f"Profile '{name}' deleted successfully."}
    print(json.dumps(out))
    return out


def prepare_sign_out():
    """Save current session and clear credentials for new Google Sign-In."""
    acct = get_current_account_details()
    if acct["Email"] or acct["ProjectId"]:
        try:
            save_profile(acct["ProfileName"])
        except Exception:
            pass

    # Delete Keychain token so Google Sign-In prompt appears
    subprocess.run(
        ["security", "delete-generic-password", "-s", "gemini", "-a", "antigravity"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )

    # Clear active profile indicator
    if ACTIVE_PROFILE_FILE.exists():
        try:
            ACTIVE_PROFILE_FILE.unlink(missing_ok=True)
        except Exception:
            pass

    # Terminate background agy --hub server
    subprocess.run(["pkill", "-9", "-f", "agy --hub"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    out = {"Success": True, "Message": "Signed out for new login"}
    print(json.dumps(out))
    return out


def main():
    parser = argparse.ArgumentParser(description="Antigravity Profile Manager (macOS)")
    parser.add_argument("--action", "-Action", dest="action", required=False, default="List",
                        choices=["List", "Save", "Load", "Delete", "DetectEmail", "DetectAccount", "PrepareSignOut"])
    parser.add_argument("--profile-name", "-ProfileName", dest="profile_name", required=False, default="")
    parser.add_argument("--max-profiles", "-MaxProfiles", dest="max_profiles", required=False, type=int, default=10)

    raw_args = sys.argv[1:]
    normalized_args = []
    i = 0
    while i < len(raw_args):
        arg = raw_args[i]
        if arg.startswith("-Action="):
            normalized_args.append("--action")
            normalized_args.append(arg.split("=", 1)[1])
        elif arg == "-Action" and i + 1 < len(raw_args):
            normalized_args.append("--action")
            normalized_args.append(raw_args[i + 1])
            i += 1
        elif arg.startswith("-ProfileName="):
            normalized_args.append("--profile-name")
            normalized_args.append(arg.split("=", 1)[1])
        elif arg == "-ProfileName" and i + 1 < len(raw_args):
            normalized_args.append("--profile-name")
            normalized_args.append(raw_args[i + 1])
            i += 1
        elif arg.startswith("-MaxProfiles="):
            normalized_args.append("--max-profiles")
            normalized_args.append(arg.split("=", 1)[1])
        elif arg == "-MaxProfiles" and i + 1 < len(raw_args):
            normalized_args.append("--max-profiles")
            normalized_args.append(raw_args[i + 1])
            i += 1
        else:
            normalized_args.append(arg)
        i += 1

    parsed = parser.parse_args(normalized_args)
    action = parsed.action
    profile_name = parsed.profile_name
    max_profiles = parsed.max_profiles

    if action == "List":
        list_profiles(max_profiles)
    elif action == "Save":
        save_profile(profile_name, max_profiles)
    elif action == "Load":
        if not profile_name:
            print(json.dumps({"Success": False, "Error": "ProfileName is required for Load"}))
            sys.exit(1)
        load_profile(profile_name)
    elif action == "Delete":
        if not profile_name:
            print(json.dumps({"Success": False, "Error": "ProfileName is required for Delete"}))
            sys.exit(1)
        delete_profile(profile_name)
    elif action in ("DetectEmail", "DetectAccount"):
        acct = get_current_account_details()
        print(json.dumps(acct))
    elif action == "PrepareSignOut":
        prepare_sign_out()


if __name__ == "__main__":
    main()
