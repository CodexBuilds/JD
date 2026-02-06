import {
  STATUS_OPTIONS,
  parseApplicationFromMessage,
} from "./applicationLogic.js";

const SCOPES = "https://www.googleapis.com/auth/gmail.readonly";
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
const companyOverrides = new Map();
const roleOverrides = new Map();

const setStatusMessage = (message) => {
  statusMessage.textContent = message;
};

const escapeAttr = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

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

const renderTable = (applications) => {
  if (!applications.length) {
    applicationsBody.innerHTML = `
      <tr>
        <td colspan="5" class="empty-state">No confirmed job application emails found in Gmail yet.</td>
      </tr>
    `;
    applicationCount.textContent = "0 applications loaded";
    return;
  }

  applicationCount.textContent = `${applications.length} applications loaded`;
  applicationsBody.innerHTML = "";

  applications.forEach((application) => {
    const row = document.createElement("tr");
    const companyValue = companyOverrides.get(application.id) || application.company;
    const roleValue = roleOverrides.get(application.id) || application.role;
    const statusValue = statusOverrides.get(application.id) || application.status;

    row.innerHTML = `
      <td>
        <input class="edit-input" aria-label="Edit company name" placeholder="Company" data-type="company" data-id="${escapeAttr(application.id)}" value="${escapeAttr(companyValue)}" />
      </td>
      <td>
        <input class="edit-input" aria-label="Edit role name" placeholder="Role" data-type="role" data-id="${escapeAttr(application.id)}" value="${escapeAttr(roleValue)}" />
      </td>
      <td>
        <select class="status-select" data-id="${escapeAttr(application.id)}">
          ${STATUS_OPTIONS.map(
            (status) =>
              `<option value="${status}" ${
                status === statusValue ? "selected" : ""
              }>${status}</option>`
          ).join("")}
        </select>
      </td>
      <td>${escapeAttr(application.subject)}</td>
      <td>${escapeAttr(application.date)}</td>
    `;

    applicationsBody.appendChild(row);
  });

  applicationsBody.querySelectorAll(".status-select").forEach((selectElement) => {
    selectElement.addEventListener("change", (event) => {
      statusOverrides.set(event.target.dataset.id, event.target.value);
    });
  });

  applicationsBody.querySelectorAll(".edit-input").forEach((inputElement) => {
    inputElement.addEventListener("input", (event) => {
      const id = event.target.dataset.id;
      const value = event.target.value;
      if (event.target.dataset.type === "company") {
        companyOverrides.set(id, value);
      }
      if (event.target.dataset.type === "role") {
        roleOverrides.set(id, value);
      }
    });
  });
};

const fetchMessages = async () => {
  const query = encodeURIComponent(
    "(\"thank you for applying\" OR \"thanks for applying\" OR \"application received\" OR \"under review\" OR \"thanks for filling in this form\")"
  );

  const listResponse = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=75&q=${query}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!listResponse.ok) {
    throw new Error("Unable to list Gmail messages.");
  }

  const listResult = await listResponse.json();
  const messageIds = listResult.messages || [];

  const messages = await Promise.all(
    messageIds.map(async ({ id }) => {
      const response = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!response.ok) {
        return null;
      }
      return response.json();
    })
  );

  return messages.map(parseApplicationFromMessage).filter(Boolean);
};

const loadApplications = async () => {
  setStatusMessage("Loading confirmed job applications from Gmail...");
  refreshButton.disabled = true;
  try {
    const applications = await fetchMessages();
    renderTable(applications);
    setStatusMessage(
      applications.length
        ? "Applications loaded successfully."
        : "Connected, but no confirmed application emails matched the rules yet."
    );
  } catch {
    setStatusMessage(
      "Could not load Gmail messages. Check Gmail API enablement, OAuth setup, and scopes."
    );
  } finally {
    refreshButton.disabled = false;
  }
};

const initializeGoogleIdentityIfReady = () => {
  if (window.google?.accounts?.oauth2) {
    isGoogleIdentityLoaded = true;
    updateConnectButtonState();
    setStatusMessage("Google Identity loaded. Enter your Client ID and connect Gmail.");
  }
};

connectButton.addEventListener("click", () => {
  if (!isGoogleIdentityLoaded) {
    setStatusMessage("Google Identity is still loading. Please retry in a few seconds.");
    return;
  }

  const clientId = clientIdInput.value.trim();
  persistClientId(clientId);

  if (!clientId) {
    setStatusMessage("Please enter a Google OAuth Client ID first.");
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
      refreshButton.disabled = false;
      disconnectButton.disabled = false;
      setStatusMessage("Gmail connected.");
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
setStatusMessage(
  "Loading Google Identity services... Enter your Google OAuth Client ID in the input above."
);

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
      "Could not load Google Identity script. Disable blockers or check network, then refresh."
    );
  }
}, 3000);
