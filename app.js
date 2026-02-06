const SCOPES = "https://www.googleapis.com/auth/gmail.readonly";
const STATUS_OPTIONS = ["applied", "screening", "selected", "rejected"];
const CLIENT_ID_STORAGE_KEY = "jobTrackerGoogleClientId";

/* ---------------- PATTERNS ---------------- */

const SUBJECT_JOB_SIGNAL_PATTERNS = [
  /thank\s+you\s+for\s+applying/i,
  /thanks\s+for\s+applying\s+(?:to|with)?/i,
  /thank\s+you\s+for\s+applying\s+(?:to|with)?/i,
  /application\s+(?:received|submitted)/i,
  /under\s+review/i,
  /thanks\s+for\s+filling\s+in\s+this\s+form/i,
];

const BODY_JOB_SIGNAL_PATTERNS = [
  /thank\s+you\s+for\s+applying/i,
  /your\s+application\s+(?:is\s+)?(?:under\s+review|has\s+been\s+received)/i,
  /we\s+will\s+contact\s+you\s+if\s+your\s+profile\s+matches\s+the\s+role/i,
  /thanks\s+for\s+applying/i,
  /application\s+received/i,
  /under\s+review/i,
  /hiring\s+team/i,
  /profile\s+matches\s+the\s+role/i,
  /thank\s+you\s+for\s+filling\s+in\s+this\s+form/i,
];

const NON_APPLICATION_PATTERNS = [
  /how\s+to\s+become\s+a\s+top\s+\d+(?:\.\d+)?%\s+applicant/i,
  /ultimate\s+guide\s+to\s+cold\s+email/i,
  /set\s+yourself\s+apart/i,
  /newsletter/i,
  /job\s+tips/i,
  /career\s+advice/i,
];

/* ---------------- DOM ---------------- */

const clientIdInput = document.getElementById("clientId");
const connectButton = document.getElementById("connectButton");
const refreshButton = document.getElementById("refreshButton");
const disconnectButton = document.getElementById("disconnectButton");
const statusMessage = document.getElementById("statusMessage");
const applicationCount = document.getElementById("applicationCount");
const applicationsBody = document.getElementById("applicationsBody");

/* ---------------- STATE ---------------- */

let tokenClient;
let accessToken = "";
let isGoogleIdentityLoaded = false;
let isConnected = false;

const statusOverrides = new Map();
const companyOverrides = new Map();
const roleOverrides = new Map();

/* ---------------- HELPERS ---------------- */

const setStatusMessage = (m) => (statusMessage.textContent = m);

const decodeBase64Url = (value) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return atob(padded);
};

const hasPatternMatch = (patterns, text) =>
  patterns.some((pattern) => pattern.test(text));

/* ---------------- EMAIL DETECTION ---------------- */

const isJobApplicationEmail = ({ subject, snippet, bodyText }) => {
  const subjectText = subject || "";
  const summaryText = `${subject} ${snippet}`;
  const fullText = `${subject} ${snippet} ${bodyText}`;

  if (hasPatternMatch(NON_APPLICATION_PATTERNS, summaryText)) return false;
  if (hasPatternMatch(SUBJECT_JOB_SIGNAL_PATTERNS, subjectText)) return true;
  return hasPatternMatch(BODY_JOB_SIGNAL_PATTERNS, fullText);
};

/* ---------------- STATUS ---------------- */

const inferStatus = (text) => {
  const t = text.toLowerCase();
  if (t.includes("interview") || t.includes("screen")) return "screening";
  if (t.includes("offer") || t.includes("selected") || t.includes("congratulations"))
    return "selected";
  if (
    t.includes("unfortunately") ||
    t.includes("rejected") ||
    t.includes("not moving forward")
  )
    return "rejected";
  return "applied";
};

/* ---------------- BODY EXTRACT ---------------- */

const collectPlainTextParts = (payload) => {
  if (!payload) return [];
  const parts = [];

  if (payload.mimeType === "text/plain" && payload.body?.data) {
    parts.push(decodeBase64Url(payload.body.data));
  }

  if (Array.isArray(payload.parts)) {
    payload.parts.forEach((p) => parts.push(...collectPlainTextParts(p)));
  }

  return parts;
};

