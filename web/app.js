import { LIMITS, inspectFiles, parseCap, makePlan } from "../src/core.js";

const $ = (id) => document.getElementById(id);
const jaStatic = Object.fromEntries(
  [...document.querySelectorAll("[data-i18n]")].map((node) => [
    node.dataset.i18n,
    node.innerText,
  ]),
);
jaStatic.capExplanation = "MB = 1,000,000 bytes\nMiB = 1,048,576 bytes";
jaStatic.marginNote = "名前からの推測は、\n最後に人が確かめる。";
const enStatic = {
  skip: "Skip to workspace",
  local: "Stays in your browser",
  heroA: "Small packages.",
  heroB: "Keep the story together.",
  heroDescription:
    "Keep originals and their sidecars together. Review the relationships, then pack each group into ZIPs that fit your exact byte limit.",
  factLocal: "No uploads",
  factStore: "Uncompressed ZIPs",
  factReceipt: "SHA-256 receipt",
  selectTitle: "Choose what goes in",
  selectPrompt: "Start with one selection.",
  selectHelp:
    "Folder-relative paths stay intact. A new selection replaces the previous one.",
  folderButton: "Choose a folder",
  filesButton: "Choose files",
  demoButton: "Try the synthetic demo first",
  limits: "Limits: 1,000 files · 128 MiB selected · 64 MiB per ZIP · 100 ZIPs",
  reset: "Reset",
  demoNotice:
    "Synthetic demo. Even the image-named files contain explanatory text, not real photographs or personal data.",
  reviewTitle: "Review what stays together",
  reviewDescription:
    "Only “original.ext” + “original.ext.xmp” are suggested as a pair. Similar-looking XMP names are never assigned automatically.",
  emptyReview: "Your selected files will appear here",
  emptyReviewHelp: "You can change every grouping before creating ZIPs.",
  filterLabel: "Filter by filename",
  fileLabel: "File / grouping",
  sizeLabel: "Source bytes",
  filterEmpty: "No files match this filter.",
  reviewConfirm: "I have reviewed all group assignments and exclusions",
  reviewConfirmHelp:
    "Explicitly keep alone, assign to a group, or exclude each unresolved file. All XMP decisions must be resolved before planning.",
  planTitle: "Plan first. Pack second.",
  emptyPlan: "Set a ZIP size cap, then create your plan",
  emptyPlanHelp: "Groups stay intact. ZIP headers count toward the limit too.",
  planNoCompression:
    "These are exact uncompressed ZIP byte sizes. The plan never relies on an assumed compression ratio.",
  generateButton: "Build ZIPs from this plan",
  cancelButton: "Cancel generation",
  downloadTitle: "Ready to take with you",
  downloadHelp: "Save each ZIP, then keep the receipt alongside them.",
  receiptButton: "Save the transfer receipt",
  downloadLifetime:
    "Changing any file, group, or cap discards the current plan and download links.",
  capTitle: "Maximum size per ZIP",
  capValueLabel: "Maximum size value",
  capUnitLabel: "Size unit",
  capExplanation: "MB = 1,000,000 bytes\nMiB = 1,048,576 bytes",
  capCaution:
    "This cap applies to the ZIP file itself. Email Base64 encoding and destination-provider limits are not included.",
  planButton: "Create ZIP plan",
  gateSelect: "Choose files to get started",
  trustTitle: "Organized here. Never uploaded.",
  trustBody:
    "Files are processed inside this browser. No accounts, uploads, or server processing.",
  warningEncryption:
    "ZIPs are not encrypted. Original file contents remain readable.",
  warningReceipt:
    "The receipt contains filenames, sizes, and hashes. Share it thoughtfully.",
  warningHash: "SHA-256 checks consistency, not the authenticity of a creator.",
  warningBackup:
    "Only selected files are included. This is not a complete-backup guarantee.",
  marginNote: "Names suggest a relationship.\nYou make the final call.",
  footer: "Keep relationships. Send smaller.",
  dialogTitle: "Where does this file belong?",
  dialogHelp:
    "Files assigned to the same group always stay in the same ZIP. File contents are not used to infer relationships.",
  groupAnchorLabel: "Add to an existing group",
  groupSave: "Assign to this group",
  or: "or",
  groupSingleton: "Keep as its own group",
  groupExclude: "Exclude from these ZIPs",
  dialogCaution:
    "Moving or excluding a group’s anchor makes its other files unresolved again, so you can review their relationships.",
  warningMetadata:
    "Metadata inside file contents stays intact. Original filesystem timestamps and permissions are not preserved.",
  warningMemory:
    "Generation uses memory. Start with smaller selections on low-memory devices.",
};
const messages = {
  ja: {
    selected: "{count}ファイルを選択 · 元データ合計 {bytes} bytes",
    included: "含める {count} · 除外 {excluded}",
    unresolved: "未確認のファイル：{count}",
    resolved: "すべての割り当てが確定しています",
    group: "同じ組",
    alone: "単独",
    needsReview: "要確認",
    excluded: "除外",
    excludedDetail: "今回のZIPには含めません",
    unresolvedDetail: "単独・組への割り当て・除外を選んでください",
    edit: "組を変更",
    editFile: "「{path}」の組を変更",
    gateSelect: "ファイルを選択すると始められます",
    gateResolve: "未確認の{count}ファイルを解決してください",
    gateReview: "すべての組を確認し、チェックしてください",
    gateCap: "上限の数値と単位を確認してください",
    gateInclude: "1ファイル以上を含めてください",
    gateReady: "組を分割せず、正確なサイズを計算します",
    capInvalid: "有効な整数バイトの上限を入力してください",
    capValueError: "数値だけを入力し、単位は右の選択肢で指定してください。",
    chooseGroup: "組を選んでください",
    noGroups: "他に既存の組はありません",
    changed: "組み合わせを変更しました。全体を確認してチェックしてください。",
    invalidated: "設定を変更したため、前の計画とダウンロードを破棄しました。",
    loaded: "{count}ファイルを読み込みました。組み合わせを確認してください。",
    reset: "ファイル、計画、ダウンロードをリセットしました。",
    planReady: "{count}個のZIPを計画しました。生成前に内訳を確認できます。",
    parts: "ZIPファイル",
    groups: "確認済みの組",
    outputBytes: "ZIPの合計 bytes",
    partMeta: "{count}ファイル · 上限まで {free} bytes",
    showFiles: "ファイルの内訳を見る",
    generating: "ファイルを読み込み、ハッシュとZIPを生成しています…",
    progress: "{completed} / {total}ファイルを処理",
    generated:
      "{count}個のZIPと受け渡し記録を生成しました。各リンクから保存してください。",
    cancelled: "生成を中止しました。出力は破棄され、同じ計画で再試行できます。",
    unavailable:
      "このブラウザではWorkerまたは安全な暗号処理が利用できません。HTTPSまたはlocalhostで、対応ブラウザをお使いください。",
    failure: "処理できませんでした：{error}",
    readFailure: "ファイルの読み込みに失敗しました。再選択してお試しください。",
    groupReset:
      "組の基準を変更したため、同じ組の{count}ファイルを未確認に戻しました。",
    demoLoaded:
      "合成デモを読み込みました。上限は6,000 bytesです。未確認のXMPを解決してください。",
    allReviewed: "組み合わせの確認が完了しました。計画を作成できます。",
    reviewNeeded: "生成するには、すべての組み合わせを確認してください。",
    genericProgress: "ZIPを生成しています…",
    cancelledEdit: "設定が変更されたため、進行中の生成を中止しました。",
  },
  en: {
    selected: "{count} selected files · {bytes} source bytes",
    included: "{count} included · {excluded} excluded",
    unresolved: "{count} files need a decision",
    resolved: "All group assignments are resolved",
    group: "Together",
    alone: "Alone",
    needsReview: "Review",
    excluded: "Excluded",
    excludedDetail: "Not included in these ZIPs",
    unresolvedDetail: "Keep alone, assign to a group, or exclude",
    edit: "Change group",
    editFile: "Change group for “{path}”",
    gateSelect: "Choose files to get started",
    gateResolve: "Resolve the {count} undecided files",
    gateReview: "Review all groups and tick the checkbox",
    gateCap: "Check the cap value and unit",
    gateInclude: "Include at least one file",
    gateReady: "Exact ZIP sizes. Groups stay together.",
    capInvalid: "Enter a valid cap in whole bytes",
    capValueError:
      "Enter only a number; choose the unit in the adjacent field.",
    chooseGroup: "Choose a group",
    noGroups: "No other groups available",
    changed:
      "Grouping changed. Review all assignments and tick the checkbox again.",
    invalidated:
      "Settings changed. The previous plan and download links have been discarded.",
    loaded: "{count} files loaded. Review the group assignments.",
    reset: "Files, plan, and downloads have been reset.",
    planReady:
      "{count} ZIPs planned. You can review the contents before generating.",
    parts: "ZIP files",
    groups: "Reviewed groups",
    outputBytes: "Total ZIP bytes",
    partMeta: "{count} files · {free} bytes below cap",
    showFiles: "Show included files",
    generating: "Reading files and generating hashes and ZIPs…",
    progress: "{completed} / {total} files processed",
    generated:
      "{count} ZIPs and a receipt are ready. Save each using its download link.",
    cancelled:
      "Generation cancelled. Output discarded; you can retry the same plan.",
    unavailable:
      "Workers or secure cryptography are unavailable. Use a supported browser over HTTPS or localhost.",
    failure: "Could not complete: {error}",
    readFailure:
      "A file could not be read. Reselect the source files and try again.",
    groupReset:
      "The anchor changed, so {count} dependent files need a new decision.",
    demoLoaded:
      "Synthetic demo loaded with a 6,000-byte cap. Resolve the undecided XMP files to continue.",
    allReviewed: "Group review complete. You can now create the plan.",
    reviewNeeded: "Review every group before generating.",
    genericProgress: "Generating ZIPs…",
    cancelledEdit: "Settings changed, so the running generation was cancelled.",
  },
};

