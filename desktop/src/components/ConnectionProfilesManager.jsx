import { useCallback, useEffect, useMemo, useState } from "react";
import { Banner, Button, Input, Modal, Select, Toast } from "@douyinfe/semi-ui";

import {
  createDesktopConnection,
  deleteDesktopConnection,
  duplicateDesktopConnection,
  listDesktopConnections,
  testDesktopConnection,
  updateDesktopConnection,
} from "../erdTool/desktopBridge";

const emptySnowflakeSettings = {
  account: "",
  username: "",
  authenticator: "EXTERNALBROWSER",
  warehouse: "",
  role: "",
  database: "",
  schema: "",
  privateKeyPath: "",
};

const emptySQLiteSettings = {
  databasePath: "",
};

const emptySecrets = {
  password: "",
  privateKeyPass: "",
};

const providerOptions = [
  { value: "snowflake", label: "Snowflake" },
  { value: "sqlite", label: "SQLite" },
];

const authenticatorOptions = [
  { value: "EXTERNALBROWSER", label: "Browser SSO" },
  { value: "SNOWFLAKE", label: "Username and password" },
  { value: "USERNAME_PASSWORD_MFA", label: "Username, password, and MFA" },
  { value: "SNOWFLAKE_JWT", label: "Key-pair authentication" },
];

function blankDraft(provider = "snowflake") {
  return {
    id: "",
    provider,
    name: "",
    settings:
      provider === "sqlite"
        ? { ...emptySQLiteSettings }
        : { ...emptySnowflakeSettings },
    secrets: { ...emptySecrets },
  };
}

function draftFromProfile(profile) {
  return {
    id: profile.id,
    provider: profile.provider,
    name: profile.name,
    settings: {
      ...(profile.provider === "sqlite"
        ? emptySQLiteSettings
        : emptySnowflakeSettings),
      ...(profile.settings ?? {}),
    },
    secrets: { ...emptySecrets },
  };
}

function profileSummary(profile) {
  if (profile.provider === "sqlite") return profile.settings.databasePath;
  return [
    profile.settings.username,
    profile.settings.account,
    profile.settings.warehouse,
    profile.settings.role,
  ]
    .filter(Boolean)
    .join(" · ");
}

