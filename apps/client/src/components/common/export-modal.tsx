import {
  Modal,
  Button,
  Group,
  Text,
  Select,
  Switch,
  Divider,
  Tooltip,
} from "@mantine/core";
import {
  exportPage,
  exportPageToDocx,
} from "@/features/page/services/page-service.ts";
import { useState } from "react";
import { ExportFormat } from "@/features/page/types/page.types.ts";
import { notifications } from "@mantine/notifications";
import { exportSpace } from "@/features/space/services/space-service";
import { getApiErrorMessage } from "@/lib/api-error";
import { useTranslation } from "react-i18next";
import { Feature } from "@/lt4/features";
import { useHasFeature } from "@/lt4/hooks/use-feature";
import { useUpgradeLabel } from "@/lt4/hooks/use-upgrade-label";
import { UpgradeBadge } from "@/lt4/components/upgrade-badge";

interface ExportModalProps {
  id: string;
  type: "space" | "page";
  open: boolean;
  onClose: () => void;
}

export default function ExportModal({
  id,
  type,
  open,
  onClose,
}: ExportModalProps) {
  const [format, setFormat] = useState<ExportFormat>(ExportFormat.Markdown);
  const [includeChildren, setIncludeChildren] = useState<boolean>(false);
  const [includeAttachments, setIncludeAttachments] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const { t } = useTranslation();
  const upgradeLabel = useUpgradeLabel();
  const isDocx = format === ExportFormat.Docx;
  // LT4: .lt4docs enthält Bilder und Dateien immer (für Client und Server-Import).
  const isLt4Docs = format === ExportFormat.Lt4Docs;
  const docxEntitled = useHasFeature(Feature.DOCX_EXPORT);
  const blockedByLicense = isDocx && !docxEntitled;

  const handleExport = async () => {
    setIsExporting(true);
    try {
      if (type === "page") {
        if (format === ExportFormat.Docx) {
          await exportPageToDocx({ pageId: id });
        } else {
          await exportPage({
            pageId: id,
            format,
            includeChildren,
            includeAttachments: isLt4Docs || includeAttachments,
          });
        }
      }
      if (type === "space") {
        await exportSpace({
          spaceId: id,
          format,
          includeAttachments: isLt4Docs || includeAttachments,
        });
      }
      notifications.show({
        message: t("Export successful"),
      });
      onClose();
    } catch (err) {
      notifications.show({
        message: getApiErrorMessage(err, t("Export failed")),
        color: "red",
      });
      console.error("export error", err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleChange = (format: ExportFormat) => {
    setFormat(format);
  };

  return (
    <Modal.Root
      opened={open}
      onClose={onClose}
      size={500}
      padding="xl"
      yOffset="10vh"
      xOffset={0}
      mah={400}
      onClick={(e) => e.stopPropagation()}
    >
      <Modal.Overlay />
      <Modal.Content style={{ overflow: "hidden" }}>
        <Modal.Header py={0}>
          <Modal.Title fw={500}>{t(`Export ${type}`)}</Modal.Title>
          <Modal.CloseButton aria-label={t("Close")} />
        </Modal.Header>
        <Modal.Body>
          <Group justify="space-between" wrap="nowrap">
            <div>
              <Text size="md">{t("Format")}</Text>
            </div>
            <ExportFormatSelection
              format={format}
              onChange={handleChange}
              includeDocx={type === "page"}
              docxEntitled={docxEntitled}
            />
          </Group>

          {type === "page" && !isDocx && (
            <>
              <Divider my="sm" />

              <Group justify="space-between" wrap="nowrap">
                <div>
                  <Text size="md">{t("Include subpages")}</Text>
                </div>
                <Switch
                  onChange={(event) =>
                    setIncludeChildren(event.currentTarget.checked)
                  }
                  checked={includeChildren}
                />
              </Group>

              {!isLt4Docs && (
              <Group justify="space-between" wrap="nowrap" mt="md">
                <div>
                  <Text size="md">{t("Include attachments")}</Text>
                </div>
                <Switch
                  onChange={(event) =>
                    setIncludeAttachments(event.currentTarget.checked)
                  }
                  checked={includeAttachments}
                />
              </Group>
              )}
            </>
          )}

          {type === "space" && !isLt4Docs && (
            <>
              <Divider my="sm" />

              <Group justify="space-between" wrap="nowrap">
                <div>
                  <Text size="md">{t("Include attachments")}</Text>
                </div>
                <Switch
                  onChange={(event) =>
                    setIncludeAttachments(event.currentTarget.checked)
                  }
                  checked={includeAttachments}
                />
              </Group>
            </>
          )}

          {isLt4Docs && (
            <Text size="sm" c="dimmed" mt="sm">
              {t(
                "Lossless format with images and files. Can be opened in the LT4-Docs app or imported on any LT4-Docs server.",
              )}
            </Text>
          )}

          <Group justify="center" mt="md">
            <Button onClick={onClose} variant="default">
              {t("Cancel")}
            </Button>
            <Tooltip label={upgradeLabel} disabled={!blockedByLicense} withArrow>
              <Button
                onClick={handleExport}
                loading={isExporting}
                disabled={blockedByLicense}
                data-disabled={blockedByLicense || undefined}
              >
                {t("Export")}
              </Button>
            </Tooltip>
          </Group>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}

interface ExportFormatSelection {
  format: ExportFormat;
  onChange: (value: string) => void;
  includeDocx?: boolean;
  docxEntitled?: boolean;
}
function ExportFormatSelection({
  format,
  onChange,
  includeDocx,
  docxEntitled,
}: ExportFormatSelection) {
  const { t } = useTranslation();

  const data = [
    { value: "markdown", label: "Markdown" },
    { value: "html", label: "HTML" },
    { value: "lt4docs", label: "LT4-Docs (.lt4docs)" },
    ...(includeDocx
      ? [{ value: "docx", label: "Word (.docx)", disabled: !docxEntitled }]
      : []),
  ];

  return (
    <Select
      data={data}
      defaultValue={format}
      onChange={onChange}
      styles={{ wrapper: { maxWidth: 140 }, option: { opacity: 1 } }}
      comboboxProps={{ width: 200 }}
      allowDeselect={false}
      withCheckIcon={false}
      aria-label={t("Select export format")}
      renderOption={({ option }) =>
        option.value === "docx" && !docxEntitled ? (
          <div>
            <Text size="sm" c="dimmed">
              {option.label}
            </Text>
            <UpgradeBadge mt={4} />
          </div>
        ) : (
          <Text size="sm">{option.label}</Text>
        )
      }
    />
  );
}
