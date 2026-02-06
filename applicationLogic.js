export const STATUS_OPTIONS = ["applied", "screening", "selected", "rejected"];

const SUBJECT_CONFIRMATION_PATTERNS = [
  /thank\s+you\s+for\s+applying(?:\s+(?:to|with)\s+.+)?/i,
  /thanks\s+for\s+applying(?:\s+(?:to|with)\s+.+)?/i,
  /application\s+(?:received|submitted)/i,
  /application\s+is\s+under\s+review/i,
  /thanks\s+for\s+filling\s+in\s+this\s+form/i,
];

const BODY_CONFIRMATION_PATTERNS = [
  /thank\s+you\s+for\s+applying/i,
  /your\s+application\s+has\s+been\s+received/i,
  /your\s+application\s+is\s+under\s+review/i,
  /we\s+will\s+contact\s+you\s+if\s+your\s+profile\s+matches\s+the\s+role/i,
  /we\s+will\s+review\s+your\s+application/i,
];

const NON_APPLICATION_PATTERNS = [
  /how\s+to\s+become\s+a\s+top\s+\d+(?:\.\d+)?%\s+applicant/i,
  /ultimate\s+guide\s+to\s+cold\s+email/i,
  /set\s+yourself\s+apart/i,
  /newsletter/i,
  /job\s+tips/i,
  /career\s+advice/i,
];

const cleanupText = (value) =>
  value
    .replace(/\s+/g, " ")
    .replace(/[\s:|,-]+$/, "")
    .trim();

export const inferStatus = (text = "") => {
  const normalized = text.toLowerCase();

  if (normalized.includes("interview") || normalized.includes("screen")) {
    return "screening";
  }

  if (normalized.includes("offer") || normalized.includes("congratulations")) {
    return "selected";
  }

  if (
    normalized.includes("unfortunately") ||
    normalized.includes("rejected") ||
    normalized.includes("not moving forward")
  ) {
    return "rejected";
  }

  return "applied";
};

export const isJobApplicationEmail = ({ subject = "", snippet = "", bodyText = "" }) => {
  const subjectText = subject || "";
  const fullText = `${subject} ${snippet} ${bodyText}`;

  if (NON_APPLICATION_PATTERNS.some((pattern) => pattern.test(subjectText))) {
    return false;
  }

  if (SUBJECT_CONFIRMATION_PATTERNS.some((pattern) => pattern.test(subjectText))) {
    return true;
  }

  return BODY_CONFIRMATION_PATTERNS.some((pattern) => pattern.test(fullText));
};

export const extractCompany = ({ subject = "", snippet = "", bodyText = "" }) => {
  const combined = `${subject} ${snippet} ${bodyText}`;

  const patterns = [
    /thanks?\s+for\s+applying\s+(?:to|with)\s+([^|\-:]+)/i,
    /thank\s+you\s+for\s+applying\s+(?:to|with)\s+([^|\-:]+)/i,

    // ✅ FIXED — do NOT truncate at letter x
    /thanks?\s+for\s+filling\s+in\s+this\s+form:\s*([^\n]+)/i,

    /application\s+(?:to|with|at)\s+([^|\-:]+)/i,
    /\b(?:at|from)\s+([A-Z][A-Za-z0-9&\-.\s]{2,40})/,
    /^([^|\-:]+)\s*[-|:]/,
  ];

  for (const pattern of patterns) {
    const match = combined.match(pattern);
    if (match?.[1]) {
      return cleanupText(match[1]);
    }
  }

  return "Unknown Company";
};

export const extractRole = ({ subject = "", snippet = "", bodyText = "" }) => {
  const combined = `${subject} ${snippet} ${bodyText}`;

  const patterns = [
    /(?:for|as)\s+(?:the\s+)?([A-Za-z][A-Za-z0-9\-/\s]{2,50})\s+(?:role|position)/i,
    /application\s+(?:for|to)\s+([A-Za-z][A-Za-z0-9\-/\s]{2,50})/i,
    /role\s*[:\-]\s*([A-Za-z][A-Za-z0-9\-/\s]{2,50})/i,
  ];

  for (const pattern of patterns) {
    const match = combined.match(pattern);
    if (match?.[1]) {
      return cleanupText(match[1]);
    }
  }

  return "Unknown Role";
};

const decodeBase64Url = (value) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return atob(padded);
};

const collectPlainTextParts = (payload) => {
  if (!payload) return [];

  const chunks = [];

  if (payload.mimeType === "text/plain" && payload.body?.data) {
    chunks.push(decodeBase64Url(payload.body.data));
  }

  if (Array.isArray(payload.parts)) {
    payload.parts.forEach((part) =>
      chunks.push(...collectPlainTextParts(part))
    );
  }

  return chunks;
};

const getHeader = (headers = [], name) =>
  headers.find(
    (item) => item.name?.toLowerCase() === name.toLowerCase()
  )?.value || "";

export const parseApplicationFromMessage = (message) => {
  if (!message?.payload) return null;

  const headers = message.payload.headers || [];
  const subject = getHeader(headers, "Subject");
  const dateHeader = getHeader(headers, "Date");
  const snippet = message.snippet || "";
  const bodyText = collectPlainTextParts(message.payload).join(" ");

  if (!isJobApplicationEmail({ subject, snippet, bodyText })) {
    return null;
  }

  const combined = `${subject} ${snippet} ${bodyText}`;

  return {
    id: message.id,
    company: extractCompany({ subject, snippet, bodyText }),
    role: extractRole({ subject, snippet, bodyText }),
    subject: subject || "(No subject)",
    date: dateHeader
      ? new Date(dateHeader).toLocaleDateString()
      : "Unknown",
    status: inferStatus(combined),
  };
};
