const SCOPES = "https://www.googleapis.com/auth/gmail.readonly";
const STATUS_OPTIONS = ["applied", "screening", "selected", "rejected"];
const CLIENT_ID_STORAGE_KEY = "jobTrackerGoogleClientId";

const clientIdInput = document.getElementById("clientId");
const connectButton = document.getElementById("connectButton");
const refreshButton = document.getElementById("refreshButton");
const disconnectButton = document.getElementById("disconnectButton");
const statusMessage = document.getElementById("statusMessage");
const applicationCount = document.getElementById("applicationCount");
const applicationsBody = document.getElementById("applicationsBody");

let tokenClient;
let accessToken = "";
let isGoogleIdentityLoaded = false;
const statusOverrides = new Map();

const setStatusMessage = (message) => {
  statusMessage.textContent = message;
};

const updateConnectButtonState = () => {
  connectButton.disabled = !isGoogleIdentityLoaded;
};

const readClientIdFromSources = () => {
  const urlClientId = new URLSearchParams(window.location.search).get("client_id");
  if (urlClientId) {
    return urlClientId.trim();
  }

  return (localStorage.getItem(CLIENT_ID_STORAGE_KEY) || "").trim();
};

const persistClientId = (value) => {
  if (value) {
    localStorage.setItem(CLIENT_ID_STORAGE_KEY, value);
    return;
  }

  localStorage.removeItem(CLIENT_ID_STORAGE_KEY);
};

const decodeBase64Url = (value) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return atob(padded);
};

const inferStatus = (text) => {
  const normalized = text.toLowerCase();
  if (normalized.includes("interview") || normalized.includes("screen")) {
    return "screening";
  }
  if (
    normalized.includes("offer") ||
    normalized.includes("selected") ||
    normalized.includes("congratulations")
  ) {
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

const parseApplication = (message) => {
  const headers = message.payload.headers || [];
  const subject = headers.find((item) => item.name === "Subject")?.value || "";
  const dateHeader = headers.find((item) => item.name === "Date")?.value || "";
  const date = dateHeader ? new Date(dateHeader).toLocaleDateString() : "Unknown";
  const snippet = message.snippet || "";

  const combined = `${subject} ${snippet}`;
  const companyMatch =
    combined.match(/\b(?:at|from)\s+([A-Z][A-Za-z0-9&\-\.\s]{2,40})/i) ||
    subject.match(/^(.+?)\s*[-|:]/);
  const roleMatch =
    combined.match(/\b(?:for|as)\s+(?:the\s+)?([A-Za-z][A-Za-z0-9\-\/\s]{2,40})/i) ||
    subject.match(/application\s+(?:for|to)\s+(.+)/i);

  const company = companyMatch?.[1]?.trim() || "Unknown Company";
  const role = roleMatch?.[1]?.trim() || "Unknown Role";

  const payloadData = message.payload.parts?.find((part) => part.mimeType === "text/plain")
    ?.body?.data;
  const bodyText = payloadData ? decodeBase64Url(payloadData) : "";

  return {
    id: message.id,
    company,
    role,
    subject: subject || "(No subject)",
    date,
    status: inferStatus(`${subject} ${snippet} ${bodyText}`),
  };
};

const renderTable = (applications) => {
  if (!applications.length) {
    applicationsBody.innerHTML = `
      <tr>
        <td colspan="5" class="empty-state">No job application emails found in Gmail yet.</td>
      </tr>
    `;
    applicationCount.textContent = "0 applications loaded";
    return;
  }

  applicationCount.textContent = `${applications.length} applications loaded`;
  applicationsBody.innerHTML = "";

  applications.forEach((application) => {
    const row = document.createElement("tr");
    const statusValue = statusOverrides.get(application.id) || application.status;

    row.innerHTML = `
      <td>${application.company}</td>
      <td>${application.role}</td>
      <td>
        <select class="status-select" data-id="${application.id}">
          ${STATUS_OPTIONS.map(
            (status) =>
              `<option value="${status}" ${
                status === statusValue ? "selected" : ""
              }>${status}</option>`
          ).join("")}
        </select>
      </td>
      <td>${application.subject}</td>
      <td>${application.date}</td>
    `;
    applicationsBody.appendChild(row);
  });

  applicationsBody.querySelectorAll(".status-select").forEach((selectElement) => {
    selectElement.addEventListener("change", (event) => {
      const id = event.target.dataset.id;
      statusOverrides.set(id, event.target.value);
    });
  });
};

const fetchMessages = async () => {
  const listResponse = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=25&q=(job%20application%20OR%20application%20received%20OR%20thanks%20for%20applying)",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!listResponse.ok) {
    throw new Error("Unable to list Gmail messages.");
  }

  const listResult = await listResponse.json();
  const messageIds = listResult.messages || [];

  const messages = await Promise.all(
    messageIds.map(async ({ id }) => {
      const messageResponse = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!messageResponse.ok) {
        return null;
      }

      return messageResponse.json();
    })
  );

  return messages.filter(Boolean).map(parseApplication);
};