let lang = "ja";
let selected = [];
let entries = [];
let assignments = Object.create(null);
let selectedBytes = 0;
let plan = null;
let worker = null;
let revision = 0;
let objectURLs = [];
let editingPath = null;
let demo = false;
let latestStatus = null;
let progressState = null;
let output = null;

const number = (value) => Number(value).toLocaleString("en-US");
const t = (key, values = {}) =>
  (messages[lang][key] || key).replace(/\{(\w+)\}/g, (_, name) =>
    String(values[name] ?? ""),
  );
const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
function status(key, values) {
  latestStatus = { key, values };
  $("live-status").textContent = t(key, values);
}
function clearError() {
  $("error-message").hidden = true;
  $("error-message").textContent = "";
}
function showError(error) {
  latestStatus = null;
  $("live-status").textContent = "";
  $("error-message").textContent = t("failure", {
    error: error instanceof Error ? error.message : String(error),
  });
  $("error-message").hidden = false;
  $("error-message").tabIndex = -1;
  $("error-message").focus();
}
function revokeDownloads() {
  for (const url of objectURLs) URL.revokeObjectURL(url);
  objectURLs = [];
  output = null;
  $("download-list").replaceChildren();
  $("receipt-download").removeAttribute("href");
  $("download-content").hidden = true;
}
function stopWorker() {
  if (worker) worker.terminate();
  worker = null;
  progressState = null;
  $("generation-progress").hidden = true;
  $("cancel-button").hidden = true;
}
function invalidate({ review = false, announce = true } = {}) {
  const wasRunning = Boolean(worker);
  const hadOutput = Boolean(plan || output);
  revision += 1;
  stopWorker();
  revokeDownloads();
  plan = null;
  if (review) $("review-confirm").checked = false;
  $("plan-content").hidden = true;
  $("plan-empty").hidden = false;
  clearError();
  if (announce && (wasRunning || hadOutput))
    status(wasRunning ? "cancelledEdit" : "invalidated");
}
function capBytes() {
  const input = $("cap-value").value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(input)) throw new Error(t("capValueError"));
  return parseCap(input, $("cap-unit").value);
}
function counts() {
  let excluded = 0,
    unresolved = 0;
  for (const entry of entries) {
    if (assignments[entry.path] === null) excluded++;
    else if (assignments[entry.path] === undefined) unresolved++;
  }
  return {
    excluded,
    unresolved,
    included: entries.length - excluded - unresolved,
  };
}
function updateGate() {
  const count = counts();
  let validCap = true;
  try {
    $("cap-exact").textContent = `${number(capBytes())} bytes`;
    $("cap-exact").classList.remove("invalid");
    $("cap-value").removeAttribute("aria-invalid");
  } catch (error) {
    validCap = false;
    $("cap-exact").textContent = t("capInvalid");
    $("cap-exact").classList.add("invalid");
    $("cap-value").setAttribute("aria-invalid", "true");
  }
  const key = !entries.length
    ? "gateSelect"
    : count.unresolved
      ? "gateResolve"
      : !count.included
        ? "gateInclude"
        : !$("review-confirm").checked
          ? "gateReview"
          : !validCap
            ? "gateCap"
            : "gateReady";
  $("plan-gate").textContent = t(key, { count: count.unresolved });
  $("plan-button").disabled = key !== "gateReady" || Boolean(worker);
  $("review-confirm").disabled =
    !entries.length || count.unresolved > 0 || count.included === 0;
  $("generate-button").disabled =
    !plan || Boolean(worker) || !$("review-confirm").checked;
  $("reset-button").disabled = !entries.length && !worker && !plan;
}
function renderFiles() {
  const count = counts();
  const hasFiles = entries.length > 0;
  $("file-count").textContent = `${number(entries.length)} FILES`;
  $("review-empty").hidden = hasFiles;
  $("review-content").hidden = !hasFiles;
  $("selection-summary").hidden = !hasFiles;
  $("demo-notice").hidden = !demo;
  $("selection-summary").replaceChildren(
    element(
      "strong",
      "",
      t("selected", {
        count: number(entries.length),
        bytes: number(selectedBytes),
      }),
    ),
    element(
      "span",
      "muted",
      t("included", {
        count: number(count.included),
        excluded: number(count.excluded),
      }),
    ),
  );
  $("review-state").textContent = t(
    count.unresolved ? "unresolved" : "resolved",
    { count: count.unresolved },
  );
  $("review-state").classList.toggle("ready", !count.unresolved);
  const filter = $("file-filter").value.toLocaleLowerCase();
  const groupCounts = new Map();
  for (const entry of entries) {
    const group = assignments[entry.path];
    if (typeof group === "string")
      groupCounts.set(group, (groupCounts.get(group) || 0) + 1);
  }
  const fragment = document.createDocumentFragment();
  let shown = 0;
  for (const [index, entry] of entries.entries()) {
    if (filter && !entry.path.toLocaleLowerCase().includes(filter)) continue;
    shown++;
    const group = assignments[entry.path];
    const row = element("li", `file-row${group === null ? " excluded" : ""}`);
    row.dataset.path = entry.path;
    row.dataset.assignment =
      group === undefined ? "unresolved" : group === null ? "excluded" : group;
    row.append(
      element("span", "file-name", entry.path),
      element("span", "file-size", `${number(entry.size)} bytes`),
    );
    const groupLine = element("div", "file-group");
    const kind =
      group === undefined
        ? "needsReview"
        : group === null
          ? "excluded"
          : groupCounts.get(group) === 1
            ? "alone"
            : "group";
    const badge = element(
      "span",
      `file-group-label${group === undefined ? " unresolved" : group === null ? " excluded" : ""}`,
      t(kind),
    );
    const detail =
      group === undefined
        ? t("unresolvedDetail")
        : group === null
          ? t("excludedDetail")
          : groupCounts.get(group) === 1
            ? ""
            : group;
    groupLine.append(badge, element("span", "", detail));
    const edit = element("button", "edit-group", `${t("edit")} ↗`);
    edit.type = "button";
    edit.dataset.editIndex = String(index);
    edit.setAttribute("aria-label", t("editFile", { path: entry.path }));
    row.append(groupLine, edit);
    fragment.append(row);
  }
  $("file-list").replaceChildren(fragment);
  $("filter-empty").hidden = shown > 0 || !hasFiles;
  updateGate();
}
function loadFiles(files, isDemo = false, stripFolderRoot = false) {
  if (!files.length) return;
  invalidate({ review: true, announce: false });
  if ($("assignment-dialog").open) $("assignment-dialog").close();
  selected = [];
  entries = [];
  selectedBytes = 0;
  assignments = Object.create(null);
  demo = false;
  $("file-filter").value = "";
  try {
    const candidates = files.map((file) => ({
      path: file.webkitRelativePath || file.name,
      size: file.size,
      file,
    }));
    if (
      stripFolderRoot &&
      candidates.every((file) => file.path.includes("/"))
    ) {
      const root = candidates[0].path.split("/")[0] + "/";
      if (candidates.every((file) => file.path.startsWith(root)))
        for (const file of candidates) file.path = file.path.slice(root.length);
    }
    const inspected = inspectFiles(
      candidates.map(({ path, size }) => ({ path, size })),
    );
    selected = candidates;
    entries = inspected.entries;
    selectedBytes = inspected.totalBytes;
    demo = isDemo;
    for (const entry of entries)
      assignments[entry.path] =
        entry.suggestedGroup === null ? undefined : entry.suggestedGroup;
    status(isDemo ? "demoLoaded" : "loaded", { count: number(entries.length) });
  } catch (error) {
    showError(error);
  }
  renderFiles();
}
function demoFile(path, size) {
  const header = new TextEncoder().encode(
    `SIDECAR PACK SYNTHETIC DEMO\n${path}\nThis is test data, not a photograph or personal information.\n`,
  );
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i++) bytes[i] = header[i % header.length];
  const file = new File([bytes], path.split("/").at(-1), {
    type: "application/octet-stream",
    lastModified: 0,
  });
  Object.defineProperty(file, "webkitRelativePath", { value: path });
  return file;
}
function openGroup(index) {
  const entry = entries[index];
  if (!entry) return;
  editingPath = entry.path;
  $("dialog-file").textContent = entry.path;
  const anchors = entries.filter(
    (item) => item.path !== editingPath && assignments[item.path] === item.path,
  );
  const select = $("group-anchor");
  select.replaceChildren();
  const placeholder = element(
    "option",
    "",
    t(anchors.length ? "chooseGroup" : "noGroups"),
  );
  placeholder.value = "";
  select.append(placeholder);
  for (const anchor of anchors) {
    const option = element("option", "", anchor.path);
    option.value = anchor.path;
    select.append(option);
  }
  const current = assignments[editingPath];
  select.value =
    typeof current === "string" && current !== editingPath ? current : "";
  select.disabled = !anchors.length;
  $("group-save").disabled = !select.value;
  if (!$("assignment-dialog").open) $("assignment-dialog").showModal();
}
function assignGroup(target) {
  const path = editingPath;
  if (!path || !entries.some((entry) => entry.path === path)) return;
  if (
    typeof target === "string" &&
    target !== path &&
    assignments[target] !== target
  )
    return;
  invalidate({ review: true });
  let resetCount = 0;
  if (assignments[path] === path && target !== path) {
    for (const entry of entries)
      if (entry.path !== path && assignments[entry.path] === path) {
        assignments[entry.path] = undefined;
        resetCount++;
      }
  }
  assignments[path] = target;
  $("assignment-dialog").close();
  editingPath = null;
  renderFiles();
  status(resetCount ? "groupReset" : "changed", { count: resetCount });
  $("file-list")
    .querySelector(
      `[data-edit-index="${entries.findIndex((entry) => entry.path === path)}"]`,
    )
    ?.focus();
}
function renderPlan() {
  $("plan-content").hidden = !plan;
  $("plan-empty").hidden = Boolean(plan);
  if (!plan) return;
  const stats = [
    [plan.parts.length, "parts"],
    [plan.groups.length, "groups"],
    [plan.parts.reduce((sum, part) => sum + part.size, 0), "outputBytes"],
  ];
  $("plan-summary").replaceChildren(
    ...stats.map(([value, label]) => {
      const stat = element("div", "plan-stat");
      stat.append(
        element("strong", "", number(value)),
        element("span", "", t(label)),
      );
      return stat;
    }),
  );
  $("part-list").replaceChildren(
    ...plan.parts.map((part) => {
      const li = element("li", "part-item");
      li.dataset.partName = part.name;
      li.dataset.partSize = String(part.size);
      const top = element("div", "part-top");
      top.append(
        element("span", "part-name", part.name),
        element(
          "span",
          "part-size",
          `${number(part.size)} / ${number(plan.capBytes)} bytes`,
        ),
      );
      const meter = element("div", "part-meter");
      meter.setAttribute("aria-hidden", "true");
      const fill = element("span");
      fill.style.width = `${(part.size / plan.capBytes) * 100}%`;
      meter.append(fill);
      const details = element("details");
      details.append(element("summary", "", t("showFiles")));
      const list = element("ul", "part-files");
      list.append(...part.files.map((file) => element("li", "", file.path)));
      details.append(list);
      li.append(
        top,
        meter,
        element(
          "p",
          "part-meta",
          t("partMeta", {
            count: part.files.length,
            free: number(plan.capBytes - part.size),
          }),
        ),
        details,
      );
      return li;
    }),
  );
  updateGate();
}
function createPlan() {
  clearError();
  if (!$("review-confirm").checked || counts().unresolved) {
    showError(new Error(t("reviewNeeded")));
    return;
  }
  invalidate({ announce: false });
  try {
    plan = makePlan(
      selected.map(({ path, size }) => ({ path, size })),
      assignments,
      capBytes(),
    );
    renderPlan();
    status("planReady", { count: plan.parts.length });
  } catch (error) {
    showError(error);
    updateGate();
  }
}
function renderProgress() {
  if (!worker) return;
  $("generation-progress").hidden = false;
  const value = progressState;
  if (
    value &&
    Number.isFinite(value.completed) &&
    Number.isFinite(value.total) &&
    value.total > 0
  ) {
    $("build-progress").max = value.total;
    $("build-progress").value = value.completed;
    $("progress-label").textContent = t("progress", {
      completed: value.completed,
      total: value.total,
    });
  } else {
    $("build-progress").removeAttribute("value");
    $("progress-label").textContent = t("generating");
  }
}
function renderDownloads() {
  if (!output) return;
  $("download-list").replaceChildren(
    ...output.archives.map((archive) => {
      const li = element("li");
      const link = element("a", "download-link");
      link.href = archive.url;
      link.download = archive.name;
      link.dataset.download = archive.name;
      link.append(
        element("span", "", archive.name),
        element("span", "", `${number(archive.size)} bytes ↓`),
      );
      li.append(link);
      return li;
    }),
  );
  $("receipt-download").href = output.receiptURL;
  $("download-content").hidden = false;
}
function build() {
  if (!plan || worker || !$("review-confirm").checked) return;
  clearError();
  revokeDownloads();
  if (typeof Worker === "undefined" || !globalThis.crypto?.subtle) {
    showError(new Error(t("unavailable")));
    return;
  }
  const token = ++revision;
  try {
    worker = new Worker(new URL("./worker.js", import.meta.url), {
      type: "module",
    });
    const activeWorker = worker;
    const failed = (error) => {
      if (token !== revision || worker !== activeWorker) return;
      stopWorker();
      revokeDownloads();
      showError(error);
      updateGate();
    };
    activeWorker.onmessage = ({ data }) => {
      if (
        token !== revision ||
        worker !== activeWorker ||
        data?.token !== token
      )
        return;
      if (data.type === "progress") {
        progressState = data.progress;
        renderProgress();
        return;
      }
      if (data.type === "error") {
        failed(new Error(data.message || t("readFailure")));
        return;
      }
      if (data.type !== "result") return;
      try {
        if (
          !Array.isArray(data.archives) ||
          data.archives.length !== plan.parts.length ||
          typeof data.receiptText !== "string"
        )
          throw new Error("Invalid worker result.");
        const archives = data.archives.map((archive, index) => {
          const expected = plan.parts[index];
          if (
            !(archive.bytes instanceof Uint8Array) ||
            archive.bytes.byteLength !== expected.size ||
            archive.name !== expected.name ||
            archive.size !== expected.size ||
            archive.size > plan.capBytes
          )
            throw new Error("Worker output does not match the verified plan.");
          const url = URL.createObjectURL(
            new Blob([archive.bytes], { type: "application/zip" }),
          );
          objectURLs.push(url);
          return { name: archive.name, size: archive.size, url };
        });
        const receiptURL = URL.createObjectURL(
          new Blob([data.receiptText], { type: "application/json" }),
        );
        objectURLs.push(receiptURL);
        output = { archives, receiptURL };
        stopWorker();
        renderDownloads();
        updateGate();
        status("generated", { count: archives.length });
      } catch (error) {
        failed(error);
      }
    };
    activeWorker.onerror = (event) => {
      event.preventDefault();
      failed(new Error(event.message || t("readFailure")));
    };
    activeWorker.onmessageerror = () =>
      failed(new Error("The worker result could not be read."));
    $("cancel-button").hidden = false;
    renderProgress();
    updateGate();
    status("generating");
    activeWorker.postMessage({
      type: "build",
      token,
      files: selected.map(({ path, file }) => ({ path, file })),
      assignments: { ...assignments },
      capBytes: plan.capBytes,
    });
  } catch (error) {
    stopWorker();
    revokeDownloads();
    showError(error);
    updateGate();
  }
}

