import { useEffect, useMemo, useState } from "react";
import {
  Banner,
  Button,
  Modal,
  Select,
  Spin,
  Typography,
} from "@douyinfe/semi-ui";

import {
  connectDesktopSnowflake,
  disconnectDesktopSnowflake,
  listDesktopConnections,
  listDesktopSnowflakeDatabases,
  listDesktopSnowflakeSchemas,
  listDesktopSnowflakeTables,
  reverseEngineerDesktopSnowflake,
} from "../erdTool/desktopBridge";
import { layoutDiagram } from "../erdTool/elkLayout";
import { snowflakeMetadataToDiagram } from "../erdTool/snowflakeMetadata";

function messageFor(error, fallback) {
  return typeof error?.message === "string" && error.message.trim()
    ? error.message
    : fallback;
}

function selectOptions(items) {
  return items.map((item) => ({
    value: item.name,
    label: item.supported === false ? `${item.name} (unsupported identifier)` : item.name,
    disabled: item.supported === false,
  }));
}

export default function SnowflakeReverseEngineer({
  visible,
  onClose,
  onImport,
  readOnly,
}) {
  const [profiles, setProfiles] = useState([]);
  const [profileId, setProfileId] = useState("");
  const [session, setSession] = useState(null);
  const [databases, setDatabases] = useState([]);
  const [schemas, setSchemas] = useState([]);
  const [tables, setTables] = useState([]);
  const [database, setDatabase] = useState("");
  const [schema, setSchema] = useState("");
  const [selectedTables, setSelectedTables] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === profileId) ?? null,
    [profileId, profiles],
  );

  useEffect(() => {
    if (!visible) return undefined;
    let active = true;
    setError("");
    void listDesktopConnections()
      .then((foundProfiles) => {
        if (!active) return;
        const snowflakeProfiles = foundProfiles.filter(
          (profile) =>
            profile.provider === "snowflake" &&
            profile.capabilities?.reverseEngineering,
        );
        setProfiles(snowflakeProfiles);
        if (snowflakeProfiles.length) {
          setProfileId(snowflakeProfiles[0].id);
        }
      })
      .catch((profileError) => {
        if (active) {
          setError(messageFor(profileError, "Could not discover Snowflake profiles."));
        }
      });
    return () => {
      active = false;
    };
  }, [visible]);

  useEffect(() => {
    return () => {
      if (session?.sessionId) {
        void disconnectDesktopSnowflake(session.sessionId);
      }
    };
  }, [session]);

  const disconnect = async () => {
    if (session?.sessionId) {
      await disconnectDesktopSnowflake(session.sessionId).catch(() => {});
    }
    setSession(null);
    setDatabases([]);
    setSchemas([]);
    setTables([]);
    setDatabase("");
    setSchema("");
    setSelectedTables([]);
  };

  const close = async () => {
    await disconnect();
    setError("");
    onClose();
  };

  const loadTables = async (sessionId, selectedDatabase, selectedSchema) => {
    const foundTables = await listDesktopSnowflakeTables(
      sessionId,
      selectedDatabase,
      selectedSchema,
    );
    setTables(foundTables);
    setSelectedTables(
      foundTables.filter((table) => table.supported !== false).map((table) => table.name),
    );
  };

  const chooseSchema = async (selectedSchema) => {
    if (!session?.sessionId || !database || !selectedSchema) return;
    setBusy(true);
    setError("");
    try {
      setSchema(selectedSchema);
      await loadTables(session.sessionId, database, selectedSchema);
    } catch (selectionError) {
      setError(messageFor(selectionError, "Could not list Snowflake tables."));
    } finally {
      setBusy(false);
    }
  };

  const chooseDatabase = async (selectedDatabase) => {
    if (!session?.sessionId || !selectedDatabase) return;
    setBusy(true);
    setError("");
    try {
      setDatabase(selectedDatabase);
      setSchema("");
      setTables([]);
      setSelectedTables([]);
      const foundSchemas = await listDesktopSnowflakeSchemas(
        session.sessionId,
        selectedDatabase,
      );
      setSchemas(foundSchemas);
      const preferredSchema =
        foundSchemas.find(
          (item) =>
            item.name === selectedProfile?.settings?.schema &&
            item.supported !== false,
        ) ??
        foundSchemas.find((item) => item.name === "PUBLIC" && item.supported !== false) ??
        foundSchemas.find((item) => item.supported !== false);
      if (preferredSchema) {
        setSchema(preferredSchema.name);
        await loadTables(session.sessionId, selectedDatabase, preferredSchema.name);
      }
    } catch (selectionError) {
      setError(messageFor(selectionError, "Could not list Snowflake schemas."));
    } finally {
      setBusy(false);
    }
  };

  const connect = async () => {
    setBusy(true);
    setError("");
    try {
      const request = {
        mode: "savedProfile",
        profileId,
      };
      const connectedSession = await connectDesktopSnowflake(request);
      setSession(connectedSession);
      const foundDatabases = await listDesktopSnowflakeDatabases(
        connectedSession.sessionId,
      );
      setDatabases(foundDatabases);
      const preferredDatabase =
        foundDatabases.find(
          (item) =>
            item.name === selectedProfile?.settings?.database &&
            item.supported !== false,
        ) ?? foundDatabases.find((item) => item.supported !== false);
      if (preferredDatabase) {
        setDatabase(preferredDatabase.name);
        const foundSchemas = await listDesktopSnowflakeSchemas(
          connectedSession.sessionId,
          preferredDatabase.name,
        );
        setSchemas(foundSchemas);
        const preferredSchema =
          foundSchemas.find(
            (item) =>
              item.name === selectedProfile?.settings?.schema &&
              item.supported !== false,
          ) ??
          foundSchemas.find((item) => item.name === "PUBLIC" && item.supported !== false) ??
          foundSchemas.find((item) => item.supported !== false);
        if (preferredSchema) {
          setSchema(preferredSchema.name);
          await loadTables(
            connectedSession.sessionId,
            preferredDatabase.name,
            preferredSchema.name,
          );
        }
      }
    } catch (connectionError) {
      setSession(null);
      setError(messageFor(connectionError, "Could not connect to Snowflake."));
    } finally {
      setBusy(false);
    }
  };

  const importSelectedTables = async () => {
    if (!session?.sessionId || !database || !schema || !selectedTables.length) return;
    setBusy(true);
    setError("");
    try {
      const metadata = await reverseEngineerDesktopSnowflake({
        sessionId: session.sessionId,
        database,
        schema,
        tables: selectedTables,
      });
      const diagram = snowflakeMetadataToDiagram(metadata, {
        title: `${database}.${schema}`,
      });
      diagram.tables = await layoutDiagram(diagram.tables, diagram.relationships);
      const imported = await onImport(diagram);
      if (imported !== false) await close();
    } catch (importError) {
      setError(
        messageFor(importError, "Could not reverse engineer the selected Snowflake tables."),
      );
    } finally {
      setBusy(false);
    }
  };

  const primaryAction = session ? importSelectedTables : connect;
  const primaryDisabled = session
    ? readOnly || !database || !schema || selectedTables.length === 0
    : !profileId;

  return (
    <Modal
      title="Reverse Engineer Snowflake"
      visible={visible}
      onCancel={() => void close()}
      onOk={() => void primaryAction()}
      okText={session ? `Import ${selectedTables.length} Table${selectedTables.length === 1 ? "" : "s"}` : "Connect"}
      cancelText="Cancel"
      confirmLoading={busy}
      okButtonProps={{
        disabled: busy || primaryDisabled,
        "data-testid": session ? "snowflake-import-selected" : "snowflake-connect",
      }}
      width={760}
      centered
      maskClosable={false}
    >
      <div className="space-y-4" data-testid="snowflake-reverse-engineer-dialog">
        {error && (
          <Banner type="danger" fullMode={false} description={error} closeIcon={null} />
        )}

        {!session ? (
          <>
            {profiles.length > 0 && (
              <div className="grid grid-cols-1 gap-3">
                <label className="space-y-1 text-sm">
                  <span className="font-medium">Saved connection</span>
                  <Select
                    value={profileId}
                    onChange={setProfileId}
                    optionList={profiles.map((profile) => ({
                      value: profile.id,
                      label: profile.name,
                    }))}
                    className="w-full"
                  />
                </label>
              </div>
            )}

            {selectedProfile ? (
              <div className="rounded-md border border-gray-200 p-3 dark:border-gray-700">
                <div className="font-medium">
                  {selectedProfile.settings.account}
                </div>
                <div className="mt-1 text-sm text-gray-500">
                  {selectedProfile.settings.username} ·{" "}
                  {selectedProfile.settings.authenticator}
                  {selectedProfile.settings.warehouse
                    ? ` · ${selectedProfile.settings.warehouse}`
                    : ""}
                  {selectedProfile.settings.role
                    ? ` · ${selectedProfile.settings.role}`
                    : ""}
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-gray-200 p-4 text-sm text-gray-500 dark:border-gray-700">
                Add a Snowflake connection from the Connections menu before
                reverse engineering live metadata.
              </div>
            )}
            <Typography.Text type="tertiary" size="small">
              Saved connections live only behind Electron&apos;s main-process
              bridge. Passwords, keys, and session tokens are never stored in
              ERD project files.
            </Typography.Text>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-md bg-green-50 p-3 dark:bg-green-950/30">
              <div>
                <div className="font-medium text-green-800 dark:text-green-300">
                  Connected to {session.account}
                </div>
                <div className="text-sm text-green-700 dark:text-green-400">
                  {session.username}
                  {session.role ? ` · ${session.role}` : ""}
                  {session.warehouse ? ` · ${session.warehouse}` : ""}
                </div>
              </div>
              <Button theme="borderless" onClick={() => void disconnect()}>
                Disconnect
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 text-sm">
                <span className="font-medium">Database</span>
                <Select
                  value={database}
                  onChange={(value) => void chooseDatabase(value)}
                  optionList={selectOptions(databases)}
                  className="w-full"
                  filter
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Schema</span>
                <Select
                  value={schema}
                  onChange={(value) => void chooseSchema(value)}
                  optionList={selectOptions(schemas)}
                  className="w-full"
                  filter
                  disabled={!database}
                />
              </label>
            </div>

            <div className="rounded-md border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between border-b border-gray-200 p-3 dark:border-gray-700">
                <div className="font-medium">
                  Tables ({selectedTables.length} selected)
                </div>
                <div className="flex gap-2">
                  <Button
                    size="small"
                    theme="borderless"
                    onClick={() =>
                      setSelectedTables(
                        tables
                          .filter((table) => table.supported !== false)
                          .map((table) => table.name),
                      )
                    }
                  >
                    Select all
                  </Button>
                  <Button
                    size="small"
                    theme="borderless"
                    onClick={() => setSelectedTables([])}
                  >
                    Clear
                  </Button>
                </div>
              </div>
              <div className="max-h-64 overflow-auto p-2">
                {busy && !tables.length ? (
                  <div className="flex justify-center p-6">
                    <Spin />
                  </div>
                ) : tables.length ? (
                  <div className="grid grid-cols-2 gap-1">
                    {tables.map((table) => (
                      <label
                        key={table.name}
                        className={`flex items-start gap-2 rounded p-2 text-sm ${
                          table.supported === false
                            ? "cursor-not-allowed opacity-50"
                            : "cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedTables.includes(table.name)}
                          disabled={table.supported === false}
                          onChange={(event) =>
                            setSelectedTables((current) =>
                              event.target.checked
                                ? [...current, table.name]
                                : current.filter((name) => name !== table.name),
                            )
                          }
                        />
                        <span>
                          <span className="block font-medium">{table.name}</span>
                          {table.comment && (
                            <span className="block text-xs text-gray-500">
                              {table.comment}
                            </span>
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="p-6 text-center text-sm text-gray-500">
                    No supported permanent tables were found in this schema.
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
