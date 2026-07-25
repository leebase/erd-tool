import { Upload, Checkbox, Banner, Tabs, TabPane } from "@douyinfe/semi-ui";
import { STATUS } from "../../../data/constants";
import { useTranslation } from "react-i18next";
import CodeEditor from "../../CodeEditor";

export default function ImportSource({
  importData,
  setImportData,
  error,
  setError,
  sourceFormat = "sql",
}) {
  const { t } = useTranslation();
  const isTerraform = sourceFormat === "terraform";
  const updateSource = (value) => {
    setImportData((prev) => ({ ...prev, src: value }));
    setError({
      type: STATUS.NONE,
      message: "",
    });
  };
  const readFile = ({ file, fileList }) => {
    const f = fileList[0].fileInstance;
    if (!f) {
      return;
    }
    const reader = new FileReader();
    reader.onload = async (e) => {
      setImportData((prev) => ({ ...prev, src: e.target.result }));
    };
    reader.readAsText(f);

    return {
      autoRemove: false,
      fileInstance: file.fileInstance,
      status: "success",
      shouldUpload: false,
    };
  };

  return (
    <div>
      <Tabs>
        <TabPane
          tab={isTerraform ? "Insert Terraform HCL" : t("insert_sql")}
          itemKey="text-import"
        >
          {isTerraform ? (
            <CodeEditor height={224} language="hcl" onChange={updateSource} />
          ) : (
            <CodeEditor height={224} language="sql" onChange={updateSource} />
          )}
        </TabPane>
        <TabPane tab={t("upload_file")} itemKey="file-import">
          {isTerraform ? (
            <Upload
              action="#"
              beforeUpload={readFile}
              draggable={true}
              dragMainText={t("drag_and_drop_files")}
              dragSubText="Upload Terraform HCL to generate diagrams"
              accept=".tf"
              onRemove={() => {
                setError({
                  type: STATUS.NONE,
                  message: "",
                });
                setImportData((prev) => ({ ...prev, src: "" }));
              }}
              onFileChange={() =>
                setError({
                  type: STATUS.NONE,
                  message: "",
                })
              }
              limit={1}
            />
          ) : (
            <Upload
              action="#"
              beforeUpload={readFile}
              draggable={true}
              dragMainText={t("drag_and_drop_files")}
              dragSubText={t("upload_sql_to_generate_diagrams")}
              accept=".sql"
              onRemove={() => {
                setError({
                  type: STATUS.NONE,
                  message: "",
                });
                setImportData((prev) => ({ ...prev, src: "" }));
              }}
              onFileChange={() =>
                setError({
                  type: STATUS.NONE,
                  message: "",
                })
              }
              limit={1}
            />
          )}
        </TabPane>
      </Tabs>

      <div className="mt-2">
        <Checkbox
          aria-label="overwrite checkbox"
          checked={importData.overwrite}
          onChange={(e) =>
            setImportData((prev) => ({
              ...prev,
              overwrite: e.target.checked,
            }))
          }
        >
          {t("overwrite_existing_diagram")}
        </Checkbox>
        <div className="mt-2">
          {error.type === STATUS.ERROR ? (
            <Banner
              type="danger"
              fullMode={false}
              description={<div>{error.message}</div>}
            />
          ) : error.type === STATUS.OK ? (
            <Banner
              type="info"
              fullMode={false}
              description={<div>{error.message}</div>}
            />
          ) : (
            error.type === STATUS.WARNING && (
              <Banner
                type="warning"
                fullMode={false}
                description={<div>{error.message}</div>}
              />
            )
          )}
        </div>
      </div>
    </div>
  );
}