export default function ConnectionProfilesManager({ visible, onClose }) {
  const [profiles, setProfiles] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState(blankDraft());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedId) ?? null,
    [profiles, selectedId],
  );

  const refresh = useCallback(async () => {
    const nextProfiles = await listDesktopConnections();
    setProfiles(nextProfiles);
    setSelectedId((currentId) => {
      const selected =
        nextProfiles.find((profile) => profile.id === currentId) ??
        nextProfiles[0] ??
        null;
      setDraft(selected ? draftFromProfile(selected) : blankDraft());
      return selected?.id ?? "";
    });
  }, []);

  useEffect(() => {
    if (!visible) return;
    setError("");
    void refresh().catch((loadError) => {
      setError(loadError?.message || "Could not load saved connections.");
    });
  }, [refresh, visible]);

  useEffect(() => {
    if (selectedProfile) setDraft(draftFromProfile(selectedProfile));
  }, [selectedProfile]);

  const changeProvider = (provider) => {
    setSelectedId("");
    setDraft(blankDraft(provider));
  };

  const saveProfile = async () => {
    setBusy(true);
    setError("");
    try {
      const payload = {
        provider: draft.provider,
        name: draft.name,
        settings: draft.settings,
        secrets: draft.secrets,
      };
      const saved = draft.id
        ? await updateDesktopConnection(draft.id, payload)
        : await createDesktopConnection(payload);
      const nextProfiles = await listDesktopConnections();
      setProfiles(nextProfiles);
      setSelectedId(saved.id);
      Toast.success("Connection profile saved");
    } catch (saveError) {
      setError(saveError?.message || "Could not save connection profile.");
    } finally {
      setBusy(false);
    }
  };

  const duplicateProfile = async () => {
    if (!selectedId) return;
    setBusy(true);
    setError("");
    try {
      const duplicated = await duplicateDesktopConnection(selectedId);
      const nextProfiles = await listDesktopConnections();
      setProfiles(nextProfiles);
      setSelectedId(duplicated.id);
      Toast.success("Connection profile duplicated");
    } catch (duplicateError) {
      setError(
        duplicateError?.message || "Could not duplicate connection profile.",
      );
    } finally {
      setBusy(false);
    }
  };

  const deleteProfile = async () => {
    if (!selectedId) return;
    if (!globalThis.window.confirm("Delete this connection profile?")) return;
    setBusy(true);
    setError("");
    try {
      await deleteDesktopConnection(selectedId);
      const nextProfiles = await listDesktopConnections();
      setProfiles(nextProfiles);
      setSelectedId(nextProfiles[0]?.id ?? "");
      setDraft(nextProfiles[0] ? draftFromProfile(nextProfiles[0]) : blankDraft());
      Toast.success("Connection profile deleted");
    } catch (deleteError) {
      setError(deleteError?.message || "Could not delete connection profile.");
    } finally {
      setBusy(false);
    }
  };

  const testProfile = async () => {
    if (!selectedId) return;
    setBusy(true);
    setError("");
    try {
      const result = await testDesktopConnection(selectedId);
      if (result.ok) Toast.success(result.message || "Connection profile is valid");
      else setError(result.message || "Connection profile test failed.");
    } catch (testError) {
      setError(testError?.message || "Connection profile test failed.");
    } finally {
      setBusy(false);
    }
  };

  const updateSettings = (patch) => {
    setDraft((current) => ({
      ...current,
      settings: { ...current.settings, ...patch },
    }));
  };

  const needsPassword =
    draft.provider === "snowflake" &&
    ["SNOWFLAKE", "USERNAME_PASSWORD_MFA"].includes(
      draft.settings.authenticator,
    );
  const needsPrivateKey =
    draft.provider === "snowflake" &&
    draft.settings.authenticator === "SNOWFLAKE_JWT";

  return (
    <Modal
      title="Connections"
      visible={visible}
      onCancel={onClose}
      onOk={saveProfile}
      okText={draft.id ? "Save Connection" : "Add Connection"}
      confirmLoading={busy}
      okButtonProps={{ disabled: busy || !draft.name.trim() }}
      width={860}
      centered
      maskClosable={false}
    >
      <div className="grid grid-cols-[260px_1fr] gap-4">
        <div className="space-y-2">
          <Button className="w-full" onClick={() => changeProvider("snowflake")}>
            New Snowflake Connection
          </Button>
          <Button className="w-full" onClick={() => changeProvider("sqlite")}>
            New SQLite Connection
          </Button>
          <div className="max-h-[420px] overflow-auto rounded border border-gray-200 dark:border-gray-700">
            {profiles.map((profile) => (
              <button
                key={profile.id}
                type="button"
                className={`block w-full border-b border-gray-200 p-3 text-left text-sm last:border-b-0 dark:border-gray-700 ${
                  selectedId === profile.id
                    ? "bg-blue-50 dark:bg-sky-950/40"
                    : "hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
                onClick={() => setSelectedId(profile.id)}
              >
                <span className="block font-medium">{profile.name}</span>
                <span className="block text-xs text-gray-500">
                  {profile.provider} · {profileSummary(profile)}
                </span>
              </button>
            ))}
            {!profiles.length && (
              <div className="p-4 text-sm text-gray-500">
                No saved connections.
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3">
          {error && (
            <Banner
              type="danger"
              fullMode={false}
              description={error}
              closeIcon={null}
            />
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-sm">
              <span className="font-medium">Name</span>
              <Input
                value={draft.name}
                onChange={(name) => setDraft((current) => ({ ...current, name }))}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Provider</span>
              <Select
                value={draft.provider}
                optionList={providerOptions}
                onChange={changeProvider}
                className="w-full"
                disabled={Boolean(draft.id)}
              />
            </label>
          </div>

          {draft.provider === "snowflake" ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 text-sm">
                <span className="font-medium">Account identifier</span>
                <Input
                  value={draft.settings.account}
                  onChange={(account) => updateSettings({ account })}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Username</span>
                <Input
                  value={draft.settings.username}
                  onChange={(username) => updateSettings({ username })}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Authentication</span>
                <Select
                  value={draft.settings.authenticator}
                  optionList={authenticatorOptions}
                  onChange={(authenticator) => updateSettings({ authenticator })}
                  className="w-full"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Warehouse</span>
                <Input
                  value={draft.settings.warehouse}
                  onChange={(warehouse) => updateSettings({ warehouse })}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Role</span>
                <Input
                  value={draft.settings.role}
                  onChange={(role) => updateSettings({ role })}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Default database</span>
                <Input
                  value={draft.settings.database}
                  onChange={(database) => updateSettings({ database })}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Default schema</span>
                <Input
                  value={draft.settings.schema}
                  onChange={(schema) => updateSettings({ schema })}
                />
              </label>
              {needsPassword && (
                <label className="space-y-1 text-sm">
                  <span className="font-medium">Password</span>
                  <Input
                    mode="password"
                    value={draft.secrets.password}
                    placeholder={draft.id ? "Leave blank to clear saved password" : ""}
                    onChange={(password) =>
                      setDraft((current) => ({
                        ...current,
                        secrets: { ...current.secrets, password },
                      }))
                    }
                  />
                </label>
              )}
              {needsPrivateKey && (
                <>
                  <label className="space-y-1 text-sm">
                    <span className="font-medium">Private-key path</span>
                    <Input
                      value={draft.settings.privateKeyPath}
                      onChange={(privateKeyPath) =>
                        updateSettings({ privateKeyPath })
                      }
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="font-medium">Key passphrase</span>
                    <Input
                      mode="password"
                      value={draft.secrets.privateKeyPass}
                      placeholder={
                        draft.id ? "Leave blank to clear saved passphrase" : ""
                      }
                      onChange={(privateKeyPass) =>
                        setDraft((current) => ({
                          ...current,
                          secrets: { ...current.secrets, privateKeyPass },
                        }))
                      }
                    />
                  </label>
                </>
              )}
            </div>
          ) : (
            <label className="block space-y-1 text-sm">
              <span className="font-medium">SQLite database file</span>
              <Input
                value={draft.settings.databasePath}
                onChange={(databasePath) => updateSettings({ databasePath })}
              />
            </label>
          )}

          <div className="flex gap-2">
            <Button disabled={!selectedId || busy} onClick={testProfile}>
              Test
            </Button>
            <Button disabled={!selectedId || busy} onClick={duplicateProfile}>
              Duplicate
            </Button>
            <Button
              disabled={!selectedId || busy}
              type="danger"
              onClick={deleteProfile}
            >
              Delete
            </Button>
          </div>
          <div className="text-xs text-gray-500">
            Profile settings persist locally for offline reopen. Passwords and
            passphrases are stored only through Electron secure storage.
          </div>
        </div>
      </div>
    </Modal>
  );
}