/* ---------------- PARSE MESSAGE ---------------- */

const parseApplicationFromMessage = (message) => {
  if (!message?.payload) return null;

  const headers = message.payload.headers || [];
  const subject = headers.find((h) => h.name === "Subject")?.value || "";
  const dateHeader = headers.find((h) => h.name === "Date")?.value || "";
  const date = dateHeader ? new Date(dateHeader).toLocaleDateString() : "Unknown";
  const snippet = message.snippet || "";
  const bodyText = collectPlainTextParts(message.payload).join(" ");

  if (!isJobApplicationEmail({ subject, snippet, bodyText })) return null;

  const combined = `${subject} ${snippet}`;

  const companyMatch =
    combined.match(/\b(?:at|from)\s+([A-Z][A-Za-z0-9&\-\.\s]{2,40})/i) ||
    subject.match(/^(.+?)\s*[-|:]/);

  const roleMatch =
    combined.match(/\b(?:for|as)\s+(?:the\s+)?([A-Za-z][A-Za-z0-9\-\/\s]{2,40})/i) ||
    subject.match(/application\s+(?:for|to)\s+(.+)/i);

  const company = companyMatch?.[1]?.trim() || "Unknown Company";
  const role = roleMatch?.[1]?.trim() || "Unknown Role";

  return {
    id: message.id,
    company,
    role,
    subject: subject || "(No subject)",
    date,
    status: inferStatus(`${subject} ${snippet} ${bodyText}`),
  };
};

/* ---------------- TABLE RENDER ---------------- */

const renderTable = (applications) => {
  if (!applications.length) {
    applicationsBody.innerHTML = `
      <tr>
        <td colspan="5" class="empty-state">
          No confirmed job application emails found in Gmail yet.
        </td>
      </tr>`;
    applicationCount.textContent = "0 applications loaded";
    return;
  }

  applicationCount.textContent = `${applications.length} applications loaded`;
  applicationsBody.innerHTML = "";

  applications.forEach((a) => {
    const row = document.createElement("tr");

    const statusValue = statusOverrides.get(a.id) || a.status;
    const companyValue = companyOverrides.get(a.id) || a.company;
    const roleValue = roleOverrides.get(a.id) || a.role;

    row.innerHTML = `
      <td><input class="edit-input" data-type="company" data-id="${a.id}" value="${companyValue.replace(/"/g, "&quot;")}" /></td>
      <td><input class="edit-input" data-type="role" data-id="${a.id}" value="${roleValue.replace(/"/g, "&quot;")}" /></td>
      <td>
        <select class="status-select" data-id="${a.id}">
          ${STATUS_OPTIONS.map(
            (s) => `<option value="${s}" ${s === statusValue ? "selected" : ""}>${s}</option>`
          ).join("")}
        </select>
      </td>
      <td>${a.subject}</td>
      <td>${a.date}</td>
    `;

    applicationsBody.appendChild(row);
  });
};

/* ---------------- FETCH ---------------- */

const fetchMessages = async () => {
  const listResponse = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=40&q=(job%20application%20OR%20application%20received%20OR%20thanks%20for%20applying%20OR%20under%20review)",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!listResponse.ok) throw new Error("Unable to list Gmail messages.");

  const listResult = await listResponse.json();
  const ids = listResult.messages || [];

  const messages = await Promise.all(
    ids.map(async ({ id }) => {
      const r = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!r.ok) return null;
      return r.json();
    })
  );

  return messages.filter(Boolean).map(parseApplicationFromMessage).filter(Boolean);
};

/* ---------------- LOAD ---------------- */

const loadApplications = async () => {
  setStatusMessage("Loading job applications from Gmail...");
  refreshButton.disabled = true;

  try {
    const apps = await fetchMessages();
    if (!isConnected) return;

    renderTable(apps);
    setStatusMessage(
      apps.length
        ? "Applications loaded successfully."
        : "Connected, but no emails matched the strict job-application phrases yet."
    );
  } catch {
    setStatusMessage(
      "Could not load Gmail messages. Verify Gmail API and OAuth Client ID."
    );
  } finally {
    refreshButton.disabled = false;
  }
};