$("select-folder").addEventListener("click", () => $("folder-input").click());
$("select-files").addEventListener("click", () => $("file-input").click());
for (const id of ["file-input", "folder-input"])
  $(id).addEventListener("change", (event) => {
    const files = [...event.target.files];
    event.target.value = "";
    loadFiles(files, false, id === "folder-input");
  });
$("load-demo").addEventListener("click", () => {
  $("cap-value").value = "0.006";
  $("cap-unit").value = "MB";
  loadFiles(
    [
      demoFile("demo/scene-001.jpg", 3072),
      demoFile("demo/scene-001.jpg.xmp", 450),
      demoFile("demo/scene-002.jpg", 3072),
      demoFile("demo/scene-002.xmp", 360),
      demoFile("demo/scene-002_01.xmp", 360),
      demoFile("demo/readme.txt", 760),
    ],
    true,
  );
});
$("reset-button").addEventListener("click", () => {
  invalidate({ review: true, announce: false });
  selected = [];
  entries = [];
  selectedBytes = 0;
  assignments = Object.create(null);
  demo = false;
  editingPath = null;
  $("file-input").value = "";
  $("folder-input").value = "";
  $("file-filter").value = "";
  $("cap-value").value = "20";
  $("cap-unit").value = "MiB";
  if ($("assignment-dialog").open) $("assignment-dialog").close();
  renderFiles();
  status("reset");
});
for (const id of ["cap-value", "cap-unit"])
  $(id).addEventListener(id === "cap-value" ? "input" : "change", () => {
    invalidate();
    updateGate();
  });