const loadApplications = async () => {
  setStatusMessage("Loading job applications from Gmail...");
  refreshButton.disabled = true;

  try {
    const applications = await fetchMessages();
    renderTable(applications);
    setStatusMessage("Applications loaded successfully.");
  } catch {
    setStatusMessage(
      "Could not load Gmail messages. Verify that Gmail API is enabled and OAuth Client ID is valid."
    );
  } finally {
    refreshButton.disabled = false;
  }
};

const initializeGoogleIdentityIfReady = () => {
  if (window.google?.accounts?.oauth2) {
    isGoogleIdentityLoaded = true;
    updateConnectButtonState();
    setStatusMessage("Google Identity loaded. Add your Client ID and connect Gmail.");
  }
};

connectButton.addEventListener("click", () => {
  if (!isGoogleIdentityLoaded) {
    setStatusMessage("Google Identity is still loading. Please wait a moment and retry.");
    return;
  }

  const clientId = clientIdInput.value.trim();
  persistClientId(clientId);
  if (!clientId) {
    setStatusMessage("Please add a Google OAuth Client ID first.");
    return;
  }

  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: SCOPES,
    callback: (tokenResponse) => {
      if (tokenResponse.error) {
        setStatusMessage(`OAuth error: ${tokenResponse.error}`);
        return;
      }

      accessToken = tokenResponse.access_token;
      setStatusMessage("Gmail connected.");
      refreshButton.disabled = false;
      disconnectButton.disabled = false;
      loadApplications();
    },
  });

  tokenClient.requestAccessToken({ prompt: "consent" });
});

refreshButton.addEventListener("click", () => {
  if (!accessToken) {
    setStatusMessage("Connect Gmail first.");
    return;
  }

  loadApplications();
});

disconnectButton.addEventListener("click", () => {
  accessToken = "";
  tokenClient = undefined;
  refreshButton.disabled = true;
  disconnectButton.disabled = true;
  applicationsBody.innerHTML = `
    <tr>
      <td colspan="5" class="empty-state">Connect Gmail to load your job applications.</td>
    </tr>
  `;
  applicationCount.textContent = "0 applications loaded";
  setStatusMessage("Disconnected from Gmail.");
});

const initialClientId = readClientIdFromSources();
if (initialClientId) {
  clientIdInput.value = initialClientId;
}

clientIdInput.addEventListener("input", () => {
  persistClientId(clientIdInput.value.trim());
});

updateConnectButtonState();
setStatusMessage("Loading Google Identity services... Enter your Google OAuth Client ID in the input box above.");

if (document.readyState === "complete") {
  initializeGoogleIdentityIfReady();
} else {
  window.addEventListener("load", initializeGoogleIdentityIfReady);
}

setTimeout(() => {
  if (!isGoogleIdentityLoaded) {
    initializeGoogleIdentityIfReady();
  }

  if (!isGoogleIdentityLoaded) {
    setStatusMessage(
      "Could not load Google Identity script. Disable ad blockers or check your internet connection, then refresh."
    );
  }
}, 3000);
