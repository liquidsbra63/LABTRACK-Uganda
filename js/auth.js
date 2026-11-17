
const loginScreen = document.getElementById("loginScreen");
const dashboardScreen = document.getElementById("dashboardScreen");
const loginForm = document.getElementById("loginForm");
const loginMessage = document.getElementById("loginMessage");
const loginButton = document.getElementById("loginButton");
const logoutButton = document.getElementById("logoutButton");

function showLogin() {
  loginScreen.hidden = false;
  dashboardScreen.hidden = true;
}

function showDashboard() {
  loginScreen.hidden = true;
  dashboardScreen.hidden = false;
}

// Login using Supabase Authentication
loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = document.getElementById("loginEmail").value;
  const password = document.getElementById("loginPassword").value;

  loginMessage.textContent = "";
  loginButton.disabled = true;
  loginButton.textContent = "Signing in...";

  try {
    const { error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      loginMessage.textContent = error.message;
      return;
    }

    loginForm.reset();

  } catch (error) {
    loginMessage.textContent =
      "Unable to connect. Please try again.";
    console.error("Login error:", error);

  } finally {
    loginButton.disabled = false;
    loginButton.textContent = "Login";
  }
});

// Logout
logoutButton.addEventListener("click", async () => {
  logoutButton.disabled = true;

  try {
    const { error } = await supabaseClient.auth.signOut();

    if (error) {
      console.error("Logout error:", error);
      alert("Logout failed. Please try again.");
    }

  } catch (error) {
    console.error("Logout error:", error);
    alert("Unable to log out. Please try again.");

  } finally {
    logoutButton.disabled = false;
  }
});


async function loadStaffRole(userId) {
  const roleElement = document.getElementById("userRole");
  const exportButton = document.getElementById("exportCSV");

  roleElement.textContent = "Checking role...";
  exportButton.hidden = true;

  const { data, error } = await supabaseClient
    .from("staff_profiles")
    .select("full_name, role")
    .eq("user_id", userId)
    .single();

  // Ignore results if the user logged out during the request
  const { data: sessionData } =
    await supabaseClient.auth.getSession();

  if (sessionData.session?.user.id !== userId) {
    return;
  }

  if (error || !data) {
    console.error("Staff role lookup failed:", error);
    roleElement.textContent = "Role unavailable";
    return;
  }

  if (!["manager", "technologist"].includes(data.role)) {
    roleElement.textContent = "Unrecognized role";
    return;
  }

  const roleLabel =
    data.role === "manager"
      ? "Laboratory Manager"
      : "Laboratory Technologist";

  roleElement.textContent =
    `${data.full_name} | ${roleLabel}`;

  // UI convenience only; not a security boundary
  exportButton.hidden = data.role !== "manager";
}


// Respond to authentication changes

supabaseClient.auth.onAuthStateChange((event, session) => {
  if (session) {
    showDashboard();

    // Defer the database request until the callback returns
    setTimeout(() => {
      loadStaffRole(session.user.id);
    }, 0);

  } else {
    showLogin();

    document.getElementById("userRole").textContent = "";
    document.getElementById("exportCSV").hidden = true;
  }
});


// Check whether the user is already logged in
async function initializeAuthentication() {
  const { data, error } = await supabaseClient.auth.getUser();

  if (error || !data.user) {
    showLogin();
  } else {
    showDashboard();
    await loadStaffRole(data.user.id);
  }
}

initializeAuthentication();