$("review-confirm").addEventListener("change", () => {
  invalidate({ announce: false });
  updateGate();
  status($("review-confirm").checked ? "allReviewed" : "reviewNeeded");
});
$("file-filter").addEventListener("input", renderFiles);
$("file-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-edit-index]");
  if (button) openGroup(Number(button.dataset.editIndex));
});
$("group-anchor").addEventListener("change", () => {
  $("group-save").disabled = !$("group-anchor").value;
});
$("group-save").addEventListener("click", () => {
  if ($("group-anchor").value) assignGroup($("group-anchor").value);
});
$("group-singleton").addEventListener("click", () => assignGroup(editingPath));
$("group-exclude").addEventListener("click", () => assignGroup(null));
$("assignment-dialog").addEventListener("close", () => {
  editingPath = null;
});
$("plan-button").addEventListener("click", createPlan);
$("generate-button").addEventListener("click", build);
$("cancel-button").addEventListener("click", () => {
  revision++;
  stopWorker();
  revokeDownloads();
  updateGate();
  status("cancelled");
});
$("language-toggle").addEventListener("click", () => {
  lang = lang === "ja" ? "en" : "ja";
  document.documentElement.lang = lang;
  for (const node of document.querySelectorAll("[data-i18n]"))
    node.textContent =
      (lang === "ja" ? jaStatic : enStatic)[node.dataset.i18n] ||
      jaStatic[node.dataset.i18n];
  $("language-toggle").replaceChildren(
    document.createTextNode(`${lang === "ja" ? "EN" : "日本語"} `),
    element("span", "", "↗"),
  );
  $("language-toggle").setAttribute(
    "aria-label",
    lang === "ja" ? "Switch to English" : "日本語に切り替える",
  );
  $("file-filter").placeholder =
    lang === "ja" ? "ファイル名で絞り込み" : "Filter by filename";
  document.title =
    lang === "ja"
      ? "Sidecar Pack · ファイルの関係ごと、ぴったり小分け。"
      : "Sidecar Pack · Small packages. Intact relationships.";
  renderFiles();
  renderPlan();
  renderProgress();
  renderDownloads();
  if (latestStatus)
    $("live-status").textContent = t(latestStatus.key, latestStatus.values);
  if ($("assignment-dialog").open && editingPath)
    openGroup(entries.findIndex((entry) => entry.path === editingPath));
});
window.addEventListener("pagehide", () => {
  const wasRunning = Boolean(worker);
  revision++;
  stopWorker();
  revokeDownloads();
  if (wasRunning) status("cancelled");
});
window.addEventListener("pageshow", updateGate);
renderFiles();

// Hard limits are displayed explicitly above; the shared core remains authoritative.
if (
  LIMITS.maxFiles !== 1000 ||
  LIMITS.maxTotalBytes !== 128 * 1024 * 1024 ||
  LIMITS.maxPartBytes !== 64 * 1024 * 1024 ||
  LIMITS.maxParts !== 100
)
  showError(new Error("UI limits do not match the packing engine."));
